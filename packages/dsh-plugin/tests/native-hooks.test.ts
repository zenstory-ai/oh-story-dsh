import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import type { FileSystem, FsDirEntry, FsInfo, FsTarget } from "@deepseek-ai/dsh-fs";
import SessionStore, { type Session, type SessionEvent } from "@deepseek-ai/dsh-session";
import type { PostToolDecision, PreToolDecision, ToolExecution } from "@deepseek-ai/dsh-tools";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  decideChapterExtractorWrite,
  decideStoryMutation,
  detectStoryMutation,
  IMPORT_MARKER,
  postWriteReminderText,
  registerOhStoryHooks,
  validateAnalysisInputWrite,
  validateStoryMutation
} from "../src/native-hooks.js";
import { observeOhStoryRoleDescriptor, ohStoryRoleOfSession } from "../src/role-identity.js";

const roots: string[] = [];
type StoryFileSystem = Pick<FileSystem, "resolve" | "contains" | "stat" | "listDir">;

function localDshFs(): StoryFileSystem {
  const resolveTarget = async (path: string, options?: { readonly cwd?: string }): Promise<FsTarget> => {
    const displayPath = isAbsolute(path) ? resolve(path) : resolve(options?.cwd ?? ".", path);
    return { targetKey: displayPath as FsTarget["targetKey"], displayPath };
  };
  return {
    resolve: vi.fn(resolveTarget),
    // Separator-agnostic, like DSH's own FileSystem: Windows display paths use backslashes.
    contains: (parent, child) => {
      const path = relative(parent.displayPath, child.displayPath);
      return path === "" || (!path.startsWith("..") && !isAbsolute(path));
    },
    stat: vi.fn(async (target): Promise<FsInfo | undefined> => stat(target.displayPath).then((info) => ({
      version: String(info.mtimeMs) as FsInfo["version"],
      type: info.isFile() ? "file" : info.isDirectory() ? "directory" : "other",
      size: info.size
    }), () => undefined)),
    listDir: vi.fn(async (target): Promise<FsDirEntry[]> => Promise.all((await readdir(target.displayPath, { withFileTypes: true })).map(async (entry) => ({
      name: entry.name,
      type: entry.isFile() ? "file" : entry.isDirectory() ? "directory" : "other",
      target: await resolveTarget(entry.name, { cwd: target.displayPath })
    }))))
  } as StoryFileSystem;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function workspace(prefix = "oh-story-hook-"): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function project(): Promise<string> {
  const root = await workspace();
  await mkdir(join(root, "大纲"));
  await mkdir(join(root, "追踪"));
  return root;
}

function agentOn(root: string, fs: StoryFileSystem, session = { header: { cwd: root } } as unknown as Session): ToolExecution["agent"] {
  return { session, ctx: { get: vi.fn((name: string) => name === "fs" ? fs : undefined) } } as unknown as ToolExecution["agent"];
}

function execution(name: string, args: unknown, agent: ToolExecution["agent"]): ToolExecution {
  return { name, arguments: args, agent, signal: new AbortController().signal } as unknown as ToolExecution;
}

function descriptor(label: string | undefined): SessionEvent {
  return {
    type: "subagent/descriptor",
    seq: 0,
    time: 0,
    data: { version: 3, mode: "one-shot", provider: "spawn", ...(label === undefined ? {} : { label }) }
  } as unknown as SessionEvent;
}

function roleSession(root: string, label: string | undefined): Session {
  const session = { header: { cwd: root } } as unknown as Session;
  observeOhStoryRoleDescriptor(session, descriptor(label));
  return session;
}

const allow = async (): Promise<PreToolDecision> => ({ kind: "allow" });

function outlineDenial(chapter: number, outline: string): string {
  return `Oh Story 阻止写入第 ${String(chapter)} 章：未找到对应的 ${outline}/细纲_第${String(chapter).padStart(3, "0")}章*.md。`
    + "先按 story-long-write 单章流程补建细纲再写正文。";
}

async function importMarker(book: string): Promise<void> {
  await mkdir(join(book, ".story", "work"), { recursive: true });
  await writeFile(join(book, ".story", "work", "导入中.md"), "导入《旧稿》\n");
}

describe("native DSH prose guards", () => {
  it("recognizes both DSH filesystem tool families and ignores editor views", () => {
    expect(detectStoryMutation("write", { file_path: "正文/第002章.md" }, "/books/demo"))
      .toMatchObject({ path: "正文/第002章.md", chapter: 2 });
    expect(detectStoryMutation("str_replace_editor", {
      command: "str_replace",
      path: "/books/demo/正文/第003章.md"
    }, "/books/demo")).toMatchObject({ path: "正文/第003章.md", chapter: 3 });
    expect(detectStoryMutation("str_replace_editor", {
      command: "view",
      path: "/books/demo/正文/第003章.md"
    }, "/books/demo")).toBeUndefined();
    expect(detectStoryMutation("write", { file_path: "正文/第004章.md" }, "dsh://workspace/story"))
      .toMatchObject({ root: "dsh://workspace/story", path: "正文/第004章.md", chapter: 4 });
    expect(detectStoryMutation("write", { file_path: "c:/books/demo/正文/分卷/../第005章.md" }, "C:\\books\\demo"))
      .toMatchObject({ root: "C:/books/demo", path: "正文/第005章.md", chapter: 5 });
  });

  it("finds the book that owns 正文/, including books in workspace subdirectories", () => {
    expect(detectStoryMutation("write", { file_path: "我的书/正文/第001章_开局.md" }, "/books"))
      .toMatchObject({ path: "我的书/正文/第001章_开局.md", chapter: 1 });
    expect(detectStoryMutation("write", { file_path: "正文/第一卷/第006章.md" }, "/books/demo"))
      .toMatchObject({ path: "正文/第一卷/第006章.md", chapter: 6 });
    expect(detectStoryMutation("write", { file_path: "正文/短篇.md" }, "/books/demo"))
      .toEqual({ root: "/books/demo", path: "正文/短篇.md" });
    expect(detectStoryMutation("write", { file_path: "正文/卷一_第002章.md" }, "/books/demo"))
      .toEqual({ root: "/books/demo", path: "正文/卷一_第002章.md" });
    expect(detectStoryMutation("write", { file_path: "大纲/细纲_第002章.md" }, "/books/demo")).toBeUndefined();
    expect(detectStoryMutation("write", { file_path: "正文" }, "/books/demo")).toBeUndefined();
    expect(detectStoryMutation("write", { file_path: "../正文/第001章.md" }, "/books/demo")).toBeUndefined();
  });

  it("requires the matching outline for a new chapter even before Tracking exists", async () => {
    // Since Oh Story 0.7.11 planning no longer creates 追踪/: a freshly planned
    // book has 大纲/ but no Tracking until right before its first chapter.
    const root = await workspace();
    await mkdir(join(root, "大纲"));
    await expect(validateStoryMutation(localDshFs(), { root, path: "正文/第001章.md", chapter: 1 }))
      .resolves.toBe(outlineDenial(1, "大纲"));
    await writeFile(join(root, "大纲", "细纲_第001章_开局.md"), "# 第一章\n");
    await expect(validateStoryMutation(localDshFs(), { root, path: "正文/第001章.md", chapter: 1 }))
      .resolves.toBeUndefined();
  });

  it("lets an import copy existing prose only while 拆文库/{书名} exists and Tracking is absent", async () => {
    const root = await workspace();
    await mkdir(join(root, "大纲"));
    const mutation = { root, path: "正文/第002章.md", chapter: 2 };
    await mkdir(join(root, "拆文库", "对标书"), { recursive: true });
    await expect(validateStoryMutation(localDshFs(), mutation)).resolves.toContain("细纲_第002章");
    await mkdir(join(root, "拆文库", basename(root)), { recursive: true });
    await expect(validateStoryMutation(localDshFs(), mutation)).resolves.toBeUndefined();
    await mkdir(join(root, "追踪"));
    await writeFile(join(root, "追踪", "_tracking-state.json"), "{}\n");
    await expect(validateStoryMutation(localDshFs(), mutation)).resolves.toContain("细纲_第002章");
  });

  it("opens the import window with DSH's marker only while Tracking state is absent", async () => {
    // Upstream story-import Phase 3-L: Step 1 creates 大纲/ and 追踪/, Step 2
    // copies the manuscript into 正文/, Step 6 writes 细纲, Step 7 runs init.
    expect(IMPORT_MARKER).toBe(".story/work/导入中.md");
    const root = await workspace("oh-story-hook-import-");
    await mkdir(join(root, "大纲"));
    await mkdir(join(root, "追踪"));
    await mkdir(join(root, "拆文库", "对标书"), { recursive: true });
    const mutation = { root, path: "正文/第007章_旧稿.md", chapter: 7 };
    await expect(validateStoryMutation(localDshFs(), mutation)).resolves.toBe(outlineDenial(7, "大纲"));
    await importMarker(root);
    await expect(validateStoryMutation(localDshFs(), mutation)).resolves.toBeUndefined();
    await writeFile(join(root, "追踪", "_tracking-state.json"), "{}\n");
    await expect(validateStoryMutation(localDshFs(), mutation)).resolves.toBe(outlineDenial(7, "大纲"));
  });

  it("reads the import marker from the book directory, not the workspace root", async () => {
    const root = await workspace();
    await mkdir(join(root, "我的书", "大纲"), { recursive: true });
    const mutation = { root, path: "我的书/正文/第001章.md", chapter: 1 };
    await importMarker(root);
    await expect(validateStoryMutation(localDshFs(), mutation)).resolves.toBe(outlineDenial(1, "我的书/大纲"));
    await importMarker(join(root, "我的书"));
    await expect(validateStoryMutation(localDshFs(), mutation)).resolves.toBeUndefined();
  });

  it("requires the matching chapter outline", async () => {
    const root = await project();
    await writeFile(join(root, "追踪", "_tracking-state.json"), "{}\n");
    await expect(validateStoryMutation(localDshFs(), { root, path: "正文/第002章.md", chapter: 2 }))
      .resolves.toContain("细纲");
  });

  it("allows a mutation when Tracking and the matching outline exist", async () => {
    const root = await project();
    await writeFile(join(root, "追踪", "_tracking-state.json"), "{}\n");
    await writeFile(join(root, "大纲", "细纲_第002章_回声.md"), "# 第二章\n");
    await expect(validateStoryMutation(localDshFs(), { root, path: "正文/第002章.md", chapter: 2 }))
      .resolves.toBeUndefined();
  });

  it("does not gate rewriting an existing chapter on its outline", async () => {
    const root = await project();
    await writeFile(join(root, "追踪", "_tracking-state.json"), "{}\n");
    await mkdir(join(root, "正文"));
    await writeFile(join(root, "正文", "第002章.md"), "# 第二章\n");
    await expect(validateStoryMutation(localDshFs(), { root, path: "正文/第002章.md", chapter: 2 }))
      .resolves.toBeUndefined();
  });

  it("guards a book in a workspace subdirectory against its own outline and import analysis", async () => {
    const root = await workspace();
    await mkdir(join(root, "我的书", "大纲"), { recursive: true });
    const mutation = { root, path: "我的书/正文/第001章.md", chapter: 1 };
    await expect(validateStoryMutation(localDshFs(), mutation))
      .resolves.toBe(outlineDenial(1, "我的书/大纲"));
    await mkdir(join(root, "拆文库", "我的书"), { recursive: true });
    await expect(validateStoryMutation(localDshFs(), mutation)).resolves.toBeUndefined();
  });

  it("preserves DSH's downstream permission decision instead of forcing ask", async () => {
    const root = await project();
    const fs = localDshFs();
    const agent = agentOn(root, fs);
    await writeFile(join(root, "大纲", "细纲_第002章.md"), "# 第二章\n");
    await expect(decideStoryMutation(execution("write", { file_path: "正文/第002章.md" }, agent), async () => ({ kind: "allow" })))
      .resolves.toEqual({ kind: "allow" });
    expect(agent?.ctx.get).toHaveBeenCalledWith("fs");
  });

  it("does not impose long-form guards on a plain short-story workspace", async () => {
    const root = await workspace("oh-story-hook-short-");
    await expect(validateStoryMutation(localDshFs(), { root, path: "正文/短篇.md" })).resolves.toBeUndefined();
  });

  it("leaves a plain workspace with only 正文/ free to create chapter files", async () => {
    const root = await workspace("oh-story-hook-plain-");
    await mkdir(join(root, "正文"));
    await expect(validateStoryMutation(localDshFs(), { root, path: "正文/第001章_通用会话.md", chapter: 1 }))
      .resolves.toBeUndefined();
  });

  it("reads the calling Agent filesystem instead of the host filesystem", async () => {
    const calls: string[] = [];
    const entries = new Map<string, "file" | "directory">([
      ["/virtual-story/大纲", "directory"],
      ["/virtual-story/追踪", "directory"],
      ["/virtual-story/追踪/_tracking-state.json", "file"]
    ]);
    const fs = {
      resolve: vi.fn(async (path: string, options?: { readonly cwd?: string }): Promise<FsTarget> => {
        const displayPath = path.startsWith("/") ? path : `${options?.cwd ?? ""}/${path}`;
        calls.push(displayPath);
        return { targetKey: displayPath as FsTarget["targetKey"], displayPath };
      }),
      contains: vi.fn(() => true),
      stat: vi.fn(async (target: FsTarget): Promise<FsInfo | undefined> => {
        const type = entries.get(target.displayPath);
        return type === undefined ? undefined : { type, version: "v1" as FsInfo["version"] };
      }),
      listDir: vi.fn(async (): Promise<FsDirEntry[]> => [{
        name: "细纲_第002章_虚拟.md",
        type: "file",
        target: {
          targetKey: "/virtual-story/大纲/细纲_第002章_虚拟.md" as FsTarget["targetKey"],
          displayPath: "/virtual-story/大纲/细纲_第002章_虚拟.md"
        }
      }])
    } as StoryFileSystem;
    const agent = agentOn("/virtual-story", fs);

    await expect(decideStoryMutation(execution("write", { file_path: "正文/第002章.md" }, agent), async () => ({ kind: "allow" })))
      .resolves.toEqual({ kind: "allow" });
    expect(agent?.ctx.get).toHaveBeenCalledWith("fs");
    expect(calls).toEqual(expect.arrayContaining(["/virtual-story/大纲", "/virtual-story/正文/第002章.md"]));
  });
});

describe("chapter-extractor write fence", () => {
  async function analysisProject(): Promise<string> {
    const root = await workspace("oh-story-extractor-");
    await mkdir(join(root, "拆文库", "某书", "_analysis_cache"), { recursive: true });
    await writeFile(join(root, "拆文库", "某书", "_progress.md"), "# 进度\n");
    await mkdir(join(root, "拆文库", "无索引", "_analysis_cache"), { recursive: true });
    await mkdir(join(root, "大纲"));
    await writeFile(join(root, "大纲", "细纲_第001章.md"), "# 第一章\n");
    return root;
  }

  it("accepts only 输入-{RAW|REUSE}-{起章}-{止章}.md inside a real 拆文目录's _analysis_cache", async () => {
    const root = await analysisProject();
    const fs = localDshFs();
    for (const path of [
      "拆文库/某书/_analysis_cache/输入-RAW-4-6.md",
      "拆文库/某书/_analysis_cache/输入-REUSE-1-3.md",
      join(root, "拆文库", "某书", "_analysis_cache", "输入-RAW-7-7.md")
    ]) await expect(validateAnalysisInputWrite(fs, root, path)).resolves.toBeUndefined();

    await writeFile(join(root, "拆文库", "无索引", "chapter_index.csv"), "chapter\n");
    await expect(validateAnalysisInputWrite(fs, root, "拆文库/无索引/_analysis_cache/输入-RAW-1-3.md")).resolves.toBeUndefined();
  });

  it("names every broken rule, like upstream's analysis-input-guard", async () => {
    const root = await analysisProject();
    const outside = await workspace("oh-story-extractor-outside-");
    await mkdir(join(outside, "_analysis_cache"));
    await writeFile(join(outside, "_progress.md"), "# 进度\n");
    const fs = localDshFs();
    const cases: ReadonlyArray<readonly [string | undefined, readonly string[]]> = [
      ["正文/第001章.md", ["文件名必须是 输入-{RAW|REUSE}-{起章}-{止章}.md", "只能写在拆文目录的 _analysis_cache/ 下"]],
      ["拆文库/某书/_analysis_cache/批次-RAW-4-6.md", ["文件名必须是"]],
      ["拆文库/某书/输入-RAW-4-6.md", ["只能写在拆文目录的 _analysis_cache/ 下"]],
      ["拆文库/某书/_analysis_cache/输入-RAW-6-4.md", ["批次章号范围无效"]],
      ["拆文库/某书/_analysis_cache/输入-RAW-0-2.md", ["批次章号范围无效"]],
      ["拆文库/无索引/_analysis_cache/输入-RAW-1-3.md", ["上级目录不是拆文目录（缺 chapter_index.csv 与 _progress.md）"]],
      [join(outside, "_analysis_cache", "输入-RAW-1-3.md"), ["路径在项目目录之外"]],
      [undefined, ["写入没有给出文件路径"]]
    ];
    for (const [path, reasons] of cases) {
      const reason = await validateAnalysisInputWrite(fs, root, path);
      expect(reason).toContain("Oh Story 阻止 chapter-extractor 写入");
      expect(reason).toContain("只允许写调用方给的 {拆文目录}/_analysis_cache/输入-{批次ID}.md");
      for (const expected of reasons) expect(reason).toContain(expected);
    }
  });

  it("identifies the extractor from its DSH subagent descriptor and fences only its file mutations", async () => {
    const root = await analysisProject();
    const fs = localDshFs();
    const extractor = agentOn(root, fs, roleSession(root, "oh-story:chapter-extractor"));
    const next = vi.fn(allow);

    await expect(decideChapterExtractorWrite(execution("write", { file_path: "拆文库/某书/_analysis_cache/输入-RAW-4-6.md", content: "x" }, extractor), next))
      .resolves.toEqual({ kind: "allow" });
    await expect(decideChapterExtractorWrite(execution("edit", { file_path: "拆文库/某书/_analysis_cache/输入-RAW-4-6.md", old_string: "a", new_string: "b" }, extractor), next))
      .resolves.toEqual({ kind: "allow" });
    await expect(decideChapterExtractorWrite(execution("read", { file_path: "原文/原文.txt" }, extractor), next))
      .resolves.toEqual({ kind: "allow" });
    await expect(decideChapterExtractorWrite(execution("str_replace_editor", { command: "view", path: "正文/第001章.md" }, extractor), next))
      .resolves.toEqual({ kind: "allow" });
    expect(next).toHaveBeenCalledTimes(4);

    for (const call of [
      execution("write", { file_path: "正文/第001章.md", content: "x" }, extractor),
      execution("edit", { file_path: "拆文库/某书/章节/第1章_摘要.md", old_string: "a", new_string: "b" }, extractor),
      execution("str_replace_editor", { command: "create", path: "设定/角色/甲.md", file_text: "x" }, extractor),
      execution("write", { content: "x" }, extractor)
    ]) {
      const decision = await decideChapterExtractorWrite(call, next);
      expect(decision).toMatchObject({ kind: "deny" });
      expect((decision as { readonly reason: string }).reason).toContain("chapter-extractor");
    }
    expect(next).toHaveBeenCalledTimes(4);
  });

  it("fails closed when the extractor's Agent exposes no filesystem", async () => {
    const root = await analysisProject();
    const session = roleSession(root, "oh-story:chapter-extractor");
    const agent = { session, ctx: { get: vi.fn(() => undefined) } } as unknown as ToolExecution["agent"];
    const next = vi.fn(allow);
    const decision = await decideChapterExtractorWrite(
      execution("write", { file_path: "拆文库/某书/_analysis_cache/输入-RAW-4-6.md", content: "x" }, agent),
      next
    );
    expect(decision).toEqual({
      kind: "deny",
      reason: "Oh Story 阻止 chapter-extractor 写入：无法确认项目目录。只允许写调用方给的 {拆文目录}/_analysis_cache/输入-{批次ID}.md（批次 ID 如 RAW-4-6），不写其他文件。"
    });
    expect(agent?.ctx.get).toHaveBeenCalledWith("fs");
    expect(next).not.toHaveBeenCalled();
  });

  it("leaves the main Agent, other Roles, and non-Oh-Story subagents unfenced", async () => {
    const root = await analysisProject();
    const fs = localDshFs();
    const write = { file_path: "正文/第001章.md", content: "x" };
    for (const session of [
      { header: { cwd: root } } as unknown as Session,
      roleSession(root, "oh-story:narrative-writer"),
      roleSession(root, "summarize the codebase"),
      roleSession(root, "oh-story:unknown-role"),
      roleSession(root, undefined)
    ]) {
      const next = vi.fn(allow);
      await expect(decideChapterExtractorWrite(execution("write", write, agentOn(root, fs, session)), next))
        .resolves.toEqual({ kind: "allow" });
      expect(next).toHaveBeenCalledOnce();
    }
  });

  it("treats the first descriptor as authoritative", () => {
    const session = roleSession("/books/demo", "oh-story:chapter-extractor");
    observeOhStoryRoleDescriptor(session, descriptor("oh-story:narrative-writer"));
    expect(ohStoryRoleOfSession(session)).toBe("chapter-extractor");
    observeOhStoryRoleDescriptor(session, { type: "user/message", seq: 1, time: 0, data: {} } as unknown as SessionEvent);
    expect(ohStoryRoleOfSession(session)).toBe("chapter-extractor");
  });
});

describe("registered native hooks", () => {
  type Handler = (...args: unknown[]) => unknown;

  function registered(): Map<string, Handler[]> {
    const handlers = new Map<string, Handler[]>();
    const context = {
      on: vi.fn((name: string, handler: Handler) => {
        handlers.set(name, [...handlers.get(name) ?? [], handler]);
        return () => {};
      })
    } as unknown as Context;
    registerOhStoryHooks(context);
    return handlers;
  }

  async function preExecute(handlers: Map<string, Handler[]>, exec: ToolExecution): Promise<PreToolDecision> {
    const chain = handlers.get("tools/pre-execute") ?? [];
    const run = async (index: number): Promise<PreToolDecision> => index >= chain.length
      ? { kind: "allow" }
      : await chain[index]!(exec, () => run(index + 1)) as PreToolDecision;
    return run(0);
  }

  it("records Role identity from committed session events before fencing tool calls", async () => {
    const handlers = registered();
    expect([...handlers.keys()]).toEqual(["session/event", "tools/pre-execute", "tools/post-execute"]);
    expect(handlers.get("tools/pre-execute")).toHaveLength(2);

    const root = await project();
    await writeFile(join(root, "大纲", "细纲_第001章.md"), "# 第一章\n");
    const fs = localDshFs();
    const session = { header: { cwd: root } } as unknown as Session;
    const write = execution("write", { file_path: "正文/第001章.md", content: "x" }, agentOn(root, fs, session));

    await expect(preExecute(handlers, write)).resolves.toEqual({ kind: "allow" });
    handlers.get("session/event")![0]!(session, descriptor("oh-story:chapter-extractor"));
    await expect(preExecute(handlers, write)).resolves.toMatchObject({ kind: "deny", reason: expect.stringContaining("chapter-extractor") });
  });

  it("denies a first chapter without its 细纲 through the registered pre-execute chain", async () => {
    // A freshly planned book: 大纲/ exists, 追踪/ does not, and no 细纲 yet.
    const handlers = registered();
    const root = await workspace();
    await mkdir(join(root, "大纲"));
    const main = agentOn(root, localDshFs());
    for (const call of [
      execution("write", { file_path: "正文/第001章.md", content: "x" }, main),
      execution("str_replace_editor", { command: "create", path: join(root, "正文", "第001章.md"), file_text: "x" }, main)
    ]) await expect(preExecute(handlers, call)).resolves.toEqual({ kind: "deny", reason: outlineDenial(1, "大纲") });

    await writeFile(join(root, "大纲", "细纲_第001章.md"), "# 第一章\n");
    await expect(preExecute(handlers, execution("write", { file_path: "正文/第001章.md", content: "x" }, main)))
      .resolves.toEqual({ kind: "allow" });
  });

  it("fails the extractor fence closed through the registered chain when fs is unavailable", async () => {
    const handlers = registered();
    const root = await workspace();
    const session = roleSession(root, "oh-story:chapter-extractor");
    const agent = { session, ctx: { get: vi.fn(() => undefined) } } as unknown as ToolExecution["agent"];
    await expect(preExecute(handlers, execution("write", { file_path: "拆文库/某书/_analysis_cache/输入-RAW-1-3.md", content: "x" }, agent)))
      .resolves.toMatchObject({ kind: "deny", reason: expect.stringContaining("无法确认项目目录") });
  });

  it("hears a child's subagent descriptor through DSH's real session store", async () => {
    const context = new Context();
    await context.plugin(SessionStore);
    registerOhStoryHooks(context);
    try {
      const child = context.sessions.create();
      expect(ohStoryRoleOfSession(child)).toBeUndefined();
      // The in-process spawn driver appends exactly this inside the child's first step.
      child.append("subagent/descriptor", { version: 3, mode: "one-shot", provider: "spawn", label: "oh-story:chapter-extractor" });
      expect(ohStoryRoleOfSession(child)).toBe("chapter-extractor");
      const other = context.sessions.create();
      other.append("subagent/descriptor", { version: 3, mode: "one-shot", provider: "spawn", label: "review the diff" });
      expect(ohStoryRoleOfSession(other)).toBeUndefined();
    } finally {
      await context.fiber.dispose();
    }
  });

  it("reminds the writer to commit Tracking with upstream scripts at chapter close, never by hand", async () => {
    const handlers = registered();
    const postExecute = handlers.get("tools/post-execute")![0]!;
    const accept = async (): Promise<PostToolDecision> => ({ kind: "accept" } as PostToolDecision);

    const book = await project();
    await writeFile(join(book, "追踪", "_tracking-state.json"), "{}\n");
    await mkdir(join(book, "正文"));
    await writeFile(join(book, "正文", "第001章.md"), "# 第一章\n");
    const bookWrite = execution("write", { file_path: "正文/第001章.md", content: "x" }, agentOn(book, localDshFs()));
    const decision = await postExecute(bookWrite, { isError: false }, accept) as PostToolDecision & { readonly additionalContexts?: readonly unknown[] };
    expect(decision.additionalContexts).toHaveLength(1);
    const reminder = JSON.stringify(decision.additionalContexts);
    expect(reminder).toContain("oh-story-post-write");
    expect(reminder).toContain(postWriteReminderText("正文/第001章.md").replaceAll("\"", "\\\""));
    expect(reminder).not.toContain("首次初始化");

    const plain = await workspace("oh-story-hook-plain-");
    await mkdir(join(plain, "正文"));
    const plainWrite = execution("write", { file_path: "正文/第001章.md", content: "x" }, agentOn(plain, localDshFs()));
    await expect(postExecute(plainWrite, { isError: false }, accept)).resolves.toEqual({ kind: "accept" });
  });

  it("asks a new book to run story-long-write's first-time Tracking init before draft", async () => {
    const handlers = registered();
    const postExecute = handlers.get("tools/post-execute")![0]!;
    const accept = async (): Promise<PostToolDecision> => ({ kind: "accept" } as PostToolDecision);
    const reminderFor = async (root: string): Promise<string> => {
      const write = execution("write", { file_path: "正文/第001章.md", content: "x" }, agentOn(root, localDshFs()));
      const decision = await postExecute(write, { isError: false }, accept) as PostToolDecision & { readonly additionalContexts?: readonly unknown[] };
      expect(decision.additionalContexts).toHaveLength(1);
      return JSON.stringify(decision.additionalContexts);
    };
    const escaped = (text: string): string => text.replaceAll("\"", "\\\"");

    const book = await workspace();
    await mkdir(join(book, "大纲"));
    await writeFile(join(book, "大纲", "细纲_第001章.md"), "# 第一章\n");
    await mkdir(join(book, "正文"));
    await writeFile(join(book, "正文", "第001章.md"), "# 第一章\n");
    const fresh = await reminderFor(book);
    expect(fresh).toContain(escaped(postWriteReminderText("正文/第001章.md", { trackingUninitialized: true })));
    for (const step of [
      "本书还没有 追踪/_tracking-state.json",
      "draft 之前先按 story-long-write workflow-daily 的「首次初始化」",
      "references/tracking-initialization.md",
      "last_chapter=0 的初始化事务存书目录 .story/work/init.json",
      "运行 scripts/tracking_commit.py init，再运行 tracking_commit.py check，通过后删掉 init.json",
      "story-import 的「旧追踪项目迁移」"
    ]) expect(fresh).toContain(step);

    // An import window initialises Tracking from story-import instead.
    await importMarker(book);
    expect(await reminderFor(book)).toContain(escaped(postWriteReminderText("正文/第001章.md")));
    await rm(join(book, ".story"), { recursive: true });
    await mkdir(join(book, "追踪"));
    await writeFile(join(book, "追踪", "_tracking-state.json"), "{}\n");
    const committed = await reminderFor(book);
    expect(committed).toContain(escaped(postWriteReminderText("正文/第001章.md")));
    expect(committed).not.toContain("首次初始化");
  });

  it("keeps the reminder out of oh_story_role children", async () => {
    const handlers = registered();
    const postExecute = handlers.get("tools/post-execute")![0]!;
    const book = await project();
    await mkdir(join(book, "正文"));
    await writeFile(join(book, "正文", "第001章.md"), "# 第一章\n");
    const write = { file_path: "正文/第001章.md", content: "x" };
    for (const label of ["oh-story:narrative-writer", "oh-story:story-architect"]) {
      const child = agentOn(book, localDshFs(), roleSession(book, label));
      await expect(postExecute(execution("write", write, child), { isError: false }, async () => ({ kind: "accept" })))
        .resolves.toEqual({ kind: "accept" });
    }
    const main = await postExecute(execution("write", write, agentOn(book, localDshFs())), { isError: false }, async () => ({ kind: "accept" }));
    expect((main as { readonly additionalContexts?: readonly unknown[] }).additionalContexts).toHaveLength(1);
  });

  it("says when the reminder fires and which scripts own Tracking", () => {
    const text = postWriteReminderText("正文/第003章.md");
    expect(text.startsWith("<oh-story-post-write>正文 正文/第003章.md 已变更。")).toBe(true);
    expect(text.endsWith("</oh-story-post-write>")).toBe(true);
    for (const rule of [
      "每次写入正文都会出现这条提醒，一章写到一半时也会",
      "不是作者的新写作要求",
      "等本章写完收尾时再提交追踪",
      "scripts/tracking_commit.py draft",
      "scripts/storyctl.py chapter commit",
      "chapter accept-current-length",
      "mode=revision",
      "追踪/_tracking-state.json",
      "派生 Tracking 视图只由这些脚本写入，绝不手改"
    ]) expect(text).toContain(rule);
  });
});
