import type { IncomingHttpHeaders } from "node:http";

interface WorkspaceTrustRequest {
  readonly headers: IncomingHttpHeaders | Headers;
}

function header(headers: IncomingHttpHeaders | Headers, name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const value = headers[name];
  return typeof value === "string" ? value : undefined;
}

function parseAuthority(authority: string): URL | undefined {
  try { return new URL(`http://${authority}`); }
  catch { return undefined; }
}

function canonicalAuthority(entry: string, url: URL): string {
  const port = url.port !== "" ? url.port : new URL(`https://${entry}`).port;
  return port === "" ? url.hostname : `${url.hostname}:${port}`;
}

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const parts = hostname.split(".");
  return parts.length === 4
    && parts[0] === "127"
    && parts.every((part) => /^\d{1,3}$/u.test(part) && Number(part) <= 255);
}

function isTrustedAuthority(host: URL, trustedHosts: readonly string[]): boolean {
  return trustedHosts.some((entry) => {
    const candidate = parseAuthority(entry);
    if (candidate === undefined) return false;
    return canonicalAuthority(entry, candidate) === candidate.hostname
      ? candidate.hostname === host.hostname
      : candidate.host === host.host;
  });
}

/** Reject malformed declarations at plugin load instead of silently widening access. */
export function assertTrustedWorkspaceAuthority(entry: string): void {
  const url = parseAuthority(entry);
  if (url !== undefined && canonicalAuthority(entry, url) === entry.toLocaleLowerCase()) return;
  throw new Error(`oh-story: trustedHosts entry ${JSON.stringify(entry)} is not a bare host[:port] authority`);
}

/**
 * Same browser trust boundary as DSH's native API: every request must address a
 * loopback or explicitly trusted Host, and browser markers must be same-origin.
 */
export function isTrustedWorkspaceRequest(
  request: WorkspaceTrustRequest,
  trustedHosts: readonly string[]
): boolean {
  const authority = header(request.headers, "host");
  if (authority === undefined) return false;
  const host = parseAuthority(authority);
  if (host === undefined) return false;
  if (!isLoopbackHostname(host.hostname) && !isTrustedAuthority(host, trustedHosts)) return false;
  if (header(request.headers, "sec-fetch-site") === "cross-site") return false;
  const origin = header(request.headers, "origin");
  if (origin === undefined) return true;
  try { return new URL(origin).host === host.host; }
  catch { return false; }
}

/**
 * Permit a generated-game document to navigate from one loopback alias to
 * another (127.0.0.1 ↔ localhost). Subresources then become same-origin with
 * the isolated preview document and use the stricter path above.
 */
export function isTrustedPreviewNavigation(
  request: WorkspaceTrustRequest,
  trustedHosts: readonly string[]
): boolean {
  if (isTrustedWorkspaceRequest(request, trustedHosts)) return true;
  const authority = header(request.headers, "host");
  if (authority === undefined) return false;
  const host = parseAuthority(authority);
  if (host === undefined || (!isLoopbackHostname(host.hostname) && !isTrustedAuthority(host, trustedHosts))) return false;
  return header(request.headers, "origin") === undefined
    && header(request.headers, "sec-fetch-site") === "cross-site"
    && header(request.headers, "sec-fetch-mode") === "navigate"
    && ["document", "iframe"].includes(header(request.headers, "sec-fetch-dest") ?? "");
}
