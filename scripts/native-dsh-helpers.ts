import type { ChildProcess } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";

/** Exact WebSocket route carrying every Typert Remote stream. */
export const REMOTE_STREAM_MUX_PATH = "/api/remote.mux";

export interface HistoryEvent {
  readonly seq: number;
  readonly type: string;
  readonly data: unknown;
}

interface HistoryRecord {
  readonly type: string;
  readonly event: HistoryEvent;
}

let dshAuthCookie: string | undefined;

export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Could not reserve a DSH test port.");
  await new Promise<void>((accept, reject) => server.close((error) => error ? reject(error) : accept()));
  return address.port;
}

/**
 * DSH 0.1.2 gates Web and `/api` behind a session cookie. Exchange the one-time
 * token the CLI prints at startup for that cookie, and hand the same URL to
 * Chrome so the browser authorizes itself the way a user would.
 */
export async function authorizeDsh(origin: string, logs: readonly string[]): Promise<string> {
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

/**
 * DSH 0.1.7 creates its first-use workspace under the account's Documents folder, outside
 * DSH_HOME. Point it into the temporary root so a run never writes to the real home.
 */
export async function isolateFirstUseWorkspace(dshHome: string, documents: string): Promise<void> {
  await mkdir(documents, { recursive: true });
  await writeFile(
    join(dshHome, "profiles", "web", "cordis.patch.yml"),
    `- id: workspace-controller\n  config:\n    documentsDirectory: ${JSON.stringify(documents)}\n`
  );
}

/** Every request to DSH carries the session cookie obtained by {@link authorizeDsh}. */
export async function dshFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, headers: { ...init.headers as Record<string, string>, cookie: dshAuthCookie ?? "" } });
}

/**
 * DSH 0.1.2 addresses Remotes as `<namespace>/<method>` and carries the call in
 * a single `args` field, so the wire method must equal the endpoint path.
 */
export async function rpc<T>(origin: string, endpoint: string, args: object, rpcPrefix = "oh-story"): Promise<T> {
  const rpcId = `${rpcPrefix}-${crypto.randomUUID()}`;
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
      readonly result:
        | { readonly ok: true; readonly value: T }
        | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };
    };
    try { envelope = JSON.parse(body) as typeof envelope; }
    catch { throw new Error(`DSH ${endpoint} returned HTTP ${String(response.status)} with a non-JSON body: ${body.slice(0, 200)}`); }
    if (!response.ok || envelope.rpcId !== rpcId || !envelope.result.ok) {
      throw new Error(`DSH ${endpoint} failed: ${JSON.stringify(envelope)}`);
    }
    return envelope.result.value;
  }
}

/**
 * `session.history` is gone: the durable log now arrives as the opening
 * snapshot of the `session/follow` stream, multiplexed over one WebSocket.
 */
export async function sessionEvents(origin: string, sessionId: string): Promise<readonly HistoryEvent[]> {
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
  } finally {
    clearTimeout(stalled);
    socket.close();
  }
}

export async function stopDshProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGINT");
  await Promise.race([
    new Promise<void>((accept) => child.once("exit", () => accept())),
    new Promise<void>((accept) => setTimeout(accept, 3_000))
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}
