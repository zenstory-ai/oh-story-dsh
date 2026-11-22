import { EventEmitter } from "node:events";
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type { FileSystem, FsDirEntry, FsInfo, FsPathInfo, FsTarget, FsVersion } from "@deepseek-ai/dsh-fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPreviewTokenSecret,
  mintPreviewToken,
  probeVideoPreflight,
  registerWorkspaceRoute,
  type WorkspacePayload
} from "../src/workspace-route.js";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

interface MockResponse {
  readonly status: number;
  readonly headers: Record<string, string | number>;
  readonly body: Buffer;
}

function makeLocalFs(rootDir: string, options: { readonly remote?: boolean; readonly readByteRangeSpy?: ReturnType<typeof vi.fn> } = {}): FileSystem {
  const resolveTarget = async (path: string, opts?: { readonly cwd?: string }): Promise<FsTarget> => {
    const joined = isAbsolute(path) ? resolve(path) : resolve(opts?.cwd ?? rootDir, path);
    const canonical = await realpath(joined).catch(() => joined);
    return { targetKey: canonical as FsTarget["targetKey"], displayPath: canonical };
  };
  const readByteRange = options.readByteRangeSpy ?? vi.fn(async (target: FsTarget, range: { offset: number; length: number }) => {
    const all = await readFile(target.displayPath);
    return all.subarray(range.offset, range.offset + range.length);
  });
  return {
    resolve: vi.fn(resolveTarget),
    processPath: (target: FsTarget) => options.remote === true ? `/nonexistent-remote-world${target.displayPath}` : target.displayPath,
    contains: (parent: FsTarget, child: FsTarget) => {
      const rel = relative(parent.displayPath, child.displayPath);
      return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
    },
    stat: vi.fn(async (target: FsTarget): Promise<FsInfo | undefined> => stat(target.displayPath).then((info) => ({
      version: `${String(info.size)}:${String(info.mtimeMs)}` as FsVersion,
      type: info.isFile() ? "file" : info.isDirectory() ? "directory" : "other",
      size: info.size
    }), () => undefined)),
    lstat: vi.fn(async (path: string, opts?: { readonly cwd?: string }): Promise<FsPathInfo | undefined> => {
      const joined = isAbsolute(path) ? resolve(path) : resolve(opts?.cwd ?? rootDir, path);
      return lstat(joined).then((info) => ({
        version: `${String(info.size)}:${String(info.mtimeMs)}` as FsVersion,
        type: info.isSymbolicLink() ? "symlink" : info.isFile() ? "file" : info.isDirectory() ? "directory" : "other",
        size: info.size
      }), () => undefined);
    }),
    listDir: vi.fn(async (target: FsTarget): Promise<FsDirEntry[]> => {
      const items = await readdir(target.displayPath, { withFileTypes: true });
      return Promise.all(items.map(async (entry): Promise<FsDirEntry> => {
        const childTarget = await resolveTarget(entry.name, { cwd: target.displayPath });
        const info = await stat(childTarget.displayPath).catch(() => undefined);
        return {
          name: entry.name,
          type: info?.isFile() ? "file" : info?.isDirectory() ? "directory" : "other",
          target: childTarget,
          ...(info === undefined ? {} : { size: info.size, version: `${String(info.size)}:${String(info.mtimeMs)}` as FsVersion })
        };
      }));
    }),
    readBytes: vi.fn(async (target: FsTarget) => readFile(target.displayPath)),
    readByteRange
  } as unknown as FileSystem;
}

function createHarness(
  cwd: string,
  fs: FileSystem,
  options: {
    readonly admit?: (request: { readonly headers: IncomingMessage["headers"] }) => { readonly peer: unknown } | { readonly rejection: 401 | 403 };
    readonly previewSecret?: Uint8Array;
  } = {}
) {
  let handler!: (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  const disposeSpy = vi.fn();
  const connection = options.admit === undefined ? undefined : { admit: vi.fn(options.admit) };
  const agent = {
    session: { header: { cwd } },
    ctx: {
      get: (key: string) => key === "fs" ? fs : key === "sandboxPolicy" ? { resolve: () => ({ mode: "workspace-write" }) } : undefined
    }
  };
  const context = {
    effect: (fn: () => () => void) => {
      const cleanup = fn();
      disposeSpy.mockImplementation(cleanup);
    },
    get: (key: string) => key === "connection" ? connection : undefined,
    logger: () => ({ error: vi.fn() }),
    typert: {
      lookups: new Map([["agent", { resolve: vi.fn(async (id: string) => id === "sess-1" ? agent : undefined) }]])
    },
    webServer: {
      register: (route: { readonly handler: typeof handler }) => {
        handler = route.handler;
        return vi.fn();
      }
    }
  } as unknown as Context;
  const previewSecret = options.previewSecret ?? createPreviewTokenSecret();
  registerWorkspaceRoute(context, { maxBytes: 1_048_576, previewTokenSecret: previewSecret });

  async function invoke(method: string, url: string, headers: Record<string, string> = {}): Promise<MockResponse> {
    const request = Object.assign(new EventEmitter(), {
      method,
      url,
      headers: { host: "127.0.0.1:3080", ...headers }
    }) as unknown as IncomingMessage;
    let status = 200;
    let responseHeaders: Record<string, string | number> = {};
    const chunks: Buffer[] = [];
    let resolveDone!: () => void;
    const done = new Promise<void>((accept) => { resolveDone = accept; });
    const emitter = new EventEmitter();
    const response = Object.assign(emitter, {
      writableEnded: false,
      destroyed: false,
      headersSent: false,
      writeHead(code: number, hdrs: Record<string, string | number> = {}) {
        status = code;
        responseHeaders = hdrs;
        this.headersSent = true;
        return this;
      },
      write(chunk: Buffer | string) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        return true;
      },
      end(chunk?: Buffer | string) {
        if (chunk !== undefined) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        this.writableEnded = true;
        emitter.emit("finish");
        emitter.emit("close");
        resolveDone();
        return this;
      }
    }) as unknown as ServerResponse;
    await handler(request, response);
    await done;
    return { status, headers: responseHeaders, body: Buffer.concat(chunks) };
  }

  return { invoke, previewSecret, connection, dispose: disposeSpy };
}

describe("workspace route security, media, scanning, and preflight", () => {
  it("gates /oh-story/* endpoints through DSH connection.admit()", async () => {
    const root = await mkdtemp(join(tmpdir(), "oh-story-route-auth-"));
    tempDirs.push(root);
    await mkdir(join(root, "正文"));
    await writeFile(join(root, "正文", "第001章.md"), "# 第一章\n");

    const harness = createHarness(root, makeLocalFs(root), {
      admit: (req) => req.headers.cookie === "dsh-auth=ok" ? { peer: {} } : { rejection: 401 }
    });

    const unauthedWorkspace = await harness.invoke("GET", "/oh-story/workspace?sessionId=sess-1");
    expect(unauthedWorkspace.status).toBe(401);
    const unauthedConfig = await harness.invoke("GET", "/oh-story/config");
    expect(unauthedConfig.status).toBe(401);

    const authedWorkspace = await harness.invoke("GET", "/oh-story/workspace?sessionId=sess-1", { cookie: "dsh-auth=ok" });
    expect(authedWorkspace.status).toBe(200);
    const payload = JSON.parse(authedWorkspace.body.toString("utf8")) as WorkspacePayload;
    expect(payload.truncated).toBe(false);
    expect(payload.files.map((file) => file.path)).toEqual(["正文/第001章.md"]);
  });

  it("serves signed-token game previews to opaque-origin iframes with HTML error bridge and Range 206 audio/video", async () => {
    const root = await mkdtemp(join(tmpdir(), "oh-story-route-preview-"));
    tempDirs.push(root);
    const appDir = join(root, "game-adaptations", "demo", "build", "app");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, "index.html"), "<!doctype html><html><head><title>Demo</title></head><body>OK</body></html>");
    await writeFile(join(appDir, "main.js"), "console.log('hi');");
    await writeFile(join(appDir, "bgm.wav"), Buffer.from("0123456789abcdef"));

    const harness = createHarness(root, makeLocalFs(root), {
      admit: (req) => req.headers.cookie === "dsh-auth=ok" ? { peer: {} } : { rejection: 401 }
    });

    // Unsigned or tampered tokens are rejected even with valid Host.
    const unsigned = await harness.invoke("GET", "/oh-story/game-preview/example/jin-ping-mei/index.html");
    expect(unsigned.status).toBe(403);

    // Mint previewUrl via authenticated /oh-story/workspace
    const ws = await harness.invoke("GET", "/oh-story/workspace?sessionId=sess-1", { cookie: "dsh-auth=ok" });
    const payload = JSON.parse(ws.body.toString("utf8")) as WorkspacePayload;
    const previewUrl = payload.games[0]?.previewUrl;
    expect(previewUrl).toBeDefined();

    // Opaque-origin sandboxed iframe loads index.html, module script, and ranged WAV without dsh-auth cookie.
    const htmlRes = await harness.invoke("GET", previewUrl!, {
      origin: "null",
      "sec-fetch-site": "cross-site"
    });
    expect(htmlRes.status).toBe(200);
    expect(htmlRes.body.toString("utf8")).toContain("oh-story:game-preview-error");
    expect(String(htmlRes.headers["content-security-policy"])).toContain("https://127.0.0.1:* https://localhost:*");

    const basePrefix = previewUrl!.slice(0, -"/index.html".length);
    const scriptRes = await harness.invoke("GET", `${basePrefix}/main.js`, {
      origin: "null",
      "sec-fetch-site": "cross-site",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "script"
    });
    expect(scriptRes.status).toBe(200);
    expect(scriptRes.body.toString("utf8")).toBe("console.log('hi');");

    const wavRange = await harness.invoke("GET", `${basePrefix}/bgm.wav`, {
      origin: "null",
      "sec-fetch-site": "cross-site",
      range: "bytes=4-9"
    });
    expect(wavRange.status).toBe(206);
    expect(wavRange.headers["content-type"]).toBe("audio/wav");
    expect(wavRange.headers["content-range"]).toBe("bytes 4-9/16");
    expect(wavRange.headers["content-security-policy"]).toBeDefined();
    expect(wavRange.body.toString("utf8")).toBe("456789");

    const wavHead = await harness.invoke("HEAD", `${basePrefix}/bgm.wav`, { origin: "null", "sec-fetch-site": "cross-site" });
    expect(wavHead.status).toBe(200);
    expect(wavHead.body.byteLength).toBe(0);

    // Expired token rejected with 401.
    const expiredToken = mintPreviewToken(harness.previewSecret, {
      sessionId: "sess-1",
      root: "game-adaptations/demo",
      exp: Math.floor(Date.now() / 1_000) - 5
    });
    const expiredRes = await harness.invoke("GET", `/oh-story/game-preview/${expiredToken}/index.html`);
    expect(expiredRes.status).toBe(401);
  });

  it("rejects symlinks and dotfiles in creativeTarget and uses readByteRange for remote media ranges", async () => {
    const root = await mkdtemp(join(tmpdir(), "oh-story-route-fs-"));
    tempDirs.push(root);
    await mkdir(join(root, "正文"));
    await mkdir(join(root, "剧集", "EP001"), { recursive: true });
    await writeFile(join(root, "secrets.json"), "{\"token\":\"nope\"}");
    await symlink(join(root, "secrets.json"), join(root, "正文", "leak.json"));
    await writeFile(join(root, "正文", ".hidden.md"), "hidden");
    await writeFile(join(root, "剧集", "EP001", "clip.mp4"), Buffer.from("abcdefghijklmnop"));

    const readByteRangeSpy = vi.fn(async (target: FsTarget, range: { offset: number; length: number }) => {
      const data = await readFile(target.displayPath);
      return data.subarray(range.offset, range.offset + range.length);
    });
    const fs = makeLocalFs(root, { remote: true, readByteRangeSpy });
    const harness = createHarness(root, fs, { admit: () => ({ peer: {} }) });

    const symlinkRead = await harness.invoke("GET", "/oh-story/file?sessionId=sess-1&path=正文%2Fleak.json");
    expect(symlinkRead.status).toBe(403);

    const hiddenRead = await harness.invoke("GET", "/oh-story/file?sessionId=sess-1&path=正文%2F.hidden.md");
    expect(hiddenRead.status).toBe(403);

    const rangeMedia = await harness.invoke(
      "GET",
      `/oh-story/media?sessionId=sess-1&path=${encodeURIComponent("剧集/EP001/clip.mp4")}`,
      { range: "bytes=2-6" }
    );
    expect(rangeMedia.status).toBe(206);
    expect(rangeMedia.body.toString("utf8")).toBe("cdefg");
    expect(readByteRangeSpy).toHaveBeenCalledTimes(1);
    expect(readByteRangeSpy).toHaveBeenCalledWith(expect.anything(), { offset: 2, length: 5 }, expect.any(AbortSignal));
    expect(fs.readBytes).not.toHaveBeenCalled();
  });

  it("skips node_modules, avoids symlink cycles, and discovers v0.11.0 story directories and multi-book workspaces", async () => {
    const root = await mkdtemp(join(tmpdir(), "oh-story-route-scan-"));
    tempDirs.push(root);
    await mkdir(join(root, "game-adaptations", "demo", "build", "app", "node_modules", "pkg"), { recursive: true });
    await writeFile(join(root, "game-adaptations", "demo", "build", "app", "index.html"), "<html></html>");
    await writeFile(join(root, "game-adaptations", "demo", "build", "app", "node_modules", "pkg", "index.js"), "x");
    await mkdir(join(root, "正文"));
    await writeFile(join(root, "正文", "第001章.md"), "# 1\n");
    await symlink(join(root, "正文"), join(root, "正文", "loop"));
    await mkdir(join(root, "拆文库", "样本书"), { recursive: true });
    await writeFile(join(root, "拆文库", "样本书", "报告.md"), "# 拆文\n");
    await mkdir(join(root, "扫榜", "20261122"), { recursive: true });
    await writeFile(join(root, "扫榜", "20261122", "选题决策.md"), "# 选题\n");
    await mkdir(join(root, "封面"), { recursive: true });
    await writeFile(join(root, "封面", "cover.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(join(root, "发布资料-番茄.md"), "# 发布\n");
    await mkdir(join(root, "第二本书", "正文"), { recursive: true });
    await writeFile(join(root, "第二本书", "正文", "第001章.md"), "# 第二本书\n");

    const harness = createHarness(root, makeLocalFs(root), { admit: () => ({ peer: {} }) });
    const res = await harness.invoke("GET", "/oh-story/workspace?sessionId=sess-1");
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body.toString("utf8")) as WorkspacePayload;
    const paths = payload.files.map((file) => file.path);
    expect(paths.some((path) => path.includes("node_modules"))).toBe(false);
    expect(paths).toEqual(expect.arrayContaining([
      "game-adaptations/demo/build/app/index.html",
      "正文/第001章.md",
      "拆文库/样本书/报告.md",
      "扫榜/20261122/选题决策.md",
      "封面/cover.png",
      "发布资料-番茄.md",
      "第二本书/正文/第001章.md"
    ]));
    expect(payload.truncated).toBe(false);
  });

  it("reports Video Recap 0.8.0 local-first TTS/ASR preflight without dead MiMo checks", async () => {
    const status = await probeVideoPreflight({
      platform: "darwin",
      env: {
        FISH_AUDIO_API_KEY: "fish-key",
        OPENAI_API_KEY: "sk-openai",
        ASR_API_URL: "https://asr.example/v1/audio/transcriptions",
        ASR_API_KEY: "asr-key"
      },
      probeCommand: async (command, args) => {
        if (command === "python3" && args[0] === "--version") return "Python 3.12.2";
        if (command === "ffmpeg" && args[0] === "-version") return "ffmpeg version 7.0";
        if (command === "ffmpeg" && args[1] === "-filters") return " ... subtitles ... ";
        if (command === "ffprobe") return "ffprobe version 7.0";
        if (command === "which" && args[0] === "say") return "/usr/bin/say";
        if (command === "which" && args[0] === "faster-whisper") return "/usr/local/bin/faster-whisper";
        return undefined;
      }
    });
    expect(status).toEqual({
      python: { ok: true, version: "3.12.2", minimum: "3.10" },
      ffmpeg: { ok: true, subtitles: true },
      ffprobe: { ok: true },
      tts: {
        local: { ok: true, engine: "say" },
        fish: true,
        openai: true,
        indexTts: false
      },
      asr: {
        localWhisper: { ok: true, cli: "faster-whisper" },
        remote: true
      }
    });
    expect("credentials" in status).toBe(false);

    // Linux espeak-ng + whisper-cli requires WHISPER_MODEL_PATH + FISH_API_KEY
    const linuxStatus = await probeVideoPreflight({
      platform: "linux",
      env: { FISH_API_KEY: "fish-primary", WHISPER_MODEL_PATH: "/models/ggml-base.bin" },
      probeCommand: async (command, args) => {
        if (command === "which" && args[0] === "espeak-ng") return "/usr/bin/espeak-ng";
        if (command === "which" && args[0] === "whisper-cli") return "/usr/local/bin/whisper-cli";
        return undefined;
      }
    });
    expect(linuxStatus.tts).toEqual({
      local: { ok: true, engine: "espeak-ng" },
      fish: true,
      openai: false,
      indexTts: false
    });
    expect(linuxStatus.asr).toEqual({
      localWhisper: { ok: true, cli: "whisper-cli" },
      remote: false
    });
  });

  it("sets truncated: true in WorkspacePayload when creative files exceed FILE_LIMIT", async () => {
    const root = "/synthetic-workspace";
    const rootTarget: FsTarget = { targetKey: root as FsTarget["targetKey"], displayPath: root };
    const proseDir: FsTarget = { targetKey: `${root}/正文` as FsTarget["targetKey"], displayPath: `${root}/正文` };
    const entries: FsDirEntry[] = Array.from({ length: 1_005 }, (_, idx) => {
      const name = `第${String(idx + 1).padStart(4, "0")}章.md`;
      const full = `${root}/正文/${name}`;
      return {
        name,
        type: "file",
        target: { targetKey: full as FsTarget["targetKey"], displayPath: full },
        size: 10,
        version: `v${String(idx)}` as FsVersion
      };
    });
    const syntheticFs = {
      resolve: vi.fn(async (path: string, opts?: { readonly cwd?: string }): Promise<FsTarget> => {
        const full = path === root ? root : `${opts?.cwd ?? root}/${path}`;
        return { targetKey: full as FsTarget["targetKey"], displayPath: full };
      }),
      processPath: (t: FsTarget) => t.displayPath,
      contains: (parent: FsTarget, child: FsTarget) => child.displayPath === parent.displayPath || child.displayPath.startsWith(`${parent.displayPath}/`),
      stat: vi.fn(async (t: FsTarget): Promise<FsInfo | undefined> => t.displayPath === proseDir.displayPath
        ? { type: "directory", version: "dir" as FsVersion }
        : undefined),
      lstat: vi.fn(async () => undefined),
      listDir: vi.fn(async (t: FsTarget): Promise<FsDirEntry[]> => t.displayPath === proseDir.displayPath ? entries : []),
      readBytes: vi.fn(async () => new Uint8Array()),
      readByteRange: vi.fn(async () => new Uint8Array())
    } as unknown as FileSystem;

    const harness = createHarness(root, syntheticFs, { admit: () => ({ peer: {} }) });
    const res = await harness.invoke("GET", "/oh-story/workspace?sessionId=sess-1");
    expect(res.status).toBe(200);
    const payload = JSON.parse(res.body.toString("utf8")) as WorkspacePayload;
    expect(payload.files).toHaveLength(1_000);
    expect(payload.truncated).toBe(true);
    void rootTarget;
  });
});
