import { createHash } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dshVersion = "0.1.1-rc.1";

function run(command: string, args: readonly string[], env: NodeJS.ProcessEnv = process.env): void {
  const result = spawnSync(command, args, { cwd: repositoryRoot, env, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) throw new Error(`Command failed: ${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((accept, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", accept); });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Could not reserve a DSH test port.");
  await new Promise<void>((accept, reject) => server.close((error) => error ? reject(error) : accept()));
  return address.port;
}

async function waitForServer(origin: string): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(origin)).ok) return; } catch { /* retry */ }
    await new Promise((accept) => setTimeout(accept, 150));
  }
  throw new Error("Timed out waiting for official DSH Web.");
}

async function rpc<T>(origin: string, method: string, payload: unknown): Promise<T> {
  const rpcId = `oh-story-real-${crypto.randomUUID()}`;
  const deadline = Date.now() + 15_000;
  while (true) {
    const response = await fetch(`${origin}/api/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "client-request", rpcId, method, payload })
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
    catch { throw new Error(`DSH ${method} returned HTTP ${String(response.status)} with a non-JSON body: ${body.slice(0, 200)}`); }
    if (!response.ok || envelope.rpcId !== rpcId || !envelope.result.ok) {
      throw new Error(`DSH ${method} failed: ${JSON.stringify(envelope)}`);
    }
    return envelope.result.value;
  }
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

async function readApiKey(): Promise<string> {
  const local = parseEnv(await readFile(join(repositoryRoot, ".env.local"), "utf8").catch(() => ""));
  let value = process.env.DEEPSEEK_API_KEY ?? local.DEEPSEEK_API_KEY;
  if (value === undefined) {
    const keyPath = process.env.DEEPSEEK_API_KEY_FILE ?? "/Volumes/My Shared Files/tmp/.key";
    const source = await readFile(keyPath, "utf8").catch(() => "");
    if (source.includes("=")) value = parseEnv(source).DEEPSEEK_API_KEY;
    else value = source.trim();
  }
  if (value === undefined || !/^[\x21-\x7e]+$/u.test(value)) {
    throw new Error("A valid DeepSeek API key is required via environment, ignored .env.local, or DEEPSEEK_API_KEY_FILE.");
  }
  return value;
}

async function treeDigest(root: string): Promise<string> {
  const hash = createHash("sha256");
  const visit = async (directory: string): Promise<void> => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        hash.update(relative(root, path));
        hash.update(await readFile(path));
      }
    }
  };
  await visit(root);
  return hash.digest("hex");
}

interface HistoryEvent { readonly type: string; readonly seq: number; readonly data: unknown }

async function waitForCompletedTurn(origin: string, sessionId: string): Promise<readonly HistoryEvent[]> {
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    const history = await rpc<{ readonly events: readonly { readonly event: HistoryEvent }[] }>(origin, "session.history", { sessionId, maxMessages: 1_000 });
    const events = history.events.map((entry) => entry.event);
    const end = [...events].reverse().find((event) => event.type === "turn/end");
    if (end !== undefined) {
      const reason = (end.data as { readonly reason?: { readonly kind?: string } }).reason?.kind;
      if (reason !== "completed") throw new Error(`DSH Agent turn ended with ${String(reason)}.`);
      return events;
    }
    await new Promise((accept) => setTimeout(accept, 750));
  }
  throw new Error("DSH Agent turn did not complete within ten minutes.");
}

async function main(): Promise<void> {
  const apiKey = await readApiKey();
  const temporaryRoot = await mkdtemp(join(tmpdir(), "oh-story-native-dsh-real-"));
  const packDirectory = join(temporaryRoot, "pack");
  const installation = join(temporaryRoot, "dsh");
  const dshHome = join(temporaryRoot, "home");
  const projectRoot = join(temporaryRoot, "novel");
  const origin = `http://127.0.0.1:${String(await freePort())}`;
  const logs: string[] = [];
  const redact = (value: string): string => value.replaceAll(apiKey, "[REDACTED]");
  let child: ChildProcess | undefined;
  try {
    await Promise.all([
      mkdir(join(projectRoot, "正文"), { recursive: true }),
      mkdir(join(projectRoot, "大纲"), { recursive: true }),
      mkdir(join(projectRoot, "设定", "角色"), { recursive: true }),
      mkdir(join(projectRoot, "追踪"), { recursive: true }),
      mkdir(join(projectRoot, "剧集", "EP001"), { recursive: true })
    ]);
    await Promise.all([
      writeFile(join(projectRoot, "正文", "第001章_雨夜.md"), "# 第一章 雨夜\n\n林舟握着铜钥匙走进废弃车站。雨棚下没有脚印，售票窗却亮着灯。\n"),
      writeFile(join(projectRoot, "大纲", "细纲_第001章.md"), "# 第一章细纲\n\n- 林舟进入废弃车站。\n- 铜钥匙与异常灯光构成悬念。\n"),
      writeFile(join(projectRoot, "设定", "角色", "林舟.md"), "# 林舟\n\n谨慎，随身携带一把来历不明的铜钥匙。\n"),
      writeFile(join(projectRoot, "追踪", "_tracking-state.json"), '{"state_revision":1,"last_committed_chapter":1}\n'),
      writeFile(join(projectRoot, "剧集", "EP001", "剧本.md"), [
        "# EP001 雨夜车票", "", "## EP001-SC001 内 · 旧渡站售票厅 · 夜 / 暴雨", "",
        "林舟推开锈死的玻璃门。售票窗后的灯突然亮起，一张湿漉漉的车票从缝隙里滑出来。", "",
        "林舟（压低声音）：谁在里面？", "",
        "扩音器：请持票人准时上车。", "", "[画面文字] 车票：旧渡站 → 临江，2003 年 8 月 20 日。", "",
        "林舟摊开掌心。铜钥匙正在发热。"
      ].join("\n") + "\n"),
      writeFile(join(projectRoot, "剧集", "EP001", "视觉设定.md"), "# EP001 视觉设定\n\n## 人物 · 林舟\n- 识别锚点：瘦高，眉骨有浅疤，掌心握铜钥匙。\n\n## 地点 · 旧渡站\n- 识别锚点：锈蚀玻璃门、单个亮灯售票窗、暴雨夜。\n"),
      writeFile(join(projectRoot, "剧集", "EP001", "分镜.md"), "# EP001 分镜\n\n## SHOT-EP001-001 · 车票滑出\n- 来源：EP001-SC001\n- 时长：4s\n- 起点：空售票窗亮灯。\n- 终点：湿车票滑到林舟面前。\n\n### 冻结关键帧提示词\n> A vertical cinematic frame of an abandoned ticket booth glowing in a storm.\n"),
      writeFile(join(projectRoot, "剧集", "EP001", "图片提示词.md"), "# EP001 图片提示词\n\n## IMG-LINZHOU-SHEET · 林舟角色板\n- 用途：锁定人物身份与造型。\n\n### 可复制提示词\n> A lean young man with a faint eyebrow scar holding an antique brass key.\n"),
      writeFile(join(projectRoot, "剧集", "EP001", "视频提示词.md"), "# EP001 视频提示词\n\n## MOTION-EP001-001 · 车票滑出\n- 分镜：SHOT-EP001-001\n- 时长：4s\n- 终点：湿车票滑到人物面前。\n\n### 可复制提示词\n> The ticket booth light switches on and a wet ticket slides through the slot.\n")
    ]);
    const before = await treeDigest(projectRoot);
    run("pnpm", ["--filter", "@oh-story/dsh", "build"]);
    run("pnpm", ["--filter", "@oh-story/dsh", "pack", "--pack-destination", packDirectory]);
    await mkdir(installation, { recursive: true });
    await writeFile(join(installation, "package.json"), `${JSON.stringify({ private: true, dependencies: { "@deepseek-ai/dsh": dshVersion } }, null, 2)}\n`);
    await writeFile(join(installation, "pnpm-workspace.yaml"), [
      "packages:", "  - .", "nodeLinker: hoisted", "allowBuilds:",
      "  '@deepseek-ai/dsh-subprocess-local': true", "  '@google/genai': false", "  koffi: true",
      "  node-addon-require-builtin: false", "  node-pty: true", "  protobufjs: false", ""
    ].join("\n"));
    try { run("pnpm", ["--dir", installation, "install", "--offline"]); }
    catch { run("pnpm", ["--dir", installation, "install"]); }
    const dshBin = join(installation, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
    const tarball = (await readdir(packDirectory)).find((entry) => entry.endsWith(".tgz"));
    if (tarball === undefined) throw new Error("Plugin pack did not create a tarball.");
    const env = { ...process.env, DEEPSEEK_API_KEY: apiKey, DSH_HOME: dshHome, DSH_TELEMETRY_DISABLED: "1" };
    run(process.execPath, [dshBin, "plugin", "--profile", "web", "add", join(packDirectory, tarball)], env);
    child = spawn(process.execPath, [dshBin, "web", "--no-open", "--port", new URL(origin).port], {
      cwd: repositoryRoot, env, stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout?.on("data", (chunk: Buffer) => logs.push(chunk.toString("utf8")));
    child.stderr?.on("data", (chunk: Buffer) => logs.push(chunk.toString("utf8")));
    await waitForServer(origin);

    const workspace = await rpc<{ readonly workspace: { readonly workspaceId: string } }>(origin, "workspace.create", { path: projectRoot });
    const session = await rpc<{ readonly sessionId: string }>(origin, "session.create", { workspaceId: workspace.workspace.workspaceId });
    const models = await rpc<{
      readonly current: { readonly provider: string; readonly model: string };
      readonly groups: readonly { readonly id: string; readonly models: readonly { readonly id: string }[] }[];
    }>(origin, "session.models", { sessionId: session.sessionId });
    const deepseek = models.groups.find((group) => group.id === "deepseek-official");
    const selectedModel = deepseek?.models.find((candidate) => candidate.id === "deepseek-v4-flash")?.id ?? deepseek?.models[0]?.id;
    if (deepseek === undefined || selectedModel === undefined) throw new Error("DSH did not expose a DeepSeek official model.");
    await rpc(origin, "session.selectModel", { sessionId: session.sessionId, provider: deepseek.id, model: selectedModel });

    const skills = await rpc<{ readonly skills: readonly { readonly name: string }[] }>(origin, "skill.list", { sessionId: session.sessionId });
    if (!skills.skills.some((skill) => skill.name === "story-review")) throw new Error("story-review was not registered in the DSH Session.");
    await rpc(origin, "session.prompt", {
      sessionId: session.sessionId,
      mode: "queue",
      content: [{
        type: "text",
        text: "/story-review lean 审查 正文/第001章_雨夜.md。只输出审稿报告，不修改任何文件；必须通过 oh_story_role 分别调用 story-explorer 和 consistency-checker，并综合两者的证据。"
      }],
      clientTimeZone: "America/Los_Angeles"
    });

    const storyEvents = await waitForCompletedTurn(origin, session.sessionId);
    const roleCalls = storyEvents.filter((event) => event.type === "tool/call")
      .map((event) => event.data as { readonly name?: string; readonly arguments?: string })
      .filter((data) => data.name === "oh_story_role");
    const roleArguments = roleCalls.map((call) => call.arguments ?? "").join("\n");
    for (const role of ["story-explorer", "consistency-checker"]) {
      if (!roleArguments.includes(role)) throw new Error(`Real DSH Agent did not call required Role ${role}.`);
    }
    if (!storyEvents.some((event) => event.type === "assistant/message")) throw new Error("Story review Session has no durable assistant result.");

    const dramaSession = await rpc<{ readonly sessionId: string }>(origin, "session.create", { workspaceId: workspace.workspace.workspaceId });
    await rpc(origin, "session.selectModel", { sessionId: dramaSession.sessionId, provider: deepseek.id, model: selectedModel });
    const dramaSkills = await rpc<{ readonly skills: readonly { readonly name: string }[] }>(origin, "skill.list", { sessionId: dramaSession.sessionId });
    if (!dramaSkills.skills.some((skill) => skill.name === "short-drama-review")) throw new Error("short-drama-review was not registered in the DSH Session.");
    await rpc(origin, "session.prompt", {
      sessionId: dramaSession.sessionId,
      mode: "queue",
      content: [{
        type: "text",
        text: "/short-drama-review story_script 只读审查 creator-first 文档 剧集/EP001/剧本.md。只输出审查结论，不修改文件，不生成审查文件或任何 JSON/JSONL，也不调用生产步骤。"
      }],
      clientTimeZone: "America/Los_Angeles"
    });
    const dramaEvents = await waitForCompletedTurn(origin, dramaSession.sessionId);
    if (!dramaEvents.some((event) => event.type === "assistant/message")) throw new Error("Short-drama review Session has no durable assistant result.");
    const after = await treeDigest(projectRoot);
    if (after !== before) throw new Error("Read-only release flows unexpectedly modified the project.");
    const remainingKey = logs.join("").includes(apiKey);
    if (remainingKey) throw new Error("DSH logs exposed the API key.");

    process.stdout.write(`${JSON.stringify({
      ok: true,
      dshVersion,
      provider: deepseek.id,
      model: selectedModel,
      skills: ["story-review", "short-drama-review"],
      roleCalls: roleCalls.length,
      durableSessionEvents: { story: storyEvents.length, drama: dramaEvents.length },
      projectUnchanged: true
    })}\n`);
  } catch (error) {
    throw new Error(`${redact(String(error))}\nDSH logs:\n${redact(logs.join("").slice(-20_000))}`, { cause: error });
  } finally {
    if (child !== undefined) await stop(child);
    if ((await stat(temporaryRoot).catch(() => undefined))?.isDirectory()) await rm(temporaryRoot, { recursive: true, force: true });
  }
}

await main();
