import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { createServer as createHttpServer, request as httpRequest, type Server as HttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Locator, type Page } from "@playwright/test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dshVersion = "0.1.2-rc.1";
/** Exact WebSocket route carrying every Typert Remote stream. */
const REMOTE_STREAM_MUX_PATH = "/api/remote.mux";
const demoFramesDirectory = process.env.OH_STORY_DEMO_FRAMES_DIR;
const gameEvidenceDirectory = process.env.OH_STORY_GAME_E2E_DIR;
const useRealDeepSeek = process.env.OH_STORY_DEMO_USE_REAL_DEEPSEEK === "1";
const browserChannel = process.env.DSH_SMOKE_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : "chrome");
const storyProjectName = "让你管账号，你高燃混剪炸全网";
const dramaProjectName = "让你管账号";
const storyFixture = join(repositoryRoot, "scripts", "demo-fixtures", "story", storyProjectName);
const dramaFixture = join(repositoryRoot, "scripts", "demo-fixtures", "drama", dramaProjectName);
const generatedGameId = "smoke-game";
const keyframeMediaFixture = join(repositoryRoot, "scripts", "demo-fixtures", "media", "shot-ep001-001-keyframe.png");
const keyframeV2MediaFixture = join(repositoryRoot, "scripts", "demo-fixtures", "media", "shot-ep001-001-keyframe-v2.png");
const videoMediaFixture = join(repositoryRoot, "scripts", "demo-fixtures", "media", "shot-ep001-002-video.mp4");
const storyPrompt = `请只读检查《${storyProjectName}》当前工程，简要概览正文、大纲、设定与追踪状态，不修改任何文件。`;
const dramaPrompt = `请只读检查短剧《${dramaProjectName}》EP001 的 creator-first 五份创作文档，简要概览剧本、视觉设定、分镜、图片提示词与视频提示词，不修改任何文件。`;
const gamePrompt = "请打开 Game Studio，检查当前可试玩版本与设计产物；保留左侧试玩、右侧对话的工作方式。";
const storyReply = `已读取《${storyProjectName}》工程。正文、大纲、设定与追踪文件已就绪。`;
const dramaReply = `已读取《${dramaProjectName}》EP001。creator-first 五份 Markdown 创作文档已就绪，未发现并行 JSON/JSONL 创作真相。`;
const gameReply = "Game Studio 已就绪。左侧可以直接试玩、检查设计并切换《金瓶梅 · 风月总账》示例；右侧继续使用原生对话。";
const videoPrompt = "请打开 Video Studio，确认 smoke-recap 的原片、剪后片与最终成片，并检查运行清单与解说环境。";
const videoReply = "Video Studio 已就绪。左侧可以切换原片、剪后片与最终成片，查看运行清单与环境检查；右侧继续使用原生对话。";
const dramaCreatorFiles = ["剧本.md", "视觉设定.md", "分镜.md", "图片提示词.md", "视频提示词.md"] as const;
const agentMutationPrompt = "AGENT_WRITE_SMOKE：请使用 write 工具创建指定测试文件。";
const agentMutationPath = "设定/角色/_agent-write-smoke.md";
const agentMutationContent = "# Agent 写入验证\n\n这段正文由真实 DSH Agent 工具调用流式写入。\n\n- 文件树自动定位\n- 编辑器同步更新\n";
const agentMutationReply = "测试文件已通过 write 工具创建。";
const plainProjectName = "plain-workspace";
const plainPrompt = "PLAIN_WORKSPACE_SMOKE：确认这是一个没有创作项目的普通 DSH workspace。";
const plainReply = "这是一个普通 workspace，没有创作项目。";
const plainWritePrompt = "PLAIN_WRITE_SMOKE：请使用 write 工具在这个 workspace 中创建小说正文文件。";
const plainWritePath = "正文/第001章_通用会话.md";
const plainWriteContent = "# 通用会话中的第一章\n\n创作文件出现后，工作台才接管这次对话的布局。\n";
const plainWriteReply = "正文文件已创建。";
const gameUpdatePrompt = "GAME_BUILD_UPDATE_SMOKE：请使用 write 工具写入游戏构建版本标记。";
const gameUpdatePath = `game-adaptations/${generatedGameId}/build/app/version.txt`;
const gameUpdateContent = "game-build-update-smoke\n";
const gameUpdateReply = "游戏构建版本标记已更新。";
const todoLayoutPrompt = "TODO_LAYOUT_SMOKE：写入十一条已完成任务。";
const todoLayoutItems = Array.from({ length: 11 }, (_, index) => ({ content: `布局任务 ${String(index + 1)}`, status: "completed" }));
const longReplyPrompt = "LONG_REPLY_SMOKE：请返回一篇很长的答复。";
const longReplyTail = "LONG_REPLY_TAIL_MARKER";
const longReplyContent = [
  "## 下一步最值得做的",
  "",
  ...Array.from({ length: 36 }, (_, index) => `${String(index + 1)}. 长答复行 ${String(index + 1)}：这一行用来把 Chat 尾部推到 Composer 座位下面，验证工作台的留白是否真的把最后一行让了出来。`),
  "",
  longReplyTail
].join("\n");
const roleReference = "story-setup/references/agent-references/writing-craft.md";
const roleReferenceExcerpt = "贯穿道具系统";
const roleSmokePrompt = "ROLE_RUNTIME_SMOKE：必须调用 oh_story_role 的 narrative-writer，并返回子角色结果。";
const roleChildPrompt = `ROLE_CHILD_SMOKE：必须先调用 oh_story_bundled_reference 读取 ${roleReference}，确认内容包含“${roleReferenceExcerpt}”，再回复指定验证文本。`;
const roleChildReply = "ROLE_CHILD_RESULT：narrative-writer 子 Agent 已读取打包参考并完成。";
const roleParentReply = "ROLE_PARENT_RESULT：已收到 narrative-writer 子 Agent 结果。";
const productionIntentSmokePrompt = "PRODUCTION_INTENT_SMOKE：必须调用 oh_story_production，聚焦 EP001 的 SHOT-EP001-008 生产目标。";
const productionIntentReply = "PRODUCTION_INTENT_RESULT：生产目标聚焦意图已发送。";
const productionIntentArgs = { action: "focus_target", episode: "剧集/EP001", targetId: "SHOT-EP001-008", section: "shots" } as const;

async function captureDemoFrame(page: Page, workbench: "story" | "drama" | "game" | "video", index: number): Promise<void> {
  if (demoFramesDirectory === undefined) return;
  await mkdir(demoFramesDirectory, { recursive: true });
  await page.waitForTimeout(180);
  await page.screenshot({
    path: join(demoFramesDirectory, `${workbench}-${String(index).padStart(2, "0")}.png`),
    animations: "disabled"
  });
}

async function captureGameEvidence(page: Page, name: string): Promise<void> {
  if (gameEvidenceDirectory === undefined) return;
  await mkdir(gameEvidenceDirectory, { recursive: true });
  const collapse = page.getByRole("button", { name: /^(?:Collapse sidebar|收起侧边栏)$/u }).first();
  if (await collapse.isVisible()) {
    await collapse.click();
    await page.getByRole("button", { name: /^(?:Open sidebar|打开侧边栏)$/u }).first().waitFor({ state: "visible", timeout: 10_000 });
    await page.waitForTimeout(250);
  }
  await page.screenshot({ path: join(gameEvidenceDirectory, `${name}.png`), animations: "disabled" });
}

async function prepareDemoSurface(page: Page): Promise<void> {
  if (demoFramesDirectory === undefined) return;
  const collapse = page.getByRole("button", { name: /^(?:Collapse sidebar|收起侧边栏)$/u }).first();
  const opened = page.getByRole("button", { name: /^(?:Open sidebar|打开侧边栏)$/u }).first();
  // Every workbench prepares the same surface, so later captures find it collapsed already.
  if (await opened.isVisible()) return;
  await collapse.waitFor({ state: "visible", timeout: 10_000 });
  await collapse.click();
  await opened.waitFor({ state: "visible", timeout: 10_000 });
  await page.waitForTimeout(350);
}

function run(command: string, args: readonly string[], env: NodeJS.ProcessEnv = process.env): void {
  const result = spawnSync(command, args, { cwd: repositoryRoot, env, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) throw new Error(`Command failed: ${command} ${args.join(" ")}\n${result.error?.message ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
}

function runPnpm(args: readonly string[]): void {
  if (process.platform === "win32") {
    run(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "pnpm", ...args]);
    return;
  }
  run("pnpm", args);
}

async function freePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", accept); });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Could not reserve a DSH test port.");
  await new Promise<void>((accept, reject) => server.close((error) => error ? reject(error) : accept()));
  return address.port;
}

interface MockDeepSeek {
  readonly baseURL: string;
  readonly requests: string[];
  readonly server: HttpServer;
}

async function startMockDeepSeek(): Promise<MockDeepSeek> {
  const requests: string[] = [];
  const server = createHttpServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => { body += chunk.toString("utf8"); });
    request.on("end", async () => {
      if (request.method !== "POST" || !request.url?.endsWith("/chat/completions")) {
        response.writeHead(404).end("not found");
        return;
      }
      let payload: unknown;
      try { payload = JSON.parse(body) as unknown; }
      catch {
        response.writeHead(400, { "content-type": "application/json" }).end('{"error":"invalid json"}');
        return;
      }
      const serialized = JSON.stringify(payload);
      const messages = (payload as { readonly messages?: readonly { readonly role?: string }[] }).messages ?? [];
      const lastUserIndex = messages.findLastIndex((message) => message.role === "user");
      const currentTurn = JSON.stringify(messages.slice(Math.max(lastUserIndex, 0)));
      const gameUpdateTurn = currentTurn.includes(gameUpdatePrompt);
      const plainWriteTurn = currentTurn.includes(plainWritePrompt);
      const mutationTurn = currentTurn.includes(agentMutationPrompt) || gameUpdateTurn || plainWriteTurn;
      const todoLayoutTurn = currentTurn.includes(todoLayoutPrompt);
      const longReplyTurn = currentTurn.includes(longReplyPrompt);
      const productionTurn = currentTurn.includes("/short-drama-produce");
      const roleParentTurn = currentTurn.includes(roleSmokePrompt);
      const productionIntentTurn = currentTurn.includes(productionIntentSmokePrompt);
      const roleChildTurn = serialized.includes(roleChildPrompt) && !serialized.includes(roleSmokePrompt);
      const hasToolResult = messages.slice(lastUserIndex + 1).some((message) => message.role === "tool");
      let events: string[];
      if (roleChildTurn && !hasToolResult) {
        requests.push("role-child-reference-start");
        const argumentsJson = JSON.stringify({ reference: roleReference });
        const chunks = argumentsJson.match(/.{1,14}/gu) ?? [argumentsJson];
        events = [
          JSON.stringify({ choices: [{ delta: { role: "assistant", content: null, reasoning_content: "" } }] }),
          ...chunks.map((argumentsDelta, index) => JSON.stringify({ choices: [{ delta: { tool_calls: [{
            index: 0,
            ...(index === 0 ? { id: "call_oh_story_reference_smoke", type: "function" } : {}),
            function: { ...(index === 0 ? { name: "oh_story_bundled_reference" } : {}), arguments: argumentsDelta }
          }] } }] })),
          JSON.stringify({ choices: [{ delta: { content: "" }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 12, completion_tokens: 20 } }),
          "[DONE]"
        ];
      } else if (roleChildTurn) {
        if (!serialized.includes(roleReferenceExcerpt)) {
          requests.push("role-child-reference-missing-result");
          response.writeHead(422, { "content-type": "application/json" }).end('{"error":"bundled reference result was not returned to the child"}');
          return;
        }
        requests.push("role-child-reference-resume");
        events = [
          JSON.stringify({ choices: [{ delta: { role: "assistant", content: null, reasoning_content: "" } }] }),
          JSON.stringify({ choices: [{ delta: { content: roleChildReply } }] }),
          JSON.stringify({ choices: [{ delta: { content: "" }, finish_reason: "stop" }], usage: { prompt_tokens: 12, completion_tokens: 20 } }),
          "[DONE]"
        ];
      } else if ((mutationTurn || todoLayoutTurn || roleParentTurn || productionIntentTurn) && !hasToolResult) {
        const tool = roleParentTurn
          ? { id: "call_oh_story_role_smoke", name: "oh_story_role", args: { role: "narrative-writer", prompt: roleChildPrompt } }
          : productionIntentTurn
            ? { id: "call_oh_story_production_smoke", name: "oh_story_production", args: productionIntentArgs }
          : todoLayoutTurn
            ? { id: "call_todo_layout", name: "todo_write", args: { todos: todoLayoutItems } }
            : gameUpdateTurn
              ? { id: "call_game_build_update_smoke", name: "write", args: { file_path: gameUpdatePath, content: gameUpdateContent } }
            : plainWriteTurn
              ? { id: "call_plain_write_smoke", name: "write", args: { file_path: plainWritePath, content: plainWriteContent } }
              : { id: "call_oh_story_write_smoke", name: "write", args: { file_path: agentMutationPath, content: agentMutationContent } };
        requests.push(roleParentTurn ? "role-parent-start" : productionIntentTurn ? "production-intent" : todoLayoutTurn ? "todo" : gameUpdateTurn ? "game-write" : plainWriteTurn ? "plain-write" : "write");
        const argumentsJson = JSON.stringify(tool.args);
        const chunks = argumentsJson.match(/.{1,14}/gu) ?? [argumentsJson];
        events = [
          JSON.stringify({ choices: [{ delta: { role: "assistant", content: null, reasoning_content: "" } }] }),
          ...chunks.map((argumentsDelta, index) => JSON.stringify({ choices: [{ delta: { tool_calls: [{
            index: 0,
            ...(index === 0 ? { id: tool.id, type: "function" } : {}),
            function: { ...(index === 0 ? { name: tool.name } : {}), arguments: argumentsDelta }
          }] } }] })),
          JSON.stringify({ choices: [{ delta: { content: "" }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 12, completion_tokens: 20 } }),
          "[DONE]"
        ];
      } else {
        if (roleParentTurn && !serialized.includes(roleChildReply)) {
          requests.push("role-parent-resume-missing-result");
          response.writeHead(422, { "content-type": "application/json" }).end('{"error":"role child result was not returned to the parent"}');
          return;
        }
        requests.push(roleParentTurn ? "role-parent-resume" : productionTurn ? "production" : "other");
        const content = longReplyTurn
          ? longReplyContent
          : roleParentTurn
          ? roleParentReply
          : productionIntentTurn
            ? productionIntentReply
          : mutationTurn
            ? gameUpdateTurn ? gameUpdateReply : plainWriteTurn ? plainWriteReply : agentMutationReply
            : currentTurn.includes(plainPrompt)
              ? plainReply
            : serialized.includes("Video Studio")
              ? videoReply
            : serialized.includes("Game Studio")
              ? gameReply
              : serialized.includes(storyProjectName) ? storyReply : dramaReply;
        // A long answer arrives as many deltas, so the tail settles after the
        // reader is already parked at the bottom.
        const contentChunks = content.match(/[\s\S]{1,64}/gu) ?? [content];
        events = [
          JSON.stringify({ choices: [{ delta: { role: "assistant", content: null, reasoning_content: "" } }] }),
          ...contentChunks.map((chunk) => JSON.stringify({ choices: [{ delta: { content: chunk } }] })),
          JSON.stringify({ choices: [{ delta: { content: "" }, finish_reason: "stop" }], usage: { prompt_tokens: 12, completion_tokens: 20 } }),
          "[DONE]"
        ];
      }
      response.writeHead(200, {
        "cache-control": "no-cache",
        "content-type": "text/event-stream",
        connection: "keep-alive"
      });
      response.flushHeaders();
      response.socket?.setNoDelay(true);
      for (const event of events) {
        response.write(`data: ${event}\n\n`);
        if (productionTurn || todoLayoutTurn || (mutationTurn && !hasToolResult)) {
          await new Promise((accept) => setTimeout(accept, productionTurn ? 750 : todoLayoutTurn ? 500 : 180));
        }
      }
      response.end();
    });
  });
  await new Promise<void>((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Could not start the local DeepSeek fixture.");
  return { baseURL: `http://127.0.0.1:${String(address.port)}`, requests, server };
}

async function closeServer(server: HttpServer): Promise<void> {
  await new Promise<void>((accept, reject) => server.close((error) => error ? reject(error) : accept()));
}

let dshAuthCookie: string | undefined;

/**
 * DSH 0.1.2 gates Web and `/api` behind a session cookie. Exchange the one-time
 * token the CLI prints at startup for that cookie, and hand the same URL to
 * Chrome so the browser authorizes itself the way a user would.
 */
async function authorizeDsh(origin: string, logs: readonly string[]): Promise<string> {
  const pattern = new RegExp(`${origin.replaceAll(".", "\\.")}/\\?token=[A-Za-z0-9_.-]+`, "u");
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const tokenUrl = pattern.exec(logs.join(""))?.[0];
    if (tokenUrl !== undefined) {
      try {
        const response = await fetch(tokenUrl, { redirect: "manual" });
        const cookie = response.headers.getSetCookie().map((entry) => entry.split(";", 1)[0]).join("; ");
        if (cookie !== "") {
          dshAuthCookie = cookie;
          return tokenUrl;
        }
      } catch { /* retry */ }
    }
    await new Promise((accept) => setTimeout(accept, 150));
  }
  throw new Error("Timed out waiting for official DSH Web.");
}

/** Every request to DSH carries the session cookie obtained by {@link authorizeDsh}. */
async function dshFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, headers: { ...init.headers as Record<string, string>, cookie: dshAuthCookie ?? "" } });
}

interface HistoryEvent { readonly seq: number; readonly type: string; readonly data: unknown }

/**
 * DSH 0.1.2 addresses Remotes as `<namespace>/<method>` and carries the call in
 * a single `args` field, so the wire method must equal the endpoint path.
 */
async function rpc<T>(origin: string, endpoint: string, args: object): Promise<T> {
  const rpcId = `oh-story-smoke-${crypto.randomUUID()}`;
  const deadline = Date.now() + 15_000;
  while (true) {
    const response = await dshFetch(`${origin}/api/${endpoint}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "client-request", rpcId, method: endpoint, payload: { args } })
    });
    const body = await response.text();
    if (response.status === 404 && body.trim() === "not found" && Date.now() < deadline) {
      await new Promise((accept) => setTimeout(accept, 100));
      continue;
    }
    let envelope: {
      readonly rpcId: string;
      readonly result: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };
    };
    try { envelope = JSON.parse(body) as typeof envelope; }
    catch { throw new Error(`DSH ${endpoint} returned HTTP ${String(response.status)} with a non-JSON body: ${body.slice(0, 200)}`); }
    if (!response.ok || envelope.rpcId !== rpcId || !envelope.result.ok) {
      throw new Error(`DSH ${endpoint} failed: ${JSON.stringify(envelope)}`);
    }
    return envelope.result.value;
  }
}

interface HistoryRecord { readonly type: string; readonly event: HistoryEvent }

/**
 * `session.history` is gone: the durable log now arrives as the opening
 * snapshot of the `session/follow` stream, multiplexed over one WebSocket.
 */
async function sessionEvents(origin: string, sessionId: string): Promise<readonly HistoryEvent[]> {
  const address = `${origin.replace(/^http/u, "ws")}${REMOTE_STREAM_MUX_PATH}`;
  // Node's WebSocket takes request headers through an option its DOM types omit.
  const socket = new WebSocket(address, { headers: { cookie: dshAuthCookie ?? "" } } as unknown as string[]);
  let stalled: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<readonly HistoryEvent[]>((accept, reject) => {
      const streamId = crypto.randomUUID();
      stalled = setTimeout(() => { reject(new Error("DSH session/follow produced no opening snapshot.")); }, 30_000);
      socket.addEventListener("error", () => { reject(new Error("DSH session/follow stream failed to open.")); });
      socket.addEventListener("close", () => { reject(new Error("DSH closed session/follow before the opening snapshot.")); });
      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({
          type: "open",
          streamId,
          endpoint: "session/follow",
          payload: { args: { request: { address: { kind: "session", sessionId }, maxMessages: 1_000 } } }
        }));
      });
      socket.addEventListener("message", (message: MessageEvent) => {
        const frame = JSON.parse(String(message.data)) as {
          readonly type: string;
          readonly streamId: string;
          readonly value?: { readonly type: string; readonly records?: readonly HistoryRecord[] };
          readonly error?: { readonly message: string };
        };
        if (frame.streamId !== streamId) return;
        if (frame.type === "error") { reject(new Error(`DSH session/follow failed: ${frame.error?.message ?? "unknown"}`)); return; }
        if (frame.type !== "item" || frame.value?.type !== "snapshot") return;
        accept((frame.value.records ?? []).filter((record) => record.type === "event").map((record) => record.event));
      });
    });
  } finally { clearTimeout(stalled); socket.close(); }
}

async function waitForCompletedTurn(origin: string, sessionId: string, afterSeq = -1): Promise<readonly HistoryEvent[]> {
  const timeout = useRealDeepSeek ? 600_000 : 30_000;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const events = (await sessionEvents(origin, sessionId)).filter((event) => event.seq > afterSeq);
    const end = [...events].reverse().find((event) => event.type === "turn/end");
    if (end !== undefined) {
      const reason = (end.data as { readonly reason?: { readonly kind?: string } }).reason?.kind;
      if (reason !== "completed") {
        throw new Error(`DSH Agent turn ended with ${String(reason)}: ${JSON.stringify({ end: end.data, tail: events.slice(-12).map((event) => ({ seq: event.seq, type: event.type, data: event.data })) })}`);
      }
      if (!events.some((event) => event.type === "assistant/message")) throw new Error("DSH Agent turn has no assistant result.");
      return events;
    }
    await new Promise((accept) => setTimeout(accept, 100));
  }
  throw new Error(`DSH Agent turn did not complete within ${String(timeout / 1_000)} seconds.`);
}

async function prepareSession(origin: string, sessionId: string, prompt: string, title: string): Promise<void> {
  const models = await rpc<{
    readonly groups: readonly { readonly id: string; readonly models: readonly { readonly id: string }[] }[];
  }>(origin, "session/modelCatalog", {});
  const deepseek = models.groups.find((group) => group.id === "deepseek-official");
  const model = deepseek?.models.find((candidate) => candidate.id === "deepseek-v4-flash")?.id ?? deepseek?.models[0]?.id;
  if (deepseek === undefined || model === undefined) throw new Error("DSH did not expose a DeepSeek official model.");
  await rpc(origin, "session/selectModel", { request: { sessionId, provider: deepseek.id, model } });
  await rpc(origin, "session/prompt", {
    request: {
      requestId: crypto.randomUUID(),
      sessionId,
      mode: "queue",
      content: [{ type: "text", text: prompt }]
    }
  });
  await waitForCompletedTurn(origin, sessionId);
  await rpc(origin, "session/rename", { request: { sessionId, title } });
}

/** Send one request with headers verbatim; fetch silently drops a forged Host. */
async function rawStatus(target: string, headers: Readonly<Record<string, string>>): Promise<number> {
  const url = new URL(target);
  return new Promise<number>((accept, reject) => {
    const call = httpRequest({
      host: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: { host: url.host, ...headers }
    }, (response) => {
      response.resume();
      response.once("end", () => { accept(response.statusCode ?? 0); });
    });
    call.once("error", reject);
    call.end();
  });
}

async function ensureOpen(summary: ReturnType<Page["locator"]>): Promise<void> {
  const details = summary.locator("..");
  const open = await details.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!open) await summary.click();
}

async function openGroup(page: Page, label: string): Promise<void> {
  const summary = page.locator(".oh-story-file-group > summary").filter({ hasText: new RegExp(`^${label}\\d+$`, "u") }).first();
  await summary.waitFor({ state: "visible", timeout: 10_000 });
  await ensureOpen(summary);
}

async function openFolder(page: Page, label: string): Promise<void> {
  const summary = page.locator(".oh-story-file-folder > summary").filter({ hasText: new RegExp(`^${label}\\d+$`, "u") }).first();
  await summary.waitFor({ state: "visible", timeout: 10_000 });
  await ensureOpen(summary);
}

/** DSH 0.1.2 folds a completed Turn's tool calls behind a turn-process disclosure. */
async function expandTurnProcesses(page: Page): Promise<void> {
  const collapsed = page.locator('button[data-turn-process][aria-expanded="false"]');
  // Each click re-renders the flow, so re-resolve the first collapsed toggle every round.
  for (let round = 0; round < 32 && await collapsed.count() > 0; round += 1) {
    await collapsed.first().click();
  }
}

async function selectFile(page: Page, path: string): Promise<void> {
  const button = page.locator(`button[data-file-path=${JSON.stringify(path)}]`);
  await button.waitFor({ state: "visible", timeout: 10_000 });
  await button.click();
}

async function selectSession(page: Page, workspaceTitle: string, sessionTitle: string): Promise<void> {
  const open = page.getByRole("button", { name: /^(?:Open sidebar|打开侧边栏)$/u }).first();
  if (await open.isVisible()) await open.click();
  const workspaceRow = page.getByRole("treeitem").filter({ hasText: workspaceTitle }).first();
  await workspaceRow.waitFor({ state: "visible", timeout: 10_000 });
  if (await workspaceRow.getAttribute("aria-expanded") !== "true") await workspaceRow.click();
  const sessionRow = page.getByRole("treeitem").filter({ hasText: sessionTitle }).first();
  await sessionRow.waitFor({ state: "visible", timeout: 10_000 });
  await sessionRow.click();
  await page.getByRole("treeitem", { selected: true }).filter({ hasText: sessionTitle }).first()
    .waitFor({ state: "visible", timeout: 10_000 });
}

async function assertChatAnchorContract(
  page: Page,
  chat: Locator,
  scroller: Locator,
  composer: Locator,
  expectedLayout: "wide" | "medium" | "compact"
): Promise<void> {
  await page.waitForFunction((layout) => (
    document.querySelector("[data-conversation-scroll]")?.getAttribute("data-oh-story-layout") === layout
  ), expectedLayout);
  const anchor = page.locator("[data-chat-flow-key]").last();
  let measurement: {
    readonly anchorBox: Awaited<ReturnType<Locator["boundingBox"]>>;
    readonly composerBox: Awaited<ReturnType<Locator["boundingBox"]>>;
    readonly chatBox: Awaited<ReturnType<Locator["boundingBox"]>>;
    readonly scrollPaddingBottom: number;
  } | undefined;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await anchor.evaluate(async (element) => {
      element.scrollIntoView({ block: "end" });
      await new Promise<void>((accept) => { requestAnimationFrame(() => { requestAnimationFrame(() => { accept(); }); }); });
    });
    const [anchorBox, composerBox, chatBox, scrollPaddingBottom] = await Promise.all([
      anchor.boundingBox(), composer.boundingBox(), chat.boundingBox(),
      scroller.evaluate((element) => Number.parseFloat(getComputedStyle(element).scrollPaddingBottom))
    ]);
    measurement = { anchorBox, composerBox, chatBox, scrollPaddingBottom };
    if (anchorBox !== null && composerBox !== null && chatBox !== null
      && anchorBox.y + anchorBox.height <= composerBox.y - 15
      && scrollPaddingBottom >= composerBox.height + 15
      && composerBox.x >= chatBox.x - 1
      && composerBox.x + composerBox.width <= chatBox.x + chatBox.width + 1) return;
  }
  throw new Error(`Chat anchor contract failed in ${expectedLayout} layout: ${JSON.stringify(measurement)}`);
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGINT");
  await Promise.race([
    new Promise<void>((accept) => child.once("exit", () => accept())),
    new Promise<void>((accept) => setTimeout(accept, 3_000))
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

async function main(): Promise<void> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "oh-story-native-dsh-smoke-"));
  const packDirectory = join(temporaryRoot, "pack");
  const installation = join(temporaryRoot, "dsh");
  const dshHome = join(temporaryRoot, "home");
  const projectsRoot = join(temporaryRoot, "projects");
  const storyRoot = join(projectsRoot, storyProjectName);
  const dramaRoot = join(projectsRoot, dramaProjectName);
  const plainRoot = join(projectsRoot, plainProjectName);
  const origin = `http://127.0.0.1:${String(await freePort())}`;
  const logs: string[] = [];
  let child: ChildProcess | undefined;
  let mockDeepSeek: MockDeepSeek | undefined;
  try {
    await Promise.all([
      cp(storyFixture, storyRoot, { recursive: true }),
      cp(dramaFixture, dramaRoot, { recursive: true }),
      mkdir(join(plainRoot, "src"), { recursive: true })
    ]);
    // DSH is a general Harness. This workspace holds ordinary work plus an empty
    // creative directory, so the plugin has a place to write into later but nothing
    // to show yet.
    await Promise.all([
      mkdir(join(plainRoot, "正文"), { recursive: true }),
      writeFile(join(plainRoot, "README.md"), "# Plain DSH workspace\n\n没有小说、短剧、游戏或视频项目。\n"),
      writeFile(join(plainRoot, "src", "main.ts"), "export const main = (): string => \"plain\";\n")
    ]);
    const generatedGameRoot = join(storyRoot, "game-adaptations", generatedGameId);
    await Promise.all([
      mkdir(join(generatedGameRoot, "build", "app"), { recursive: true }),
      mkdir(join(generatedGameRoot, "qa"), { recursive: true })
    ]);
    await Promise.all([
      writeFile(join(generatedGameRoot, "PRODUCT_BRIEF.md"), "# PRODUCT_BRIEF · DSH Game Studio Smoke\n\ntargetFinish: playable-prototype\n"),
      writeFile(join(generatedGameRoot, "_progress.md"), "# Progress\n\n- playable: complete\n"),
      writeFile(join(generatedGameRoot, "build", "app", "index.html"), "<!doctype html><html lang=zh-CN><meta charset=utf-8><title>DSH Game Smoke</title><button id=play>试玩成功</button><script>document.querySelector('#play').addEventListener('click',event=>event.currentTarget.textContent='输入已验证')</script></html>"),
      writeFile(join(generatedGameRoot, "qa", "verification.json"), `${JSON.stringify({
        schemaVersion: 3,
        status: "PASS",
        completeRun: { id: "dsh-game-studio-smoke" },
        checks: { launch: "PASS", render: "PASS", input: "PASS", coreLoop: "PASS", outcome: "PASS", restart: "PASS" },
        limitations: []
      }, null, 2)}\n`)
    ]);
    const videoProjectRoot = join(storyRoot, "video-recaps", "smoke-recap");
    await Promise.all([
      mkdir(join(videoProjectRoot, "sources"), { recursive: true }),
      mkdir(join(videoProjectRoot, "work"), { recursive: true }),
      mkdir(join(videoProjectRoot, "outputs"), { recursive: true })
    ]);
    await Promise.all([
      cp(videoMediaFixture, join(videoProjectRoot, "sources", "source.mp4")),
      cp(videoMediaFixture, join(videoProjectRoot, "work", "edited_source.mp4")),
      cp(videoMediaFixture, join(videoProjectRoot, "outputs", "recap_smoke.mp4")),
      writeFile(join(videoProjectRoot, "project.json"), `${JSON.stringify({ title: "DSH Video Recap Smoke" }, null, 2)}\n`),
      writeFile(join(videoProjectRoot, "work", "recap_run_manifest.json"), `${JSON.stringify({
        source_video: "video-recaps/smoke-recap/sources/source.mp4",
        settings: { edit_mode: "cut" }
      }, null, 2)}\n`),
      writeFile(join(videoProjectRoot, "work", "clip_plan.json"), `${JSON.stringify({ clips: [{ source_start: 0, source_end: 5 }] }, null, 2)}\n`),
      writeFile(join(videoProjectRoot, "work", "narration.json"), `${JSON.stringify([{ start: 0, end: 2, text: "视频工作台烟测" }], null, 2)}\n`),
      writeFile(join(videoProjectRoot, "work", "assembly_manifest.json"), `${JSON.stringify({ final_output: "video-recaps/smoke-recap/outputs/recap_smoke.mp4" }, null, 2)}\n`)
    ]);

    const secondEpisode = join(dramaRoot, "剧集", "EP002");
    await cp(join(dramaRoot, "剧集", "EP001"), secondEpisode, { recursive: true });
    await Promise.all(dramaCreatorFiles.map(async (name) => {
      const path = join(secondEpisode, name);
      const source = await readFile(path, "utf8");
      await writeFile(path, source.replaceAll("EP001", "EP002").replaceAll("空白账号", "百万倒计时"));
    }));
    runPnpm(["--filter", "@oh-story/dsh", "build"]);
    runPnpm(["--filter", "@oh-story/dsh", "pack", "--pack-destination", packDirectory]);
    await mkdir(installation, { recursive: true });
    await writeFile(join(installation, "package.json"), `${JSON.stringify({ private: true, dependencies: { "@deepseek-ai/dsh": dshVersion } }, null, 2)}\n`);
    await writeFile(join(installation, "pnpm-workspace.yaml"), [
      "packages:", "  - .", "nodeLinker: hoisted", "allowBuilds:",
      "  '@deepseek-ai/dsh-subprocess-local': true", "  '@google/genai': false", "  koffi: true",
      "  node-addon-require-builtin: false", "  node-pty: true", "  protobufjs: false", ""
    ].join("\n"));
    try { runPnpm(["--dir", installation, "install", "--offline"]); }
    catch { runPnpm(["--dir", installation, "install"]); }
    const dshBin = join(installation, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
    const tarball = (await readdir(packDirectory)).find((entry) => entry.endsWith(".tgz"));
    if (tarball === undefined) throw new Error("Plugin pack did not create a tarball.");
    const archivePath = join(packDirectory, tarball);
    const archive = spawnSync("tar", ["-tzf", archivePath], { cwd: repositoryRoot, encoding: "utf8", stdio: "pipe" });
    if (archive.status !== 0) throw new Error(`Could not inspect plugin tarball:\n${archive.stderr}`);
    const entries = new Set(archive.stdout.split(/\r?\n/u).filter((entry) => entry !== ""));
    for (const required of [
      "package/LICENSE", "package/README.md", "package/cordis.patch.yml", "package/package.json",
      "package/lib/index.js", "package/lib/client.js", "package/lib/oh-story/manifest.json", "package/lib/drama/manifest.json",
      "package/lib/novel-to-game/manifest.json",
      "package/lib/video-recap/manifest.json",
      "package/lib/oh-story/skills/story-setup/references/agent-references/writing-craft.md",
      "package/lib/drama/skills/short-drama/references/creator-documents.md",
      "package/lib/drama/skills/short-drama-storyboard/references/comic-keyframe-lexicon.md",
      "package/lib/novel-to-game/skills/novel-to-game/references/pipeline-contract.md",
      "package/lib/novel-to-game/examples/jin-ping-mei/build/app/index.html",
      "package/lib/novel-to-game/examples/jin-ping-mei/qa/verification.json",
      "package/lib/video-recap/skills/video-recap/scripts/recap.py",
      "package/lib/video-recap/skills/video-recap/scripts/recap_inspect.py"
    ]) {
      if (!entries.has(required)) throw new Error(`Plugin tarball is missing ${required}.`);
    }
    for (const entry of entries) {
      if (/\/(?:src|tests)\//u.test(entry)
        || /(?:^|\/)__pycache__(?:\/|$)/u.test(entry)
        || /\.pyc$/u.test(entry)
        || /(?:^|\/)\.DS_Store$/u.test(entry)
        || /copy-path-safety\.py$/u.test(entry)
        || /dashboard_server\.py$/u.test(entry)
        || /drama\/skills\/short-drama\/references\/lifecycle-commands\.md$/u.test(entry)) {
        throw new Error(`Plugin tarball retained forbidden content: ${entry}`);
      }
    }
    const realApiKey = useRealDeepSeek ? process.env.DEEPSEEK_API_KEY : undefined;
    if (useRealDeepSeek && realApiKey === undefined) {
      throw new Error("Real demo capture requires DEEPSEEK_API_KEY.");
    }
    if (!useRealDeepSeek) mockDeepSeek = await startMockDeepSeek();
    const env = {
      ...process.env,
      COREPACK_ENABLE_PROJECT_SPEC: "0",
      DSH_HOME: dshHome,
      DSH_TELEMETRY_DISABLED: "1",
      DEEPSEEK_API_KEY: realApiKey ?? "oh-story-local-fixture",
      DEEPSEEK_BASE_URL: mockDeepSeek?.baseURL ?? "https://api.deepseek.com"
    };
    run(process.execPath, [dshBin, "plugin", "--profile", "web", "add", archivePath], env);
    const port = new URL(origin).port;
    child = spawn(process.execPath, [dshBin, "web", "--no-open", "--port", port], {
      cwd: repositoryRoot, env, stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout?.on("data", (chunk: Buffer) => logs.push(chunk.toString("utf8")));
    child.stderr?.on("data", (chunk: Buffer) => logs.push(chunk.toString("utf8")));
    const dshTokenUrl = await authorizeDsh(origin, logs);

    const storyWorkspace = await rpc<{ readonly workspace: { readonly workspaceId: string; readonly title: string } }>(origin, "workspace/create", { request: { path: storyRoot } });
    const dramaWorkspace = await rpc<{ readonly workspace: { readonly workspaceId: string; readonly title: string } }>(origin, "workspace/create", { request: { path: dramaRoot } });
    const plainWorkspace = await rpc<{ readonly workspace: { readonly workspaceId: string; readonly title: string } }>(origin, "workspace/create", { request: { path: plainRoot } });
    const storySession = await rpc<{ readonly sessionId: string }>(origin, "session/create", { request: { workspaceId: storyWorkspace.workspace.workspaceId } });
    const gameSession = await rpc<{ readonly sessionId: string }>(origin, "session/create", { request: { workspaceId: storyWorkspace.workspace.workspaceId } });
    // The Video Studio demo needs its own conversation beside the preview. The
    // correctness pass reaches the same workbench from the game session, and the
    // packaged run has too little timing headroom to carry a session it never asserts on.
    const videoSession = demoFramesDirectory === undefined
      ? undefined
      : await rpc<{ readonly sessionId: string }>(origin, "session/create", { request: { workspaceId: storyWorkspace.workspace.workspaceId } });
    const dramaSession = await rpc<{ readonly sessionId: string }>(origin, "session/create", { request: { workspaceId: dramaWorkspace.workspace.workspaceId } });
    const plainSession = await rpc<{ readonly sessionId: string }>(origin, "session/create", { request: { workspaceId: plainWorkspace.workspace.workspaceId } });
    const catalog = await rpc<{ readonly skills: readonly { readonly name: string }[] }>(origin, "skills/list", { request: { sessionId: storySession.sessionId } });
    const ohStorySkills = catalog.skills.filter((skill) => skill.name === "story" || skill.name.startsWith("story-") || skill.name === "browser-cdp");
    const dramaSkills = catalog.skills.filter((skill) => skill.name === "short-drama" || skill.name.startsWith("short-drama-"));
    const gameSkills = catalog.skills.filter((skill) => [
      "novel-to-game", "novel-game-analyze", "game-concept", "game-world-design", "game-art-direction", "game-build", "game-qa"
    ].includes(skill.name));
    const videoSkills = catalog.skills.filter((skill) => [
      "video-recap", "video-understanding", "video-script", "video-cut", "video-voiceover", "video-assemble"
    ].includes(skill.name));
    if (ohStorySkills.length !== 13) throw new Error(`Expected 13 Oh Story Skills, found ${String(ohStorySkills.length)}.`);
    if (dramaSkills.length !== 10) throw new Error(`Expected 10 Drama Skills, found ${String(dramaSkills.length)}.`);
    if (gameSkills.length !== 7) throw new Error(`Expected 7 NovelToGame Skills, found ${String(gameSkills.length)}.`);
    if (JSON.stringify(videoSkills.map((skill) => skill.name).sort()) !== JSON.stringify(["video-recap", "video-script"])) {
      throw new Error(`Expected the two user-invocable video-recap entries, found ${videoSkills.map((skill) => skill.name).join(", ")}.`);
    }
    const storySessionTitle = `小说 · ${storyProjectName}`;
    const gameSessionTitle = "游戏 · Live Game Lab";
    const videoSessionTitle = "视频 · Recap Lab";
    const dramaSessionTitle = `短剧 · ${dramaProjectName}`;
    const plainSessionTitle = "通用 · Plain Workspace";
    await prepareSession(origin, storySession.sessionId, storyPrompt, storySessionTitle);
    await prepareSession(origin, gameSession.sessionId, gamePrompt, gameSessionTitle);
    if (videoSession !== undefined) await prepareSession(origin, videoSession.sessionId, videoPrompt, videoSessionTitle);
    await prepareSession(origin, dramaSession.sessionId, dramaPrompt, dramaSessionTitle);
    await prepareSession(origin, plainSession.sessionId, plainPrompt, plainSessionTitle);

    if (!useRealDeepSeek) {
      const previousEvents = await sessionEvents(origin, storySession.sessionId);
      const afterSeq = previousEvents.at(-1)?.seq ?? -1;
      await rpc(origin, "session/prompt", {
        request: {
          requestId: crypto.randomUUID(),
          sessionId: storySession.sessionId,
          mode: "queue",
          content: [{ type: "text", text: roleSmokePrompt }]
        }
      });
      const roleEvents = await waitForCompletedTurn(origin, storySession.sessionId, afterSeq);
      const roleCalls = roleEvents.filter((event) => event.type === "tool/call")
        .map((event) => event.data as { readonly callId?: string; readonly name?: string; readonly arguments?: unknown })
        .filter((call) => call.name === "oh_story_role");
      const roleResult = roleEvents.filter((event) => event.type === "tool/result")
        .flatMap((event) => (event.data as {
          readonly message?: { readonly content?: readonly { readonly toolCallId?: string; readonly isError?: boolean }[] };
        }).message?.content ?? [])
        .find((result) => result.toolCallId === roleCalls[0]?.callId);
      let roleArguments: unknown;
      try {
        const value = roleCalls[0]?.arguments;
        roleArguments = typeof value === "string" ? JSON.parse(value) as unknown : value;
      } catch { roleArguments = undefined; }
      const roleTrace = mockDeepSeek?.requests.filter((kind) => kind.startsWith("role-")) ?? [];
      const serializedRoleEvents = JSON.stringify(roleEvents);
      if (roleCalls.length !== 1
        || (roleArguments as { readonly role?: unknown } | undefined)?.role !== "narrative-writer"
        || (roleArguments as { readonly prompt?: unknown } | undefined)?.prompt !== roleChildPrompt
        || roleResult?.isError !== false
        || !serializedRoleEvents.includes(roleChildReply)
        || !serializedRoleEvents.includes(roleParentReply)
        || JSON.stringify(roleTrace) !== JSON.stringify(["role-parent-start", "role-child-reference-start", "role-child-reference-resume", "role-parent-resume"])) {
        throw new Error(`Packaged oh_story_role contract failed: ${JSON.stringify({ roleCalls, roleArguments, roleResult, roleTrace, eventTypes: roleEvents.map((event) => event.type), hasChildReply: serializedRoleEvents.includes(roleChildReply), hasParentReply: serializedRoleEvents.includes(roleParentReply) })}`);
      }

      const dramaEventsBeforeIntent = await sessionEvents(origin, dramaSession.sessionId);
      const intentAfterSeq = dramaEventsBeforeIntent.at(-1)?.seq ?? -1;
      await rpc(origin, "session/prompt", {
        request: {
          requestId: crypto.randomUUID(),
          sessionId: dramaSession.sessionId,
          mode: "queue",
          content: [{ type: "text", text: productionIntentSmokePrompt }]
        }
      });
      const intentEvents = await waitForCompletedTurn(origin, dramaSession.sessionId, intentAfterSeq);
      const intentCalls = intentEvents.filter((event) => event.type === "tool/call")
        .map((event) => event.data as { readonly callId?: string; readonly name?: string; readonly arguments?: unknown })
        .filter((call) => call.name === "oh_story_production");
      const serializedIntentEvents = JSON.stringify(intentEvents);
      if (intentCalls.length !== 1 || !serializedIntentEvents.includes(productionIntentReply)
        || !serializedIntentEvents.includes("生产目标聚焦意图")
        || !serializedIntentEvents.includes("SHOT-EP001-008")) {
        throw new Error(`Packaged oh_story_production contract failed: ${JSON.stringify({ intentCalls, eventTypes: intentEvents.map((event) => event.type), serializedIntentEvents })}`);
      }
    }

    const storyWorkspaceResponse = await dshFetch(`${origin}/oh-story/workspace?sessionId=${encodeURIComponent(storySession.sessionId)}`);
    const storyWorkspacePayload = await storyWorkspaceResponse.json() as {
      readonly mode?: string;
      readonly cwd?: string;
      readonly files?: readonly { readonly path: string }[];
      readonly games?: readonly { readonly id: string; readonly title: string; readonly source: string; readonly previewUrl?: string; readonly verification?: { readonly status?: string; readonly binding?: string } }[];
      readonly videos?: readonly { readonly id: string; readonly title: string; readonly state: string; readonly previews: readonly { readonly role: string; readonly path: string }[] }[];
      readonly shortDrama?: unknown;
    };
    const bundledGame = storyWorkspacePayload.games?.find((game) => game.id === "example:jin-ping-mei");
    const generatedGame = storyWorkspacePayload.games?.find((game) => game.id === `workspace:${generatedGameId}`);
    const generatedVideo = storyWorkspacePayload.videos?.find((video) => video.id === "smoke-recap");
    if (!storyWorkspaceResponse.ok || storyWorkspacePayload.mode !== "dsh-session" || storyWorkspacePayload.cwd !== await realpath(storyRoot)
      || !storyWorkspacePayload.files?.some((file) => file.path.startsWith("正文/")) || storyWorkspacePayload.shortDrama !== null
      || bundledGame?.title !== "金瓶梅 · 风月总账" || bundledGame.source !== "example" || bundledGame.verification?.status !== "PASS"
      || bundledGame.verification.binding !== "PINNED"
      || bundledGame.previewUrl === undefined || generatedGame?.source !== "workspace" || generatedGame.previewUrl === undefined
      || generatedGame.verification?.status !== "PASS" || generatedGame.verification.binding !== "UNBOUND"
      || generatedVideo?.title !== "DSH Video Recap Smoke" || generatedVideo.state !== "ready"
      || JSON.stringify(generatedVideo.previews.map((preview) => preview.role)) !== JSON.stringify(["source", "edited", "final"])) {
      throw new Error(`Story Session workspace route failed: ${JSON.stringify(storyWorkspacePayload)}`);
    }
    const recapSourceUrl = `${origin}/oh-story/media?sessionId=${encodeURIComponent(storySession.sessionId)}&path=${encodeURIComponent("video-recaps/smoke-recap/sources/source.mp4")}`;
    const recapRange = await dshFetch(recapSourceUrl, { headers: { range: "bytes=-12" } });
    if (recapRange.status !== 206 || (await recapRange.arrayBuffer()).byteLength !== 12 || !recapRange.headers.get("content-range")?.startsWith("bytes ")) {
      throw new Error(`Video Studio suffix range failed: ${String(recapRange.status)} ${recapRange.headers.get("content-range") ?? ""}`);
    }
    const bundledPreview = await dshFetch(`${origin}${bundledGame.previewUrl}`);
    if (!bundledPreview.ok || !(await bundledPreview.text()).includes("金瓶梅·风月总账")) {
      throw new Error(`Bundled Jin Ping Mei preview route failed: ${String(bundledPreview.status)}.`);
    }
    const generatedPreview = await dshFetch(`${origin}${generatedGame.previewUrl}`);
    const generatedCsp = generatedPreview.headers.get("content-security-policy") ?? "";
    if (!generatedPreview.ok || !(await generatedPreview.text()).includes("试玩成功")
      || !generatedCsp.includes("/oh-story/game-preview/") || generatedCsp.includes("connect-src 'self'")) {
      throw new Error(`Workspace game preview route failed: ${String(generatedPreview.status)}.`);
    }
    const plainWorkspaceResponse = await dshFetch(`${origin}/oh-story/workspace?sessionId=${encodeURIComponent(plainSession.sessionId)}`);
    const plainWorkspacePayload = await plainWorkspaceResponse.json() as {
      readonly mode?: string;
      readonly files?: readonly unknown[];
      readonly videos?: readonly unknown[];
      readonly games?: readonly { readonly source: string }[];
    };
    // The bundled game example ships with the plugin, so it must never make a
    // workspace look like it holds creative work.
    if (!plainWorkspaceResponse.ok || plainWorkspacePayload.mode !== "dsh-session"
      || plainWorkspacePayload.files?.length !== 0 || plainWorkspacePayload.videos?.length !== 0
      || plainWorkspacePayload.games?.some((game) => game.source === "workspace") !== false) {
      throw new Error(`Plain workspace was not reported free of creative projects: ${JSON.stringify(plainWorkspacePayload)}`);
    }
    const dramaWorkspaceResponse = await dshFetch(`${origin}/oh-story/workspace?sessionId=${encodeURIComponent(dramaSession.sessionId)}`);
    const dramaWorkspacePayload = await dramaWorkspaceResponse.json() as { readonly mode?: string; readonly cwd?: string; readonly files?: readonly { readonly path: string; readonly kind?: string; readonly mimeType?: string }[]; readonly shortDrama?: unknown };
    const dramaPaths = dramaWorkspacePayload.files?.map((file) => file.path).sort() ?? [];
    const expectedDramaPaths = ["EP001", "EP002"].flatMap((episode) => dramaCreatorFiles.map((name) => `剧集/${episode}/${name}`)).sort();
    if (!dramaWorkspaceResponse.ok || dramaWorkspacePayload.mode !== "dsh-session" || dramaWorkspacePayload.cwd !== await realpath(dramaRoot)
      || JSON.stringify(dramaPaths) !== JSON.stringify(expectedDramaPaths) || dramaWorkspacePayload.shortDrama !== null
      || dramaPaths.some((path) => /\.jsonl?$/u.test(path))) {
      throw new Error(`Drama Session workspace route failed: ${JSON.stringify(dramaWorkspacePayload)}`);
    }
    const productionMediaPath = "剧集/EP001/制作成果/SHOT-EP001-001/SHOT-EP001-001-job-smoke.png";
    const productionMediaV2Path = "剧集/EP001/制作成果/SHOT-EP001-001/SHOT-EP001-001-job-smoke-v2.png";
    const productionVideoPath = "剧集/EP001/制作成果/SHOT-EP001-002/SHOT-EP001-002-job-video-smoke.mp4";
    await Promise.all([
      mkdir(join(dramaRoot, "剧集", "EP001", "制作成果", "SHOT-EP001-001"), { recursive: true }),
      mkdir(join(dramaRoot, "剧集", "EP001", "制作成果", "SHOT-EP001-002"), { recursive: true })
    ]);
    await Promise.all([
      cp(keyframeMediaFixture, join(dramaRoot, productionMediaPath)),
      cp(keyframeV2MediaFixture, join(dramaRoot, productionMediaV2Path)),
      cp(videoMediaFixture, join(dramaRoot, productionVideoPath))
    ]);
    const mediaWorkspaceResponse = await dshFetch(`${origin}/oh-story/workspace?sessionId=${encodeURIComponent(dramaSession.sessionId)}`);
    const mediaWorkspace = await mediaWorkspaceResponse.json() as { readonly files?: readonly { readonly path: string; readonly kind?: string; readonly mimeType?: string }[] };
    const listedMedia = mediaWorkspace.files?.find((file) => file.path === productionMediaPath);
    const listedMediaV2 = mediaWorkspace.files?.find((file) => file.path === productionMediaV2Path);
    const listedVideo = mediaWorkspace.files?.find((file) => file.path === productionVideoPath);
    if (!mediaWorkspaceResponse.ok || listedMedia?.kind !== "media" || listedMedia.mimeType !== "image/png"
      || listedMediaV2?.kind !== "media" || listedMediaV2.mimeType !== "image/png"
      || listedVideo?.kind !== "media" || listedVideo.mimeType !== "video/mp4") {
      throw new Error(`DSH workspace did not classify production media: ${JSON.stringify({ listedMedia, listedMediaV2, listedVideo })}`);
    }
    const productionMediaUrl = `${origin}/oh-story/media?sessionId=${encodeURIComponent(dramaSession.sessionId)}&path=${encodeURIComponent(productionMediaPath)}`;
    const rangeResponse = await dshFetch(productionMediaUrl, { headers: { range: "bytes=0-7" } });
    const rangeBytes = new Uint8Array(await rangeResponse.arrayBuffer());
    const keyframeBytes = await readFile(keyframeMediaFixture);
    if (rangeResponse.status !== 206 || rangeResponse.headers.get("content-range") !== `bytes 0-7/${String(keyframeBytes.byteLength)}`
      || Buffer.from(rangeBytes).toString("hex") !== "89504e470d0a1a0a") {
      throw new Error(`DSH media range route failed: ${JSON.stringify({ status: rangeResponse.status, range: rangeResponse.headers.get("content-range"), bytes: Buffer.from(rangeBytes).toString("hex") })}`);
    }
    const productionVideoUrl = `${origin}/oh-story/media?sessionId=${encodeURIComponent(dramaSession.sessionId)}&path=${encodeURIComponent(productionVideoPath)}`;
    const videoRangeResponse = await dshFetch(productionVideoUrl, { headers: { range: "bytes=0-11" } });
    const videoRangeBytes = Buffer.from(await videoRangeResponse.arrayBuffer());
    const videoBytes = await readFile(videoMediaFixture);
    if (videoRangeResponse.status !== 206 || videoRangeResponse.headers.get("content-range") !== `bytes 0-11/${String(videoBytes.byteLength)}`
      || videoRangeBytes.subarray(4, 8).toString("ascii") !== "ftyp") {
      throw new Error(`DSH video range route failed: ${JSON.stringify({ status: videoRangeResponse.status, range: videoRangeResponse.headers.get("content-range"), bytes: videoRangeBytes.toString("hex") })}`);
    }
    const escapedMedia = await dshFetch(`${origin}/oh-story/media?sessionId=${encodeURIComponent(dramaSession.sessionId)}&path=${encodeURIComponent("../secret.png")}`);
    if (escapedMedia.status !== 403) throw new Error(`Media route allowed path traversal: ${String(escapedMedia.status)}.`);
    const escaped = await dshFetch(`${origin}/oh-story/file?sessionId=${encodeURIComponent(storySession.sessionId)}&path=${encodeURIComponent("../package.json")}`);
    if (escaped.ok) throw new Error("Workspace route allowed path traversal.");
    const chapterPath = "正文/第001章_军宣新星.md";
    const chapterUrl = `${origin}/oh-story/file?sessionId=${encodeURIComponent(storySession.sessionId)}&path=${encodeURIComponent(chapterPath)}`;
    const chapterResponse = await dshFetch(chapterUrl);
    const chapter = await chapterResponse.json() as { readonly content?: string; readonly version?: string };
    if (!chapterResponse.ok || chapter.content === undefined || chapter.version === undefined) {
      throw new Error(`Workspace file version was unavailable: ${JSON.stringify(chapter)}`);
    }
    const staleWrite = await dshFetch(chapterUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: chapter.content, baseVersion: "stale-version" })
    });
    if (staleWrite.status !== 412) throw new Error(`Workspace route accepted a stale write: ${String(staleWrite.status)}.`);
    const unchangedWrite = await dshFetch(chapterUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: chapter.content, baseVersion: chapter.version })
    });
    const unchanged = await unchangedWrite.json() as { readonly version?: string };
    if (!unchangedWrite.ok || unchanged.version === undefined) {
      throw new Error(`Workspace optimistic save failed: ${JSON.stringify(unchanged)}`);
    }
    const candidates = Array.from({ length: 20 }, (_, index) => `${chapter.content}\n<!-- atomic-${String(index)} -->\n`);
    const concurrent = await Promise.all(candidates.map((content) => dshFetch(chapterUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, baseVersion: unchanged.version })
    })));
    const winnerCount = concurrent.filter((response) => response.ok).length;
    const staleCount = concurrent.filter((response) => response.status === 412).length;
    if (winnerCount !== 1 || staleCount !== candidates.length - 1) {
      throw new Error(`Workspace CAS was not atomic: ${JSON.stringify(concurrent.map((response) => response.status))}`);
    }
    const afterRaceResponse = await dshFetch(chapterUrl);
    const afterRace = await afterRaceResponse.json() as { readonly content?: string; readonly version?: string };
    if (!afterRaceResponse.ok || afterRace.content === undefined || afterRace.version === undefined || !candidates.includes(afterRace.content)) {
      throw new Error(`Workspace CAS winner was not authoritative: ${JSON.stringify(afterRace)}`);
    }
    const restoreChapter = await dshFetch(chapterUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: chapter.content, baseVersion: afterRace.version })
    });
    if (!restoreChapter.ok) throw new Error(`Workspace CAS fixture restore failed: ${String(restoreChapter.status)}.`);

    const trackingPath = "追踪/_tracking-state.json";
    const trackingUrl = `${origin}/oh-story/file?sessionId=${encodeURIComponent(storySession.sessionId)}&path=${encodeURIComponent(trackingPath)}`;
    const trackingResponse = await dshFetch(trackingUrl);
    const tracking = await trackingResponse.json() as { readonly content?: string; readonly version?: string };
    if (!trackingResponse.ok || tracking.content === undefined || tracking.version === undefined) throw new Error("Tracking fixture was unavailable.");
    const invalidTrackingResponse = await dshFetch(trackingUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "{ invalid", baseVersion: tracking.version })
    });
    const invalidTracking = await invalidTrackingResponse.json() as { readonly version?: string };
    if (!invalidTrackingResponse.ok || invalidTracking.version === undefined) throw new Error("Could not stage invalid tracking JSON.");
    const degradedWorkspaceResponse = await dshFetch(`${origin}/oh-story/workspace?sessionId=${encodeURIComponent(storySession.sessionId)}`);
    const degradedWorkspace = await degradedWorkspaceResponse.json() as { readonly files?: readonly unknown[]; readonly metadataErrors?: readonly string[] };
    if (!degradedWorkspaceResponse.ok || degradedWorkspace.files === undefined
      || !degradedWorkspace.metadataErrors?.some((message) => message.includes(trackingPath))) {
      throw new Error(`Invalid metadata still broke the workspace: ${JSON.stringify(degradedWorkspace)}`);
    }
    const restoreTracking = await dshFetch(trackingUrl, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: tracking.content, baseVersion: invalidTracking.version })
    });
    if (!restoreTracking.ok) throw new Error(`Tracking fixture restore failed: ${String(restoreTracking.status)}.`);
    // The Host/Origin/Fetch-Metadata fence is unit-tested in isolation; assert it
    // against the mounted route so dropping it from the handler cannot pass CI.
    // These go over node:http because fetch refuses to forge a Host header.
    // The same-origin control keeps the rejections below from passing vacuously.
    const trusted = await rawStatus(chapterUrl, { "sec-fetch-site": "same-origin" });
    if (trusted !== 200) throw new Error(`Workspace route rejected a same-origin request: ${String(trusted)}.`);
    for (const [label, headers] of [
      ["rebound Host", { host: "attacker.example" }],
      ["cross-site marker", { "sec-fetch-site": "cross-site" }],
      ["foreign Origin", { origin: "http://attacker.example" }],
      ["opaque Origin", { origin: "null" }]
    ] as const) {
      const status = await rawStatus(chapterUrl, headers);
      if (status !== 403) {
        throw new Error(`Workspace route served an untrusted request (${label}): ${String(status)}.`);
      }
    }

    // DSH 0.1.2 preloads every browser module through one combined `/plugins/??a,b` URL,
    // so the plugin's own registration is sliced back out of the shared response.
    const index = await (await dshFetch(origin)).text();
    const preloadPath = index.match(/\/plugins\/\?\?[^"']+/u)?.[0].replaceAll("&amp;", "&");
    if (preloadPath === undefined || !preloadPath.includes("@oh-story/dsh/client.js")) {
      throw new Error("DSH did not publish the Oh Story Browser module.");
    }
    const bundle = await (await dshFetch(new URL(preloadPath, origin))).text();
    const registration = 'window.__ModuleLoader__.load({id:"';
    const start = bundle.indexOf(`${registration}@oh-story/dsh"`);
    if (start < 0) throw new Error("DSH did not serve the Oh Story Browser module.");
    const next = bundle.indexOf(registration, start + registration.length);
    const client = next < 0 ? bundle.slice(start) : bundle.slice(start, next);
    for (const slot of ["shell.overlay", "tool.call.toolview"]) {
      if (!client.includes(slot)) throw new Error(`Browser module is missing official slot ${slot}.`);
    }
    for (const forbidden of ["conversation.session.header.actions", "EventSource", "FakeRuntimeAdapter"]) {
      if (client.includes(forbidden)) throw new Error(`Browser module still contains legacy surface ${forbidden}.`);
    }

    if (process.env.OH_STORY_EXTERNAL_CAPTURE === "1") {
      process.stdout.write(`OH_STORY_CAPTURE_READY ${JSON.stringify({ origin, dshTokenUrl, dramaWorkspaceTitle: dramaWorkspace.workspace.title, dramaSessionTitle })}\n`);
      await new Promise<void>((accept) => {
        const stop = () => { accept(); };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
      });
    } else {
      const browser = await chromium.launch({ channel: browserChannel, headless: true });
      try {
      const page = await browser.newPage({ viewport: { width: 1_440, height: 900 } });
      const pageErrors: string[] = [];
      const gamePreviewResponses: { readonly status: number; readonly url: string }[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("response", (response) => {
        if (response.url().includes("/oh-story/game-preview/")) gamePreviewResponses.push({ status: response.status(), url: response.url() });
      });
      await page.goto(dshTokenUrl, { waitUntil: "networkidle" });
      for (const name of [/^(?:Continue|继续)$/u, /^(?:Configure later|稍后配置)$/u]) {
        const button = page.getByRole("button", { name });
        try {
          await button.waitFor({ state: "visible", timeout: 10_000 });
          await button.click();
        } catch { /* the step may already be persisted */ }
      }
      await page.locator('[class*="onboardingOverlay"]').waitFor({ state: "detached", timeout: 10_000 }).catch(() => undefined);
      await selectSession(page, storyWorkspace.workspace.title, storySessionTitle);
      const blankSession = page.locator("button").filter({ hasText: /^\s*(?:New Session|新会话)\s*$/iu }).first();
      try { await blankSession.waitFor({ state: "visible", timeout: 10_000 }); }
      catch (error) {
        const buttons = await page.getByRole("button").allTextContents();
        const body = (await page.locator("body").innerText()).slice(0, 4_000);
        throw new Error(`New Session action was not visible; buttons=${JSON.stringify(buttons)}; pageErrors=${JSON.stringify(pageErrors)}; body=${JSON.stringify(body)}`, { cause: error });
      }
      await blankSession.click();
      await page.getByRole("treeitem", { selected: true }).filter({ hasText: /^(?:New Session|新会话)$/iu })
        .waitFor({ state: "visible", timeout: 10_000 });
      await page.getByRole("navigation", { name: "小说项目文件" }).waitFor({ state: "visible", timeout: 20_000 });
      if (await page.locator(".oh-story-split-surface").count() !== 1) {
        throw new Error("Blank DSH Session did not mount the three-column workbench.");
      }

      // DSH is used for far more than creation, so an installed plugin may not
      // claim every conversation: a workspace with no creative project keeps the
      // official layout, the workbench arrives with the first creative file, and
      // the creator can hand the layout back at any time (#29).
      const layoutScroller = page.locator("[data-conversation-scroll]");
      const layoutChat = page.locator('[data-slot="conversation.session"] > :not(.oh-story-split-surface)').first();
      const chatWidth = async (): Promise<number> => {
        const box = await layoutChat.boundingBox();
        if (box === null) throw new Error("The official Chat column was not measurable.");
        return box.width;
      };
      await selectSession(page, plainWorkspace.workspace.title, plainSessionTitle);
      await page.getByText(plainPrompt, { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      const plainChatWidth = await chatWidth();
      if (await page.locator(".oh-story-split-surface").count() !== 0
        || await page.getByRole("button", { name: "打开创作工作台" }).count() !== 0
        || await layoutScroller.getAttribute("data-oh-story-layout") !== null) {
        throw new Error("A workspace without creative projects still lost its official conversation layout.");
      }

      const beforePlainWrite = (await sessionEvents(origin, plainSession.sessionId)).at(-1)?.seq ?? -1;
      const plainWriteRequest = rpc(origin, "session/prompt", {
        request: {
          requestId: crypto.randomUUID(),
          sessionId: plainSession.sessionId,
          mode: "queue",
          content: [{ type: "text", text: plainWritePrompt }]
        }
      });
      const plainApproval = page.getByRole("button", { name: /^(?:Allow once|允许一次)$/u });
      try {
        await plainApproval.waitFor({ state: "visible", timeout: 8_000 });
        await plainApproval.click();
      } catch { /* workspace writes may already be allowed by the active preset */ }
      await plainWriteRequest;
      await waitForCompletedTurn(origin, plainSession.sessionId, beforePlainWrite);
      await page.getByRole("navigation", { name: "小说项目文件" }).waitFor({ state: "visible", timeout: 20_000 });
      const workbenchChatWidth = await chatWidth();
      if (await layoutScroller.getAttribute("data-oh-story-layout") !== "wide"
        || plainChatWidth < workbenchChatWidth + 200) {
        throw new Error(`The first creative file did not hand the layout to the workbench: ${JSON.stringify({ plainChatWidth, workbenchChatWidth })}`);
      }

      const collapseWorkbench = page.getByRole("button", { name: "收起创作工作台" }).first();
      await collapseWorkbench.click();
      const workbenchLauncher = page.getByRole("button", { name: "打开创作工作台" });
      await workbenchLauncher.waitFor({ state: "visible", timeout: 10_000 });
      await page.locator(".oh-story-tree").waitFor({ state: "detached", timeout: 10_000 });
      const collapsedChatWidth = await chatWidth();
      const [launcherBox, launcherScroller] = await Promise.all([workbenchLauncher.boundingBox(), layoutScroller.boundingBox()]);
      if (await layoutScroller.getAttribute("data-oh-story-layout") !== null
        || collapsedChatWidth < workbenchChatWidth + 200
        || launcherBox === null || launcherScroller === null
        || launcherBox.x < launcherScroller.x - 1
        || launcherBox.x + launcherBox.width > launcherScroller.x + launcherScroller.width + 1
        || launcherBox.y < launcherScroller.y - 1
        || launcherBox.y + launcherBox.height > launcherScroller.y + launcherScroller.height + 1) {
        throw new Error(`Collapsing the workbench did not restore the official conversation: ${JSON.stringify({ collapsedChatWidth, workbenchChatWidth, launcherBox, launcherScroller })}`);
      }

      // The Session Store is not persisted, so the choice has to survive on its own:
      // a new Session in the same workspace must open collapsed.
      const plainBlankSession = page.locator("button").filter({ hasText: /^\s*(?:New Session|新会话)\s*$/iu }).first();
      await plainBlankSession.waitFor({ state: "visible", timeout: 10_000 });
      await plainBlankSession.click();
      await page.getByRole("treeitem", { selected: true }).filter({ hasText: /^(?:New Session|新会话)$/iu })
        .waitFor({ state: "visible", timeout: 10_000 });
      await workbenchLauncher.waitFor({ state: "visible", timeout: 10_000 });
      if (await page.locator(".oh-story-tree").count() !== 0
        || await layoutScroller.getAttribute("data-oh-story-layout") !== null) {
        throw new Error("A collapsed workbench reopened itself in a new Session of the same workspace.");
      }
      await workbenchLauncher.click();
      await page.getByRole("navigation", { name: "小说项目文件" }).waitFor({ state: "visible", timeout: 10_000 });
      if (await layoutScroller.getAttribute("data-oh-story-layout") !== "wide") {
        throw new Error("The launcher did not hand the layout back to the workbench.");
      }

      await selectSession(page, storyWorkspace.workspace.title, storySessionTitle);
      const storyTree = page.getByRole("navigation", { name: "小说项目文件" });
      try { await storyTree.waitFor({ state: "visible", timeout: 20_000 }); }
      catch (error) {
        const tabs = await page.getByRole("tab").allTextContents();
        const body = (await page.locator("body").innerText()).slice(0, 4_000);
        throw new Error(`Three-column story surface was not visible; tabs=${JSON.stringify(tabs)}; pageErrors=${JSON.stringify(pageErrors)}; body=${JSON.stringify(body)}`, { cause: error });
      }
      const storyKind = page.locator(".oh-story-kind");
      await storyKind.waitFor({ state: "visible", timeout: 10_000 });
      const storyWorkbenchTabs = page.getByRole("tablist", { name: "创作工作台" });
      await storyWorkbenchTabs.waitFor({ state: "visible", timeout: 10_000 });
      if (await storyKind.textContent() !== "小说"
        || await storyWorkbenchTabs.getByRole("tab", { name: "小说", exact: true }).count() !== 1
        || await storyWorkbenchTabs.getByRole("tab", { name: "短剧", exact: true }).count() !== 1
        || await storyWorkbenchTabs.getByRole("tab", { name: "游戏", exact: true }).count() !== 1
        || await storyWorkbenchTabs.getByRole("tab", { name: "视频", exact: true }).count() !== 1) {
        throw new Error("Story workspace did not expose all four persistent creation workbenches.");
      }
      if (await page.getByRole("button", { name: "刷新项目文件", exact: true }).count() !== 1) {
        throw new Error("The workspace refresh control has no descriptive accessible name.");
      }
      try { await page.getByText(storyPrompt, { exact: true }).waitFor({ state: "visible", timeout: 20_000 }); }
      catch (error) {
        const selectedRows = await page.getByRole("treeitem", { selected: true }).allTextContents();
        const body = (await page.locator("body").innerText()).slice(0, 4_000);
        const history = await sessionEvents(origin, storySession.sessionId);
        throw new Error(`Story Session selection did not render its Chat; selected=${JSON.stringify(selectedRows)}; url=${page.url()}; historyTail=${JSON.stringify(history.slice(-8).map((event) => event.type))}; body=${JSON.stringify(body)}`, { cause: error });
      }
      if (!useRealDeepSeek) await page.getByText(`已读取《${storyProjectName}》工程。`, { exact: false }).waitFor({ state: "visible", timeout: 10_000 });
      if (await page.getByText("This turn failed", { exact: false }).isVisible()) throw new Error("Story Chat contains a failed turn.");

      if (!useRealDeepSeek) {
        const mutationPrompt = rpc(origin, "session/prompt", {
          request: {
            requestId: crypto.randomUUID(),
            sessionId: storySession.sessionId,
            mode: "queue",
            content: [{ type: "text", text: agentMutationPrompt }]
          }
        });
        const streamedEditor = page.getByRole("textbox", { name: agentMutationPath });
        const streamedValues = new Set<string>();
        for (let sample = 0; sample < 120; sample += 1) {
          // Check-then-act: the editor can re-render between isVisible() and inputValue(), leaving
          // the resolved handle detached and the read blocked for the full default timeout. Bound
          // the read and skip the sample instead of failing the whole run on a transient rerender.
          if (await streamedEditor.isVisible()) {
            try { streamedValues.add(await streamedEditor.inputValue({ timeout: 2_000 })); }
            catch { /* sampled mid-rerender; the next iteration picks the value up */ }
          }
          if (streamedValues.size > 1 && await page.getByText(agentMutationReply, { exact: true }).isVisible()) break;
          await page.waitForTimeout(75);
        }
        await mutationPrompt;
        if (streamedValues.size === 0) {
          const history = await sessionEvents(origin, storySession.sessionId);
          const selected = await page.locator("button[data-file-path][aria-current='page']").getAttribute("data-file-path");
          const target = page.locator(`button[data-file-path=${JSON.stringify(agentMutationPath)}]`);
          const targetCurrent = await target.count() === 0 ? null : await target.getAttribute("aria-current");
          throw new Error(`Agent write never reached the editor; selected=${JSON.stringify(selected)}; targetCurrent=${JSON.stringify(targetCurrent)}; tailEvents=${JSON.stringify(history.slice(-12).map((event) => event.type))}`);
        }
        const approval = page.getByRole("button", { name: /^(?:Allow once|允许一次)$/u });
        try {
          await approval.waitFor({ state: "visible", timeout: 3_000 });
          await approval.click();
        } catch { /* workspace writes may already be allowed by the active preset */ }
        await page.getByText(agentMutationReply, { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
        await waitForCompletedTurn(origin, storySession.sessionId);
        const agentFileUrl = `${origin}/oh-story/file?sessionId=${encodeURIComponent(storySession.sessionId)}&path=${encodeURIComponent(agentMutationPath)}`;
        const agentFileResponse = await dshFetch(agentFileUrl);
        const agentFile = await agentFileResponse.json() as { readonly content?: string };
        if (!agentFileResponse.ok || agentFile.content !== agentMutationContent) {
          throw new Error(`Real DSH Agent write was not authoritative on disk: ${JSON.stringify(agentFile)}`);
        }
        if (streamedValues.size < 2 || ![...streamedValues].some((value) => value.length > 0 && value.length < agentMutationContent.length)) {
          throw new Error(`Editor did not expose incremental Agent write content: ${JSON.stringify([...streamedValues].map((value) => value.length))}`);
        }
        const agentTreeFile = page.locator(`button[data-file-path=${JSON.stringify(agentMutationPath)}]`);
        await agentTreeFile.waitFor({ state: "visible", timeout: 10_000 });
        // The tree button becomes visible one render before follow-the-agent sets aria-current, so read
        // the attribute through an auto-retrying locator instead of a single racy getAttribute().
        try {
          await page.locator(`button[data-file-path=${JSON.stringify(agentMutationPath)}][aria-current="page"]`)
            .waitFor({ state: "visible", timeout: 10_000 });
        } catch {
          throw new Error("Agent write did not automatically select its file in the tree.");
        }
        await selectFile(page, chapterPath);
        const agentFolder = page.locator(".oh-story-file-folder > summary").filter({ hasText: /^角色\d+$/u }).first();
        await agentFolder.click();
        await page.waitForFunction((path) => {
          const button = document.querySelector(`button[data-file-path=${JSON.stringify(path)}]`);
          return button === null || !button.checkVisibility();
        }, agentMutationPath);
        const officialWriteFile = page.locator('[data-slot="conversation.session"] button').filter({ hasText: new RegExp(`^${agentMutationPath}$`, "u") }).first();
        // DSH 0.1.2 keeps off-screen Chat flow items at zero height, so bring the row in before reading it.
        await expandTurnProcesses(page);
        await officialWriteFile.waitFor({ state: "visible", timeout: 10_000 });
        await officialWriteFile.click();
        await agentTreeFile.waitFor({ state: "visible", timeout: 10_000 });
        if (await agentTreeFile.getAttribute("aria-current") !== "page") throw new Error("Official Chat tool file did not expand and locate the Agent-written file.");

        await selectFile(page, chapterPath);
        await page.getByRole("tab", { name: "源码", exact: true }).click();
        const protectedEditor = page.getByRole("textbox", { name: chapterPath });
        const protectedDraft = `${chapter.content}\n<!-- focused human draft -->\n`;
        await protectedEditor.fill(protectedDraft);
        await protectedEditor.focus();
        const repliesBefore = await page.getByText(agentMutationReply, { exact: true }).count();
        await rpc(origin, "session/prompt", {
          request: {
            requestId: crypto.randomUUID(),
            sessionId: storySession.sessionId,
            mode: "queue",
            content: [{ type: "text", text: agentMutationPrompt }]
          }
        });
        await page.waitForFunction((path) => document.querySelector(`button[data-file-path=${JSON.stringify(path)}][data-agent-target]`)?.checkVisibility() === true, agentMutationPath);
        const protectedSelected = page.locator(`button[data-file-path=${JSON.stringify(chapterPath)}]`);
        if (await protectedSelected.getAttribute("aria-current") !== "page" || !await protectedEditor.evaluate((element) => document.activeElement === element)) {
          throw new Error("Agent auto-follow interrupted a focused human draft.");
        }
        await protectedEditor.pressSequentially("继续输入");
        if (!await protectedEditor.inputValue().then((value) => value.endsWith("继续输入"))) {
          throw new Error("Typing after a concurrent Agent write did not stay in the human draft.");
        }
        const replyDeadline = Date.now() + 20_000;
        while (await page.getByText(agentMutationReply, { exact: true }).count() <= repliesBefore) {
          if (Date.now() >= replyDeadline) throw new Error("The concurrent Agent write did not settle.");
          await page.waitForTimeout(100);
        }
        const concurrentAgentFile = await (await dshFetch(agentFileUrl)).json() as { readonly content?: string };
        if (concurrentAgentFile.content !== agentMutationContent || !await protectedEditor.inputValue().then((value) => value.endsWith("继续输入"))) {
          throw new Error("Concurrent Agent and human edits did not remain isolated.");
        }

        await rm(join(storyRoot, agentMutationPath));
        await page.getByTitle("刷新").click();
        await agentTreeFile.waitFor({ state: "detached", timeout: 10_000 });

        const mixedMarker = join(storyRoot, "short-drama.json");
        await writeFile(mixedMarker, '{"title":"mixed-workspace-smoke"}\n');
        await page.getByRole("button", { name: "刷新项目文件", exact: true }).click();
        const workbenchTabs = page.getByRole("tablist", { name: "创作工作台" });
        await workbenchTabs.waitFor({ state: "visible", timeout: 10_000 });
        const storyTab = workbenchTabs.getByRole("tab", { name: "小说", exact: true });
        const dramaTab = workbenchTabs.getByRole("tab", { name: "短剧", exact: true });
        await dramaTab.waitFor({ state: "visible", timeout: 10_000 });
        await storyTab.focus();
        await storyTab.press("ArrowRight");
        if (await dramaTab.getAttribute("aria-selected") !== "true" || !await dramaTab.evaluate((element) => document.activeElement === element)) {
          throw new Error("Workspace tabs did not support roving ArrowRight navigation.");
        }
        await dramaTab.press("ArrowLeft");
        if (await storyTab.getAttribute("aria-selected") !== "true" || !await storyTab.evaluate((element) => document.activeElement === element)) {
          throw new Error("Workspace tabs did not support roving ArrowLeft navigation.");
        }
        await rm(mixedMarker);
        await page.getByRole("button", { name: "刷新项目文件", exact: true }).click();
        await dramaTab.waitFor({ state: "visible", timeout: 10_000 });
        await dramaTab.click();
        await page.getByText("当前 workspace 还没有短剧项目。", { exact: false }).waitFor({ state: "visible", timeout: 10_000 });
        await storyTab.click();
        await page.locator(".oh-story-kind").filter({ hasText: "小说" }).waitFor({ state: "visible", timeout: 10_000 });
      }
      await prepareDemoSurface(page);
      const previewTab = page.getByRole("tab", { name: "预览" });
      await previewTab.waitFor({ state: "visible", timeout: 10_000 });
      if (await page.getByRole("button", { name: "已保存", exact: true }).count() !== 0) throw new Error("Editor header still renders a redundant saved button.");
      if (await page.locator(".oh-story-meta").count() !== 0) throw new Error("Workbench still renders the redundant project meta row.");
      await selectFile(page, chapterPath);
      await page.getByRole("article", { name: `${chapterPath} 渲染预览` }).waitFor({ state: "visible", timeout: 10_000 });
      await captureDemoFrame(page, "story", 1);
      const sourceTab = page.getByRole("tab", { name: "源码", exact: true });
      await previewTab.focus();
      await previewTab.press("End");
      if (await sourceTab.getAttribute("aria-selected") !== "true" || !await sourceTab.evaluate((element) => document.activeElement === element)) {
        throw new Error("Editor tabs did not support End-key navigation.");
      }
      await sourceTab.press("Home");
      if (await previewTab.getAttribute("aria-selected") !== "true" || !await previewTab.evaluate((element) => document.activeElement === element)) {
        throw new Error("Editor tabs did not support Home-key navigation.");
      }
      await sourceTab.click();
      const chapterEditor = page.getByRole("textbox", { name: chapterPath });
      await chapterEditor.waitFor({ state: "visible", timeout: 10_000 });
      const editorPosition = await chapterEditor.evaluate((element) => {
        element.focus();
        element.setSelectionRange(420, 438);
        element.scrollTop = 5_000;
        return { scrollTop: element.scrollTop, selectionStart: element.selectionStart, selectionEnd: element.selectionEnd };
      });
      await previewTab.click();
      await sourceTab.click();
      const restoredPosition = await chapterEditor.evaluate((element) => ({
        scrollTop: element.scrollTop,
        selectionStart: element.selectionStart,
        selectionEnd: element.selectionEnd
      }));
      if (Math.abs(restoredPosition.scrollTop - editorPosition.scrollTop) > 1
        || restoredPosition.selectionStart !== editorPosition.selectionStart
        || restoredPosition.selectionEnd !== editorPosition.selectionEnd) {
        throw new Error(`Editor preview/source toggle lost its position: ${JSON.stringify({ editorPosition, restoredPosition })}`);
      }
      const draftChapter = `${chapter.content}\n<!-- session draft smoke -->\n`;
      await chapterEditor.fill(draftChapter);
      await selectSession(page, dramaWorkspace.workspace.title, dramaSessionTitle);
      await selectSession(page, storyWorkspace.workspace.title, storySessionTitle);
      const restoredDraft = page.getByRole("textbox", { name: chapterPath });
      await restoredDraft.waitFor({ state: "visible", timeout: 10_000 });
      if (await restoredDraft.inputValue() !== draftChapter) {
        throw new Error("Switching DSH Sessions discarded the unsaved editor draft.");
      }
      const editedChapter = `${chapter.content}\n<!-- native DSH editor smoke -->\n`;
      await restoredDraft.fill(editedChapter);
      const saveButton = page.getByRole("button", { name: "保存", exact: true });
      const saveRequest = page.waitForResponse((response) => (
        response.request().method() === "PUT"
        && response.url() === chapterUrl
      ));
      await saveButton.click();
      const browserSaveResponse = await saveRequest;
      if (!browserSaveResponse.ok()) {
        throw new Error(`Browser editor save returned HTTP ${String(browserSaveResponse.status())}.`);
      }
      await saveButton.waitFor({ state: "hidden", timeout: 10_000 });
      const savedResponse = await dshFetch(chapterUrl);
      const savedChapter = await savedResponse.json() as { readonly content?: string; readonly version?: string };
      if (!savedResponse.ok || savedChapter.content !== editedChapter || savedChapter.version === undefined) {
        throw new Error(`Browser editor did not save through the versioned route: ${JSON.stringify(savedChapter)}`);
      }
      const restoredResponse = await dshFetch(chapterUrl, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: chapter.content, baseVersion: savedChapter.version })
      });
      if (!restoredResponse.ok) throw new Error(`Could not restore the editor smoke fixture: ${String(restoredResponse.status)}.`);

      await openGroup(page, "大纲");
      await selectFile(page, "大纲/细纲_第001章.md");
      await selectFile(page, chapterPath);
      await page.getByRole("tab", { name: "源码", exact: true }).click();
      const conflictEditor = page.getByRole("textbox", { name: chapterPath });
      await conflictEditor.waitFor({ state: "visible", timeout: 10_000 });
      if (await conflictEditor.inputValue() !== chapter.content) throw new Error("Editor did not reconcile the authoritative restored file.");
      await conflictEditor.fill(`${chapter.content}\n<!-- local conflict draft -->\n`);
      const conflictBaseResponse = await dshFetch(chapterUrl);
      const conflictBase = await conflictBaseResponse.json() as { readonly content?: string; readonly version?: string };
      if (!conflictBaseResponse.ok || conflictBase.content === undefined || conflictBase.version === undefined) throw new Error("Could not prepare browser conflict fixture.");
      const externalChapter = `${chapter.content}\n<!-- external conflict edit -->\n`;
      const externalResponse = await dshFetch(chapterUrl, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: externalChapter, baseVersion: conflictBase.version })
      });
      const external = await externalResponse.json() as { readonly version?: string };
      if (!externalResponse.ok || external.version === undefined) throw new Error("Could not stage the external browser conflict.");
      await page.getByTitle("刷新").click();
      const conflictAlert = page.getByRole("alert").filter({ hasText: chapterPath });
      await conflictAlert.waitFor({ state: "visible", timeout: 10_000 });
      await selectFile(page, "大纲/细纲_第001章.md");
      if (await page.getByRole("alert").count() !== 0) throw new Error("A file conflict leaked into a different editor tab.");
      await selectFile(page, chapterPath);
      await conflictAlert.waitFor({ state: "visible", timeout: 10_000 });
      await page.getByRole("button", { name: "载入磁盘版本", exact: true }).click();
      await page.getByRole("tab", { name: "源码", exact: true }).click();
      if (await page.getByRole("textbox", { name: chapterPath }).inputValue() !== externalChapter) {
        throw new Error("Conflict resolution did not load the authoritative disk version.");
      }
      const conflictRestore = await dshFetch(chapterUrl, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: chapter.content, baseVersion: external.version })
      });
      if (!conflictRestore.ok) throw new Error("Could not restore the browser conflict fixture.");
      await previewTab.click();
      await openGroup(page, "大纲");
      await selectFile(page, "大纲/细纲_第001章.md");
      const outline = page.getByRole("article", { name: "大纲/细纲_第001章.md 渲染预览" });
      await outline.waitFor({ state: "visible", timeout: 10_000 });
      if (await outline.locator("h1, h2, h3").count() === 0 || await outline.locator("li").count() === 0) throw new Error("Markdown preview did not render the real outline structure.");
      await captureDemoFrame(page, "story", 2);
      await openGroup(page, "设定");
      await openFolder(page, "角色");
      await selectFile(page, "设定/角色/江晨.md");
      await page.getByRole("article", { name: "设定/角色/江晨.md 渲染预览" }).waitFor({ state: "visible", timeout: 10_000 });
      await captureDemoFrame(page, "story", 3);
      await openGroup(page, "追踪");
      await selectFile(page, "追踪/_tracking-state.json");
      await page.getByRole("textbox", { name: "追踪/_tracking-state.json" }).waitFor({ state: "visible", timeout: 10_000 });
      await captureDemoFrame(page, "story", 4);

      await selectSession(page, storyWorkspace.workspace.title, gameSessionTitle);
      if (!useRealDeepSeek) await page.getByText("Game Studio 已就绪。", { exact: false }).waitFor({ state: "visible", timeout: 10_000 });
      const gameWorkbenchTabs = page.getByRole("tablist", { name: "创作工作台" });
      await gameWorkbenchTabs.getByRole("tab", { name: "游戏", exact: true }).click();
      const gameStudio = page.locator(".oh-game-studio");
      await gameStudio.waitFor({ state: "visible", timeout: 20_000 });
      const gameTabs = page.getByRole("tablist", { name: "游戏工作台", exact: true });
      await gameTabs.getByRole("tab", { name: "试玩", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
      if (await gameTabs.getByRole("tab", { name: "QA", exact: true }).count() !== 0 || await page.locator(".oh-game-qa").count() !== 0) {
        throw new Error("Game Studio still exposed the removed QA surface.");
      }
      const projectSelect = page.getByRole("combobox", { name: "游戏项目" });
      await projectSelect.selectOption(`workspace:${generatedGameId}`);
      const generatedFrame = page.frameLocator('iframe[title="《DSH Game Studio Smoke》可试玩预览"]');
      const generatedPlay = generatedFrame.getByRole("button", { name: "试玩成功", exact: true });
      try { await generatedPlay.waitFor({ state: "visible", timeout: 20_000 }); }
      catch (error) {
        const iframe = page.locator('iframe[title="《DSH Game Studio Smoke》可试玩预览"]');
        const iframeCount = await iframe.count();
        const diagnostics = {
          project: await projectSelect.inputValue(),
          options: await projectSelect.locator("option").allTextContents(),
          studio: (await gameStudio.innerText()).slice(0, 2_000),
          iframeCount,
          iframeSrc: iframeCount === 0 ? undefined : await iframe.getAttribute("src"),
          iframeTitles: await page.locator("iframe").evaluateAll((frames) => frames.map((frame) => ({ title: frame.title, src: frame.src }))),
          frames: page.frames().map((frame) => frame.url()),
          responses: gamePreviewResponses,
          pageErrors
        };
        throw new Error(`Generated workspace game was not playable: ${JSON.stringify(diagnostics)}`, { cause: error });
      }
      await generatedPlay.click();
      await generatedFrame.getByRole("button", { name: "输入已验证", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
      const generatedIframe = page.locator('iframe[title="《DSH Game Studio Smoke》可试玩预览"]');
      await generatedIframe.evaluate((element) => { element.setAttribute("data-e2e-instance", "generated-preserved"); });
      await gameTabs.getByRole("tab", { name: "项目文件", exact: true }).click();
      await page.locator(".oh-game-design").waitFor({ state: "visible", timeout: 10_000 });
      await gameTabs.getByRole("tab", { name: "试玩", exact: true }).click();
      if (await generatedIframe.getAttribute("data-e2e-instance") !== "generated-preserved") {
        throw new Error("Preview/Design switching remounted the generated game iframe.");
      }
      await generatedFrame.getByRole("button", { name: "输入已验证", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
      const generatedBrowserFrame = page.frames().find((frame) => frame.url().includes("/oh-story/game-preview/workspace/"));
      if (generatedBrowserFrame === undefined) throw new Error("Generated workspace game frame was not attached.");
      const previewEscapeBlocked = await generatedBrowserFrame.evaluate(async (sessionId) => {
        try {
          await dshFetch(`/oh-story/workspace?sessionId=${encodeURIComponent(sessionId)}`);
          return false;
        } catch { return true; }
      }, gameSession.sessionId);
      if (!previewEscapeBlocked) throw new Error("Generated game CSP allowed access to the workspace API outside its preview asset prefix.");
      await projectSelect.selectOption("example:jin-ping-mei");
      if (!await projectSelect.inputValue().then((value) => value === "example:jin-ping-mei")) {
        throw new Error("Game Studio did not select the bundled Jin Ping Mei example.");
      }
      const gameFrame = page.frameLocator('iframe[title="《金瓶梅 · 风月总账》可试玩预览"]');
      const ageGate = gameFrame.getByRole("button", { name: "我已成年", exact: true });
      await ageGate.waitFor({ state: "visible", timeout: 30_000 });
      const gameScroller = page.locator("[data-conversation-scroll]");
      const gameChat = page.locator('[data-slot="conversation.session"] > :not(.oh-story-split-surface)');
      const [studioBox, gameChatBox] = await Promise.all([gameStudio.boundingBox(), gameChat.boundingBox()]);
      if (studioBox === null || gameChatBox === null
        || await gameScroller.getAttribute("data-oh-story-workbench") !== "game"
        || studioBox.x + studioBox.width > gameChatBox.x + 1
        || studioBox.width <= gameChatBox.width) {
        throw new Error(`Game Studio did not render as preview-left/chat-right: ${JSON.stringify({ studioBox, gameChatBox })}`);
      }
      await prepareDemoSurface(page);
      await captureGameEvidence(page, "game-studio-age-gate");
      await captureDemoFrame(page, "game", 1);
      await ageGate.click();
      const enterGame = gameFrame.getByRole("button", { name: "进宅", exact: true });
      await enterGame.waitFor({ state: "visible", timeout: 10_000 });
      await captureGameEvidence(page, "game-studio-title");
      await captureDemoFrame(page, "game", 2);
      await enterGame.click();
      await gameFrame.getByText("第一日 · 正堂", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
      const gameIframe = page.locator('iframe[title="《金瓶梅 · 风月总账》可试玩预览"]');
      await gameIframe.evaluate((element) => { element.setAttribute("data-e2e-instance", "jin-ping-mei-preserved"); });
      await captureGameEvidence(page, "game-studio-playable");
      await captureDemoFrame(page, "game", 3);
      await gameTabs.getByRole("tab", { name: "说明", exact: true }).click();
      await page.locator(".oh-game-design-empty").filter({ hasText: "内置完整示例" }).waitFor({ state: "visible", timeout: 10_000 });
      await captureGameEvidence(page, "game-studio-design");
      await captureDemoFrame(page, "game", 4);
      await gameTabs.getByRole("tab", { name: "试玩", exact: true }).click();
      if (await gameIframe.getAttribute("data-e2e-instance") !== "jin-ping-mei-preserved") {
        throw new Error("Preview/Design switching remounted the Jin Ping Mei iframe.");
      }
      await gameFrame.getByText("第一日 · 正堂", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
      const fullscreenButton = gameStudio.getByRole("button", { name: "全屏试玩", exact: true });
      await fullscreenButton.click();
      await page.waitForFunction(() => document.fullscreenElement?.classList.contains("oh-game-preview-shell") === true);
      await page.evaluate(async () => { await document.exitFullscreen(); });
      await page.waitForFunction(() => document.fullscreenElement === null);
      if (!await fullscreenButton.evaluate((element) => document.activeElement === element)) {
        throw new Error("Exiting fullscreen did not restore focus to the fullscreen control.");
      }

      await page.setViewportSize({ width: 500, height: 900 });
      await page.waitForFunction(() => document.querySelector("[data-conversation-scroll]")?.getAttribute("data-oh-story-layout") === "compact");
      const compactGameTabs = page.getByRole("tablist", { name: "窄屏游戏工作台" });
      await compactGameTabs.waitFor({ state: "visible", timeout: 10_000 });
      const compactStudioTab = compactGameTabs.getByRole("tab", { name: "制作", exact: true });
      const compactChatTab = compactGameTabs.getByRole("tab", { name: "对话", exact: true });
      const compactAria = await Promise.all([compactStudioTab, compactChatTab].map(async (tab) => {
        const controlled = await tab.getAttribute("aria-controls");
        return controlled !== null && await page.locator(`[id=${JSON.stringify(controlled)}]`).getAttribute("role") === "tabpanel";
      }));
      const compactGameOverflow = await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth);
      const compactGameBoxes = await Promise.all([
        gameStudio.boundingBox(),
        gameStudio.locator(".oh-game-toolbar").boundingBox(),
        projectSelect.boundingBox(),
        gameTabs.boundingBox(),
        compactGameTabs.boundingBox()
      ]);
      if (compactAria.some((value) => !value) || compactGameOverflow > 1 || compactGameBoxes.some((box) => box === null)
        || compactGameBoxes.some((box) => box !== null && (box.x < -1 || box.x + box.width > 501))) {
        throw new Error(`500px Game Studio clipped controls or broke its tab contract: ${JSON.stringify({ compactAria, compactGameOverflow, compactGameBoxes })}`);
      }
      await compactChatTab.click();
      const composer = page.locator('[data-composer-seat] textarea, [data-composer-seat] [contenteditable="true"]').first();
      await composer.waitFor({ state: "visible", timeout: 10_000 });
      await composer.fill("窄屏对话草稿");
      if (!await composer.evaluate((element) => element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement ? element.value === "窄屏对话草稿" : element.textContent === "窄屏对话草稿")) {
        throw new Error("500px Game Studio Chat pane did not accept Composer input.");
      }
      await composer.fill("");
      await compactStudioTab.click();
      await gameStudio.waitFor({ state: "visible", timeout: 10_000 });
      if (await gameIframe.getAttribute("data-e2e-instance") !== "jin-ping-mei-preserved") {
        throw new Error("Compact Studio/Chat switching remounted the game iframe.");
      }
      await gameFrame.getByText("第一日 · 正堂", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
      await captureGameEvidence(page, "game-studio-compact");
      await page.setViewportSize({ width: 1_440, height: 900 });
      await page.waitForFunction(() => document.querySelector("[data-conversation-scroll]")?.getAttribute("data-oh-story-layout") === "wide");
      await gameStudio.getByRole("tab", { name: "小说", exact: true }).click();
      await storyTree.waitFor({ state: "visible", timeout: 10_000 });
      await page.getByRole("tablist", { name: "创作工作台" }).getByRole("tab", { name: "游戏", exact: true }).click();
      await gameStudio.waitFor({ state: "visible", timeout: 10_000 });
      if (await gameIframe.getAttribute("data-e2e-instance") !== "jin-ping-mei-preserved") {
        throw new Error("Novel/Game switching remounted the active game iframe.");
      }
      await gameFrame.getByText("第一日 · 正堂", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
      if (!useRealDeepSeek) {
        await projectSelect.selectOption(`workspace:${generatedGameId}`);
        await generatedFrame.getByRole("button", { name: "试玩成功", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
        await generatedFrame.getByRole("button", { name: "试玩成功", exact: true }).click();
        await generatedFrame.getByRole("button", { name: "输入已验证", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
        await generatedIframe.evaluate((element) => { element.setAttribute("data-e2e-instance", "new-build-preserved"); });
        const beforeGameUpdate = (await sessionEvents(origin, gameSession.sessionId)).at(-1)?.seq ?? -1;
        await rpc(origin, "session/prompt", {
          request: {
            requestId: crypto.randomUUID(),
            sessionId: gameSession.sessionId,
            mode: "queue",
            content: [{ type: "text", text: gameUpdatePrompt }]
          }
        });
        await waitForCompletedTurn(origin, gameSession.sessionId, beforeGameUpdate);
        await page.getByText("新版本已就绪 · 由你决定何时载入", { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
        if (await generatedIframe.getAttribute("data-e2e-instance") !== "new-build-preserved") {
          throw new Error("A newly built preview silently remounted after the game iframe lost focus.");
        }
        await generatedFrame.getByRole("button", { name: "输入已验证", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
        await gameStudio.getByRole("button", { name: "载入新版本", exact: true }).click();
        await generatedFrame.getByRole("button", { name: "试玩成功", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
        if (await generatedIframe.getAttribute("data-e2e-instance") !== null) {
          throw new Error("Explicit new-version loading did not replace the generated game iframe.");
        }
      }
      if (videoSession === undefined) {
        await gameStudio.getByRole("tab", { name: "视频", exact: true }).click();
      } else {
        await selectSession(page, storyWorkspace.workspace.title, videoSessionTitle);
        await page.getByRole("tablist", { name: "创作工作台" }).getByRole("tab", { name: "视频", exact: true }).click();
      }
      const videoStudio = page.locator(".oh-video-studio");
      await videoStudio.waitFor({ state: "visible", timeout: 10_000 });
      const videoProject = videoStudio.getByRole("combobox", { name: "视频项目", exact: true });
      if (await videoProject.inputValue() !== "smoke-recap" || !await videoStudio.getByText("成片已就绪", { exact: true }).isVisible()) {
        throw new Error("Video Studio did not discover the manifest-driven smoke project.");
      }
      const videoTabs = videoStudio.getByRole("tablist", { name: "视频工作台", exact: true });
      await videoTabs.getByRole("tab", { name: "预览", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
      const recapPlayer = videoStudio.locator("video");
      await recapPlayer.waitFor({ state: "visible", timeout: 10_000 });
      await page.waitForFunction(() => (document.querySelector(".oh-video-studio video") as HTMLVideoElement | null)?.readyState !== 0);
      const videoChat = page.locator('[data-slot="conversation.session"] > :not(.oh-story-split-surface)');
      const [videoStudioBox, videoChatBox] = await Promise.all([videoStudio.boundingBox(), videoChat.boundingBox()]);
      if (videoStudioBox === null || videoChatBox === null
        || await page.locator("[data-conversation-scroll]").getAttribute("data-oh-story-workbench") !== "video"
        || videoStudioBox.x + videoStudioBox.width > videoChatBox.x + 1
        || videoStudioBox.width <= videoChatBox.width) {
        throw new Error(`Video Studio did not render as preview-left/chat-right: ${JSON.stringify({ videoStudioBox, videoChatBox })}`);
      }
      await prepareDemoSurface(page);
      await captureDemoFrame(page, "video", 1);
      const versionTabs = videoStudio.getByRole("tablist", { name: "预览版本", exact: true });
      for (const label of ["原片", "剪后片", "最终成片"]) {
        if (await versionTabs.getByRole("tab", { name: label, exact: true }).count() !== 1) throw new Error(`Video Studio missed ${label}.`);
      }
      await versionTabs.getByRole("tab", { name: "剪后片", exact: true }).click();
      await captureDemoFrame(page, "video", 2);
      await videoTabs.getByRole("tab", { name: "产物", exact: true }).click();
      await videoStudio.getByRole("button", { name: /运行清单 recap_run_manifest\.json/u }).click();
      await videoStudio.getByText('"edit_mode": "cut"', { exact: false }).waitFor({ state: "visible", timeout: 10_000 });
      await captureDemoFrame(page, "video", 3);
      await videoStudio.getByRole("button", { name: "检查环境", exact: true }).click();
      await videoStudio.getByText(/^Python /u).waitFor({ state: "visible", timeout: 10_000 });
      await captureDemoFrame(page, "video", 4);
      await videoStudio.getByRole("tab", { name: "小说", exact: true }).click();
      await storyTree.waitFor({ state: "visible", timeout: 10_000 });

      await selectSession(page, dramaWorkspace.workspace.title, dramaSessionTitle);
      const dramaTree = page.getByRole("navigation", { name: "短剧项目文件" });
      await dramaTree.waitFor({ state: "visible", timeout: 10_000 });
      const dramaKind = page.locator(".oh-story-kind");
      await dramaKind.waitFor({ state: "visible", timeout: 10_000 });
      const dramaWorkbenchTabs = page.getByRole("tablist", { name: "创作工作台" });
      await dramaWorkbenchTabs.waitFor({ state: "visible", timeout: 10_000 });
      if (await dramaKind.textContent() !== "短剧"
        || await dramaWorkbenchTabs.getByRole("tab", { name: "短剧", exact: true }).count() !== 1
        || await dramaWorkbenchTabs.getByRole("tab", { name: "小说", exact: true }).count() !== 1
        || await dramaWorkbenchTabs.getByRole("tab", { name: "游戏", exact: true }).count() !== 1
        || await dramaWorkbenchTabs.getByRole("tab", { name: "视频", exact: true }).count() !== 1) {
        throw new Error("Drama workspace did not expose all four persistent creation workbenches.");
      }
      await selectFile(page, "剧集/EP001/剧本.md");
      await page.getByRole("tab", { name: "预览", exact: true }).click();
      await page.getByRole("article", { name: "剧集/EP001/剧本.md 渲染预览" }).waitFor({ state: "visible", timeout: 10_000 });
      await page.getByText(dramaPrompt, { exact: true }).waitFor({ state: "visible", timeout: 20_000 });
      if (!useRealDeepSeek) await page.getByText(dramaReply, { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
      if (await page.getByText("This turn failed", { exact: false }).isVisible()) throw new Error("Drama Chat contains a failed turn.");
      if (!useRealDeepSeek) {
        const scroller = page.locator("[data-conversation-scroll]");
        await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
        // A long answer read to the end must stay readable across a resize. The
        // seat overlaps the Chat column, so a reader carried out of the tail by a
        // reflow does not merely lose the bottom — the lines land behind the
        // Composer (#26).
        await rpc(origin, "session/prompt", { request: { requestId: crypto.randomUUID(), sessionId: dramaSession.sessionId, mode: "queue", content: [{ type: "text", text: longReplyPrompt }] } });
        await page.getByText(longReplyTail, { exact: false }).last().waitFor({ state: "visible", timeout: 30_000 });
        for (const size of [{ width: 1_440, height: 900 }, { width: 1_000, height: 900 }, { width: 1_200, height: 640 }, { width: 600, height: 800 }, { width: 1_440, height: 900 }]) {
          await page.setViewportSize(size);
          await page.waitForTimeout(400);
          const tail = await page.evaluate((marker) => {
            const scroll = Array.from(document.querySelectorAll<HTMLElement>("[data-conversation-scroll]"))
              .find((element) => element.dataset.ohStoryWorkbench === "drama" && element.getBoundingClientRect().width > 0);
            const seat = scroll === undefined
              ? undefined
              : Array.from(scroll.children).find((element): element is HTMLElement => element instanceof HTMLElement && element.hasAttribute("data-composer-seat"));
            const flow = scroll?.querySelector<HTMLElement>("[data-chat-flow]");
            if (scroll === undefined || seat === undefined || flow == null) return { found: false };
            const marked = Array.from(flow.querySelectorAll<HTMLElement>("*"))
              .find((element) => element.children.length === 0 && (element.textContent ?? "").includes(marker));
            if (marked === undefined) return { found: false };
            const tailBox = marked.getBoundingClientRect();
            const seatBox = seat.getBoundingClientRect();
            return {
              found: true,
              coveredBySeat: tailBox.bottom > seatBox.top + 1,
              belowViewport: tailBox.bottom > scroll.getBoundingClientRect().bottom + 1,
              clearance: Number.parseFloat(getComputedStyle(flow).paddingBottom) - seatBox.height,
              distanceFromBottom: scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight
            };
          }, longReplyTail);
          if (!tail.found || tail.coveredBySeat === true || tail.belowViewport === true || (tail.clearance ?? 0) < 15) {
            throw new Error(`Long answer lost its tail at ${String(size.width)}x${String(size.height)}: ${JSON.stringify(tail)}`);
          }
        }
        // The same carry must not become a leash: a reader who scrolled up to
        // re-read stays where they put themselves when the layout changes.
        const held = await page.evaluate(() => {
          const scroll = Array.from(document.querySelectorAll<HTMLElement>("[data-conversation-scroll]"))
            .find((element) => element.dataset.ohStoryWorkbench === "drama" && element.getBoundingClientRect().width > 0);
          if (scroll === undefined) return undefined;
          scroll.dispatchEvent(new WheelEvent("wheel", { deltaY: -600, bubbles: true }));
          scroll.scrollTop = Math.max(0, scroll.scrollTop - 600);
          return Math.round(scroll.scrollTop);
        });
        await page.setViewportSize({ width: 1_200, height: 820 });
        await page.waitForTimeout(400);
        const stillHeld = await page.evaluate(() => {
          const scroll = Array.from(document.querySelectorAll<HTMLElement>("[data-conversation-scroll]"))
            .find((element) => element.dataset.ohStoryWorkbench === "drama" && element.getBoundingClientRect().width > 0);
          return scroll === undefined ? undefined : { top: Math.round(scroll.scrollTop), fromBottom: Math.round(scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight) };
        });
        if (held === undefined || stillHeld === undefined || stillHeld.fromBottom < 100) {
          throw new Error(`Resize dragged a reader back to the tail: ${JSON.stringify({ held, stillHeld })}`);
        }
        await page.setViewportSize({ width: 1_440, height: 900 });
        await page.waitForTimeout(300);
        await rpc(origin, "session/prompt", { request: { requestId: crypto.randomUUID(), sessionId: dramaSession.sessionId, mode: "queue", content: [{ type: "text", text: todoLayoutPrompt }] } });
        const todo = page.locator('[data-testid="todo-panel"]');
        await todo.waitFor({ state: "visible", timeout: 30_000 });
        await todo.getByRole("button").click();
        await todo.locator("li").last().waitFor({ state: "attached", timeout: 20_000 });
        await page.waitForFunction(() => {
          const scroller = Array.from(document.querySelectorAll<HTMLElement>("[data-conversation-scroll]"))
            .find((element) => element.dataset.ohStoryWorkbench === "drama" && element.getBoundingClientRect().width > 0);
          const flow = scroller?.querySelector<HTMLElement>("[data-chat-flow]");
          const seat = scroller === undefined
            ? undefined
            : Array.from(scroller.children).find((element): element is HTMLElement => element instanceof HTMLElement && element.hasAttribute("data-composer-seat"));
          const tail = flow?.lastElementChild;
          if (!(tail instanceof HTMLElement) || seat === undefined || flow === null) return false;
          const tailBox = tail.getBoundingClientRect();
          const seatBox = seat.getBoundingClientRect();
          const clearance = Number.parseFloat(getComputedStyle(flow).paddingBottom);
          return clearance >= seatBox.height + 15 && tailBox.bottom <= seatBox.top + 1;
        }, undefined, { timeout: 10_000 });
        const flow = page.locator('[data-slot="conversation.session"] [data-chat-flow]');
        const tail = flow.locator(":scope > *").last();
        // The seat grows by the Todo panel one layout pass before the workbench
        // republishes its height, so assert the settled frame, not the resize.
        await page.waitForFunction(() => {
          const body = document.querySelector('[data-slot="conversation.session"] [data-chat-flow]');
          const seat = document.querySelector("[data-composer-seat]");
          const last = body?.lastElementChild;
          if (body == null || seat == null || last == null) return false;
          const seatTop = seat.getBoundingClientRect().top;
          const lastBox = last.getBoundingClientRect();
          return Number.parseFloat(getComputedStyle(body).paddingBottom) >= seat.getBoundingClientRect().height + 15
            && lastBox.top + lastBox.height <= seatTop + 1;
        }, undefined, { timeout: 15_000 });
        const [tailBox, seatBox, scrollBox, clearance, tailFlowKey] = await Promise.all([
          tail.boundingBox(), page.locator("[data-composer-seat]").boundingBox(), scroller.boundingBox(),
          flow.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingBottom)), tail.getAttribute("data-chat-flow-key")
        ]);
        if (tailBox === null || seatBox === null || scrollBox === null || tailFlowKey !== null
          || tailBox.y < scrollBox.y - 1 || tailBox.y + tailBox.height > seatBox.y + 1 || clearance < seatBox.height + 15) {
          throw new Error(`Streaming Todo obscured Chat: ${JSON.stringify({ tailBox, seatBox, scrollBox, clearance, tailFlowKey })}`);
        }
      }
      await prepareDemoSurface(page);
      await selectFile(page, "剧集/EP001/剧本.md");
      await page.getByRole("article", { name: "剧集/EP001/剧本.md 渲染预览" }).waitFor({ state: "visible", timeout: 10_000 });
      await captureDemoFrame(page, "drama", 1);
      await selectFile(page, "剧集/EP001/视觉设定.md");
      await page.getByRole("article", { name: "剧集/EP001/视觉设定.md 渲染预览" }).waitFor({ state: "visible", timeout: 10_000 });
      await captureDemoFrame(page, "drama", 2);
      await selectFile(page, "剧集/EP001/图片提示词.md");
      await page.getByRole("article", { name: "剧集/EP001/图片提示词.md 渲染预览" }).waitFor({ state: "visible", timeout: 10_000 });
      await selectFile(page, "剧集/EP001/分镜.md");
      await page.getByRole("article", { name: "剧集/EP001/分镜.md 渲染预览" }).waitFor({ state: "visible", timeout: 10_000 });
      await captureDemoFrame(page, "drama", 3);
      const productionTab = page.getByRole("tab", { name: "生产", exact: true });
      await productionTab.click();
      const productionTabs = page.getByRole("tablist", { name: "短剧生产视图" });
      await productionTabs.waitFor({ state: "visible", timeout: 10_000 });
      if (await page.locator(".oh-story-shot-card").count() !== 8
        || await page.locator(".oh-story-shot-card img.oh-story-media-preview").count() < 1
        || await page.locator(".oh-story-shot-card video.oh-story-media-preview").count() < 1
        || await productionTabs.getByRole("tab").allTextContents().then((labels) => JSON.stringify(labels) !== JSON.stringify(["镜头", "素材", "任务", "成片", "画布"]))) {
        throw new Error("Production shot board did not project the creator-first documents and DSH workspace media.");
      }
      if (!useRealDeepSeek && await page.locator(".oh-story-shot-card").filter({ hasText: productionIntentArgs.targetId }).first().getAttribute("data-selected") === null) {
        throw new Error("Agent production intent did not focus the requested semantic shot target.");
      }
      // The Agent intent above focuses SHOT-EP001-008, so the board is scrolled to the last shot and
      // the first card's loading="lazy" keyframe is deliberately still unloaded. Bring it into view and
      // await decode before measuring, so this asserts fixture realism rather than scroll position.
      const keyframePreview = page.locator(".oh-story-shot-card img.oh-story-media-preview").first();
      await keyframePreview.scrollIntoViewIfNeeded();
      await keyframePreview.evaluate(async (element) => {
        const image = element as HTMLImageElement;
        if (!image.complete || image.naturalWidth === 0) await image.decode();
      });
      const keyframeMetadata = await keyframePreview.evaluate((element) => ({
        width: (element as HTMLImageElement).naturalWidth,
        height: (element as HTMLImageElement).naturalHeight
      }));
      const videoPreview = page.locator(".oh-story-shot-card video.oh-story-media-preview").first();
      const videoMetadata = await videoPreview.evaluate(async (element) => {
        const video = element as HTMLVideoElement;
        if (video.readyState === 0) await new Promise<void>((accept, reject) => {
          video.addEventListener("loadedmetadata", () => { accept(); }, { once: true });
          video.addEventListener("error", () => { reject(new Error("mock video metadata failed to load")); }, { once: true });
        });
        return { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
      });
      if (keyframeMetadata.width < 500 || keyframeMetadata.height < 900
        || videoMetadata.width < 500 || videoMetadata.height < 900 || videoMetadata.duration < 4) {
        throw new Error(`Production mock media was not realistic: ${JSON.stringify({ keyframeMetadata, videoMetadata })}`);
      }
      const firstShotVersions = page.locator(".oh-story-shot-card").first().locator(".oh-story-version-strip").getByRole("button");
      if (await firstShotVersions.count() !== 2) throw new Error("Production image versions were not grouped under their shot.");
      await firstShotVersions.first().click();
      if (await firstShotVersions.first().getAttribute("data-selected") === null) throw new Error("Production version selection did not update the Session projection.");
      await page.locator(".oh-story-shot-card").first().locator("h3").click();
      await productionTabs.getByRole("tab", { name: "素材", exact: true }).click();
      if (await page.locator(".oh-story-asset-card").count() < 6) throw new Error("Production asset board omitted creator-facing assets.");
      if (await page.locator(".oh-story-media-library-grid > article").count() !== 3) {
        throw new Error("Project media library did not expose the three realistic workspace results.");
      }
      const reusableReference = page.locator(".oh-story-media-library-grid > article").filter({ hasText: productionMediaPath })
        .getByRole("button", { name: /SHOT-EP001-001 参考/u });
      await reusableReference.click();
      await page.waitForTimeout(100);
      if (await reusableReference.getAttribute("aria-pressed") !== "true") throw new Error("Project media could not be attached as an explicit shot reference.");
      await page.locator(".oh-story-media-library").scrollIntoViewIfNeeded();
      await productionTabs.getByRole("tab", { name: "成片", exact: true }).click();
      if (await page.locator(".oh-story-sequence > ol > li").count() !== 8
        || await page.locator(".oh-story-sequence-summary").getByText("7 个阻塞项", { exact: true }).count() !== 1
        || await page.locator(".oh-story-sequence-issues li").count() !== 4
        || await page.getByRole("button", { name: "合成成片", exact: true }).isEnabled()) {
        throw new Error("Production sequence did not expose shot order and missing-video blockers.");
      }
      await page.getByRole("button", { name: "下移 SHOT-EP001-001", exact: true }).click();
      if (await page.locator(".oh-story-sequence > ol > li strong").first().textContent() !== "SHOT-EP001-002") {
        throw new Error("Production sequence did not apply an explicit shot reorder.");
      }
      await page.getByRole("button", { name: "上移 SHOT-EP001-001", exact: true }).click();
      await productionTabs.getByRole("tab", { name: "画布", exact: true }).click();
      if (await page.locator(".oh-story-canvas article").count() < 12 || await page.locator(".oh-story-canvas path").count() < 8) {
        throw new Error("Production canvas omitted creator-document relationships.");
      }
      const firstCanvasNode = page.locator(".oh-story-canvas article").first();
      const leftBeforeKeyboardMove = Number.parseFloat(await firstCanvasNode.evaluate((element) => getComputedStyle(element).left));
      await firstCanvasNode.focus();
      await firstCanvasNode.press("ArrowRight");
      const leftAfterKeyboardMove = Number.parseFloat(await firstCanvasNode.evaluate((element) => getComputedStyle(element).left));
      if (leftAfterKeyboardMove !== leftBeforeKeyboardMove + 10) {
        throw new Error("Production canvas did not expose keyboard-operable Session layout controls.");
      }
      await productionTabs.getByRole("tab", { name: "镜头", exact: true }).click();
      await page.locator(".oh-story-shot-card").first().getByRole("button", { name: "IMG-JIANGCHEN-SHEET", exact: true }).click();
      await page.getByRole("textbox", { name: "剧集/EP001/图片提示词.md" }).waitFor({ state: "visible", timeout: 10_000 });
      await selectFile(page, "剧集/EP001/分镜.md");
      await productionTab.click();
      await page.locator(".oh-story-shot-card").first().waitFor({ state: "visible", timeout: 10_000 });
      if (!useRealDeepSeek) {
        await page.locator(".oh-story-shot-card").first().getByRole("button", { name: "准备关键帧", exact: true }).click();
        await productionTabs.getByRole("tab", { name: "任务", exact: true }).waitFor({ state: "visible", timeout: 10_000 });
        await page.locator(".oh-story-task-board article").first().waitFor({ state: "visible", timeout: 10_000 });
        await page.locator('[data-slot="conversation.session"]').getByText("/short-drama-produce", { exact: false }).last()
          .waitFor({ state: "visible", timeout: 20_000 });
        await page.getByText("等待确认", { exact: true })
          .waitFor({ state: "visible", timeout: 10_000 });

        const taskFor = (targetId: string) => page.locator(".oh-story-task-board article").filter({ hasText: targetId }).first();
        const shotCards = page.locator(".oh-story-shot-card");

        await productionTabs.getByRole("tab", { name: "镜头", exact: true }).click();
        await shotCards.nth(1).getByRole("button", { name: "准备关键帧", exact: true }).click();
        const runningQueueRemovalTask = taskFor("SHOT-EP001-002");
        await runningQueueRemovalTask.getByRole("button", { name: "停止当前 DSH Turn", exact: true })
          .waitFor({ state: "visible", timeout: 10_000 });
        await productionTabs.getByRole("tab", { name: "镜头", exact: true }).click();
        await shotCards.nth(2).getByRole("button", { name: "准备关键帧", exact: true }).click();
        const removedQueuedTask = taskFor("SHOT-EP001-003");
        const removeQueuedButton = removedQueuedTask.getByRole("button", { name: "从 DSH Queue 移除", exact: true });
        await removeQueuedButton.waitFor({ state: "visible", timeout: 10_000 });
        await removeQueuedButton.click();
        await removedQueuedTask.getByText("已取消", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
        await runningQueueRemovalTask.getByText("等待确认", { exact: true })
          .waitFor({ state: "visible", timeout: 10_000 });

        const productionRequestsBeforeCancel = mockDeepSeek?.requests.filter((request) => request === "production").length ?? 0;
        await productionTabs.getByRole("tab", { name: "镜头", exact: true }).click();
        await shotCards.nth(3).getByRole("button", { name: "准备关键帧", exact: true }).click();
        const canceledRunningTask = taskFor("SHOT-EP001-004");
        await canceledRunningTask.getByRole("button", { name: "停止当前 DSH Turn", exact: true })
          .waitFor({ state: "visible", timeout: 10_000 });
        await productionTabs.getByRole("tab", { name: "镜头", exact: true }).click();
        await shotCards.nth(4).getByRole("button", { name: "准备关键帧", exact: true }).click();
        const preservedQueuedTask = taskFor("SHOT-EP001-005");
        await preservedQueuedTask.getByRole("button", { name: "从 DSH Queue 移除", exact: true })
          .waitFor({ state: "visible", timeout: 10_000 });
        await canceledRunningTask.getByRole("button", { name: "停止当前 DSH Turn", exact: true }).click();
        await canceledRunningTask.getByText("已取消", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
        await preservedQueuedTask.getByText("DSH Queue", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
        const preservedQueueRemove = preservedQueuedTask.getByRole("button", { name: "从 DSH Queue 移除", exact: true });
        await preservedQueueRemove.waitFor({ state: "visible", timeout: 10_000 });
        const productionRequestsAfterCancel = mockDeepSeek?.requests.filter((request) => request === "production").length ?? 0;
        if (productionRequestsAfterCancel !== productionRequestsBeforeCancel + 1) {
          throw new Error("Canceling the current DSH Turn unexpectedly dropped or executed the preserved queued task.");
        }
        await preservedQueueRemove.click();
        await preservedQueuedTask.getByText("已取消", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });

        await productionTabs.getByRole("tab", { name: "镜头", exact: true }).click();
        await page.getByRole("button", { name: "准备批量视频", exact: true }).click();
        const batchTask = taskFor("BATCH-VIDEOS");
        await batchTask.getByRole("button", { name: "停止当前 DSH Turn", exact: true })
          .waitFor({ state: "visible", timeout: 10_000 });
        const batchJobId = await batchTask.getAttribute("data-job-id");
        if (batchJobId === null) throw new Error("Batch production task did not expose its stable projection id.");
        const partialBatchOutput = `剧集/EP001/制作成果/SHOT-EP001-003/SHOT-EP001-003-${batchJobId}.mp4`;
        await mkdir(dirname(join(dramaRoot, partialBatchOutput)), { recursive: true });
        await cp(videoMediaFixture, join(dramaRoot, partialBatchOutput));
        const partialWorkspaceResponse = await dshFetch(`${origin}/oh-story/workspace?sessionId=${encodeURIComponent(dramaSession.sessionId)}`);
        const partialWorkspace = await partialWorkspaceResponse.json() as { readonly files?: readonly { readonly path: string }[] };
        if (!partialWorkspaceResponse.ok || !partialWorkspace.files?.some((file) => file.path === partialBatchOutput)) {
          throw new Error(`Partial batch output was not visible through the Agent FileSystem: ${JSON.stringify({ batchJobId, partialBatchOutput, partialWorkspace })}`);
        }
        await page.getByRole("button", { name: "刷新", exact: true }).click();
        try {
          await batchTask.getByText("1/8 项成果", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
        } catch (error) {
          const batchTaskCount = await batchTask.count();
          const productionSummary = page.locator(".oh-story-production-summary");
          const productionSummaryCount = await productionSummary.count();
          const main = page.locator("main");
          const mainCount = await main.count();
          const diagnostic = {
            batchJobId,
            partialBatchOutput,
            batchTaskCount,
            taskText: batchTaskCount === 0 ? undefined : await batchTask.innerText(),
            shotThreeVersions: await page.locator(".oh-story-version-strip[aria-label^='SHOT-EP001-003']").count(),
            productionSummary: productionSummaryCount === 0 ? undefined : await productionSummary.textContent(),
            selectedTabs: await page.getByRole("tab", { selected: true }).allTextContents(),
            mainText: mainCount === 0 ? undefined : (await main.innerText()).slice(0, 4_000),
            pageErrors
          };
          throw new Error(`Partial batch output did not reconcile in the Browser projection: ${JSON.stringify(diagnostic)}`, { cause: error });
        }
        await batchTask.getByText("DSH Turn 已结束，已发现 1/8 项成果；请刷新核对剩余输出。", { exact: true })
          .waitFor({ state: "visible", timeout: 15_000 });

        const readyVideoPaths = Array.from({ length: 8 }, (_, index) => {
          const shotId = `SHOT-EP001-${String(index + 1).padStart(3, "0")}`;
          return `剧集/EP001/制作成果/${shotId}/${shotId}-ready-smoke.mp4`;
        });
        await Promise.all(readyVideoPaths.map(async (path) => {
          await mkdir(dirname(join(dramaRoot, path)), { recursive: true });
          await cp(videoMediaFixture, join(dramaRoot, path));
        }));
        await page.getByRole("button", { name: "刷新", exact: true }).click();
        await productionTabs.getByRole("tab", { name: "成片", exact: true }).click();
        await page.getByText("已可合成", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
        const composeButton = page.getByRole("button", { name: "合成成片", exact: true });
        if (!await composeButton.isEnabled()) throw new Error("A complete video sequence still blocked composition.");
        await composeButton.click();
        const compositionTask = page.locator(".oh-story-task-board article").filter({ hasText: "成片" }).first();
        await compositionTask.getByRole("button", { name: "停止当前 DSH Turn", exact: true })
          .waitFor({ state: "visible", timeout: 10_000 });
        const compositionJobId = await compositionTask.getAttribute("data-job-id");
        if (compositionJobId === null) throw new Error("Composition task did not expose its stable projection id.");
        const compositionOutput = `剧集/EP001/制作成果/成片-${compositionJobId}.mp4`;
        await cp(videoMediaFixture, join(dramaRoot, compositionOutput));
        await page.getByRole("button", { name: "刷新", exact: true }).click();
        await compositionTask.getByText("已完成", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
      }
      await selectFile(page, "剧集/EP001/视频提示词.md");
      await page.getByRole("article", { name: "剧集/EP001/视频提示词.md 渲染预览" }).waitFor({ state: "visible", timeout: 10_000 });
      await captureDemoFrame(page, "drama", 4);
      await openFolder(page, "EP002");
      await selectFile(page, "剧集/EP002/分镜.md");
      await page.getByRole("article", { name: "剧集/EP002/分镜.md 渲染预览" }).waitFor({ state: "visible", timeout: 10_000 });
      await productionTab.click();
      await productionTabs.getByRole("tab", { name: "镜头", exact: true }).click();
      await page.locator(".oh-story-shot-card").first().waitFor({ state: "visible", timeout: 10_000 });
      if (await page.locator(".oh-story-shot-card").count() !== 8
        || await page.locator(".oh-story-shot-card").first().getByRole("button", { name: "SHOT-EP002-001", exact: true }).count() !== 1
        || await page.locator(".oh-story-shot-card .oh-story-media-preview").count() !== 0
        || await page.locator(".oh-story-production-summary").textContent() !== "8 镜 · 10 素材 · 0 任务") {
        throw new Error("EP002 production projection leaked EP001 media or task state.");
      }
      await page.locator(".oh-story-shot-card").first().locator("h3").click();
      await productionTabs.getByRole("tab", { name: "素材", exact: true }).click();
      const crossEpisodeMedia = page.locator(".oh-story-media-library-grid > article").filter({ hasText: "剧集/EP001/" });
      if (await crossEpisodeMedia.count() < 3) throw new Error("EP002 could not discover reusable EP001 project media.");
      const ep2Reference = crossEpisodeMedia.filter({ hasText: productionMediaPath })
        .getByRole("button", { name: /SHOT-EP002-001 参考/u });
      await ep2Reference.click();
      await page.waitForTimeout(100);
      if (await ep2Reference.getAttribute("aria-pressed") !== "true") throw new Error("EP002 could not attach an EP001 image as an explicit cross-episode reference.");
      await productionTabs.getByRole("tab", { name: "画布", exact: true }).click();
      const secondEpisodeCanvasLeft = Number.parseFloat(await page.locator(".oh-story-canvas article").first().evaluate((element) => getComputedStyle(element).left));
      if (secondEpisodeCanvasLeft !== 80) throw new Error("EP002 inherited EP001 canvas coordinates.");
      await openFolder(page, "EP001");
      await selectFile(page, "剧集/EP001/分镜.md");
      await productionTab.click();
      await productionTabs.getByRole("tab", { name: "任务", exact: true }).click();
      if (!useRealDeepSeek && await page.locator(".oh-story-task-board article").count() < 6) {
        throw new Error("EP001 task projection was not restored after switching episodes.");
      }
      await productionTabs.getByRole("tab", { name: "画布", exact: true }).click();
      const restoredFirstEpisodeCanvasLeft = Number.parseFloat(await page.locator(".oh-story-canvas article").first().evaluate((element) => getComputedStyle(element).left));
      if (restoredFirstEpisodeCanvasLeft !== leftAfterKeyboardMove) throw new Error("EP001 canvas coordinates were not restored after switching episodes.");
      await productionTabs.getByRole("tab", { name: "镜头", exact: true }).click();
      if (await page.locator(".oh-story-shot-card").first().locator(".oh-story-version-strip").getByRole("button").first().getAttribute("data-selected") === null) {
        throw new Error("EP001 media-version selection was not restored after switching episodes.");
      }
      await selectFile(page, "剧集/EP001/视频提示词.md");
      await page.getByRole("article", { name: "剧集/EP001/视频提示词.md 渲染预览" }).waitFor({ state: "visible", timeout: 10_000 });
      if (await page.getByRole("complementary", { name: "Agent 工作详情" }).count() !== 0) {
        throw new Error("Novel workspace still duplicates the official Agent activity UI.");
      }
      const treeBox = await page.locator(".oh-story-tree").boundingBox();
      const editorBox = await page.locator(".oh-story-editor").boundingBox();
      const chatLocator = page.locator('[data-slot="conversation.session"] > :not(.oh-story-split-surface)');
      const chatBox = await chatLocator.boundingBox();
      const composerLocator = page.locator("[data-composer-seat]");
      const composerBox = await composerLocator.boundingBox();
      if (treeBox === null || editorBox === null || chatBox === null || composerBox === null) throw new Error("Missing three-column layout box.");
      const geometry = {
        ordered: treeBox.x + treeBox.width <= editorBox.x + 1 && editorBox.x + editorBox.width <= chatBox.x + 1,
        composerInsideChat: composerBox.x >= chatBox.x - 1 && composerBox.x + composerBox.width <= chatBox.x + chatBox.width + 1,
        widths: [treeBox.width, editorBox.width, chatBox.width]
      };
      if (!geometry.ordered || !geometry.composerInsideChat || geometry.widths.some((width) => width < 120)) {
        throw new Error(`Invalid three-column geometry: ${JSON.stringify(geometry)}`);
      }
      const scrollerLocator = page.locator("[data-conversation-scroll]");
      if (await scrollerLocator.getAttribute("data-oh-story-layout") !== "wide") {
        throw new Error("Workbench did not derive its wide layout from the conversation container.");
      }
      await assertChatAnchorContract(page, chatLocator, scrollerLocator, composerLocator, "wide");
      const scrollViewport = await scrollerLocator.boundingBox();
      if (scrollViewport === null) throw new Error("Missing conversation scroll viewport.");
      const priorMinHeight = await chatLocator.evaluate((element) => element.style.minHeight);
      const viewportHeight = await scrollerLocator.evaluate((element) => element.clientHeight);
      await chatLocator.evaluate((element, height) => { element.style.minHeight = height; }, `${String(viewportHeight * 4)}px`);
      const scrollHeight = await scrollerLocator.evaluate((element) => element.scrollHeight);
      const composerScroll: { readonly top: number; readonly visible: boolean }[] = [];
      for (const top of [0, (scrollHeight - viewportHeight) / 2, scrollHeight]) {
        await scrollerLocator.evaluate((element, nextTop) => { element.scrollTo({ top: nextTop }); }, top);
        await page.waitForTimeout(50);
        const input = await composerLocator.boundingBox();
        if (input === null) throw new Error("Official Composer disappeared while scrolling.");
        composerScroll.push({
          top: input.y,
          visible: input.y >= scrollViewport.y - 1 && input.y + input.height <= scrollViewport.y + scrollViewport.height + 1
        });
      }
      await chatLocator.evaluate((element, height) => { element.style.minHeight = height; }, priorMinHeight);
      await scrollerLocator.evaluate((element) => { element.scrollTo({ top: 0 }); });
      if (composerScroll.some((sample) => !sample.visible) || Math.max(...composerScroll.map((sample) => sample.top)) - Math.min(...composerScroll.map((sample) => sample.top)) > 1) {
        throw new Error(`Official Composer did not remain fixed while Chat scrolled: ${JSON.stringify(composerScroll)}`);
      }
      // DSH's navigation/sidebar width differs by platform and font metrics.
      // Calibrate the browser until the conversation center itself reaches
      // roughly its documented 640 px minimum instead of guessing a viewport.
      let narrowViewportWidth = 842;
      let narrowScroller = { clientWidth: 0, scrollWidth: 0 };
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await page.setViewportSize({ width: narrowViewportWidth, height: 900 });
        await page.waitForTimeout(100);
        narrowScroller = await scrollerLocator.evaluate((element) => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth
        }));
        if (narrowScroller.clientWidth >= 620) break;
        narrowViewportWidth += 640 - narrowScroller.clientWidth;
      }
      const narrowTree = await page.locator(".oh-story-tree").boundingBox();
      const narrowEditor = await page.locator(".oh-story-editor").boundingBox();
      const narrowChat = await chatLocator.boundingBox();
      const narrowWorkbench = await page.locator(".oh-story-split-surface").evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth
      }));
      if (narrowTree === null || narrowEditor === null || narrowChat === null
        || narrowScroller.clientWidth < 620
        || await scrollerLocator.getAttribute("data-oh-story-layout") !== "medium"
        || narrowWorkbench.scrollWidth > narrowWorkbench.clientWidth + 1
        || narrowTree.width < 100 || narrowEditor.width < 200 || narrowChat.width < 240) {
        throw new Error(`Workbench overflowed the minimum DSH center width: ${JSON.stringify({ narrowViewportWidth, narrowScroller, narrowWorkbench, narrowTree, narrowEditor, narrowChat })}`);
      }
      await assertChatAnchorContract(page, chatLocator, scrollerLocator, composerLocator, "medium");
      await openGroup(page, "剧集");
      await openFolder(page, "EP001");
      const compactPath = "剧集/EP001/分镜.md";
      await selectFile(page, compactPath);
      await page.getByRole("article", { name: `${compactPath} 渲染预览` }).waitFor({ state: "visible", timeout: 10_000 });
      await page.setViewportSize({ width: 500, height: 900 });
      await page.waitForTimeout(100);
      const compactScroller = await scrollerLocator.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
      const compactBoxes = await Promise.all([
        page.locator(".oh-story-tree").boundingBox(),
        page.locator(".oh-story-editor").boundingBox(),
        chatLocator.boundingBox(),
        composerLocator.boundingBox(),
        composerLocator.getByRole("button", { name: /^(?:Select model|选择模型)/u }).boundingBox(),
        composerLocator.getByRole("button", { name: /^(?:Send message|发送消息)$/u }).boundingBox()
      ]);
      if (compactBoxes.some((box) => box === null)) throw new Error("Compact three-column layout lost a required column.");
      const [compactTree, compactEditor, compactChat, compactComposer, compactModel, compactSend] = compactBoxes as Exclude<(typeof compactBoxes)[number], null>[];
      const compactOrdered = compactTree.x + compactTree.width <= compactEditor.x + 1
        && compactEditor.x + compactEditor.width <= compactChat.x + 1;
      const compactVisible = [compactTree, compactEditor, compactChat, compactComposer, compactModel, compactSend]
        .every((box) => box.x >= -1 && box.x + box.width <= 501);
      const compactFileTextWidth = await page.locator(`button[data-file-path=${JSON.stringify(compactPath)}]`).evaluate((element) => {
        const style = getComputedStyle(element);
        return element.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
      });
      const compactHeaderWidth = await page.locator(".oh-story-editor-path > strong").evaluate((element) => element.getBoundingClientRect().width);
      const compactShotHeadingWidth = await page.getByRole("heading", { name: /^SHOT-EP001-/u }).first().evaluate((element) => element.getBoundingClientRect().width);
      const pageOverflow = await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth);
      if (!compactOrdered || !compactVisible
        || await scrollerLocator.getAttribute("data-oh-story-layout") !== "compact"
        || compactFileTextWidth < 32 || compactHeaderWidth < 40 || compactShotHeadingWidth < 32 || pageOverflow > 1) {
        throw new Error(`500px viewport clipped the workbench or made its content unreadable: ${JSON.stringify({ compactScroller, compactBoxes, compactFileTextWidth, compactHeaderWidth, compactShotHeadingWidth, pageOverflow })}`);
      }
      await assertChatAnchorContract(page, chatLocator, scrollerLocator, composerLocator, "compact");
      await page.getByRole("tab", { name: "生产", exact: true }).click();
      await page.getByRole("tablist", { name: "短剧生产视图" }).getByRole("tab", { name: "镜头", exact: true }).click();
      await page.locator(".oh-story-shot-card").first().waitFor({ state: "visible", timeout: 10_000 });
      const compactProductionOverflow = await page.evaluate(() => Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - document.documentElement.clientWidth);
      const compactProduction = await page.locator(".oh-story-production").evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
      if (compactProductionOverflow > 1 || compactProduction.scrollWidth > compactProduction.clientWidth + 1) {
        throw new Error(`500px production view overflowed its DSH editor column: ${JSON.stringify({ compactProductionOverflow, compactProduction })}`);
      }
      await page.getByRole("tab", { name: "源码" }).click();
      const compactSource = page.getByRole("textbox", { name: compactPath });
      await compactSource.press("End");
      await compactSource.type(" ");
      const compactHeaderControls = await page.locator(".oh-story-editor-actions").evaluate((element) => {
        const editor = element.closest(".oh-story-editor")?.getBoundingClientRect();
        const tabs = element.querySelector(".oh-story-editor-tabs")?.getBoundingClientRect();
        const save = element.querySelector(".oh-story-save")?.getBoundingClientRect();
        return { editor, tabs, save };
      });
      if (compactHeaderControls.editor === undefined || compactHeaderControls.tabs === undefined || compactHeaderControls.save === undefined
        || compactHeaderControls.tabs.right > compactHeaderControls.save.left + 1
        || compactHeaderControls.tabs.left < compactHeaderControls.editor.left - 1
        || compactHeaderControls.save.right > compactHeaderControls.editor.right + 1) {
        throw new Error(`500px dirty editor controls overlapped or escaped the editor: ${JSON.stringify(compactHeaderControls)}`);
      }
      if (pageErrors.length > 0) throw new Error(`Browser module raised errors: ${pageErrors.join("; ")}`);
      } finally {
        await browser.close();
      }
    }

    process.stdout.write(`${JSON.stringify({
      ok: true,
      dshVersion,
      architecture: "pure-plugin",
      sessionApi: true,
      skills: ohStorySkills.length,
      dramaSkills: dramaSkills.length,
      gameSkills: gameSkills.length,
      userInvocableVideoSkills: videoSkills.length,
      provider: useRealDeepSeek ? "deepseek-official" : "local-fixture",
      fixtures: [storyProjectName, dramaProjectName, "金瓶梅 · 风月总账"],
      uiSlots: ["shell.overlay", "tool.call.toolview"],
      workbenchGate: "creative-project-only",
      workbenchCollapse: "per-workspace",
      threeColumn: true,
      gameStudio: "preview-left-chat-right",
      videoStudio: "preview-left-chat-right",
      videoPreviewRoles: ["source", "edited", "final"],
      playableIframe: true,
      previewCsp: "asset-prefix-only",
      gameModeExit: true,
      gameModeState: "preserved",
      qaArtifactChecks: 6,
      qaSurface: "hidden",
      gamePreviewState: "preserved-across-tabs",
      qaArtifactBinding: "current-build-aware",
      compactGameViewport: 500,
      agentWriteStreaming: !useRealDeepSeek,
      roleToolE2e: !useRealDeepSeek,
      atomicCasWriters: candidates.length,
      compactViewport: 500
    })}\n`);
  } catch (error) {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const redact = (value: string): string => apiKey === undefined ? value : value.replaceAll(apiKey, "[REDACTED]");
    throw new Error(`${redact(String(error))}\nMock requests: ${JSON.stringify(mockDeepSeek?.requests ?? [])}\nDSH logs:\n${redact(logs.join("").slice(-16_000))}`, { cause: error });
  } finally {
    if (child !== undefined) await stop(child);
    if (mockDeepSeek !== undefined) await closeServer(mockDeepSeek.server);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
