import type { IncomingHttpHeaders } from "node:http";

interface WorkspaceTrustRequest {
  readonly headers: IncomingHttpHeaders | Headers;
}

function header(headers: IncomingHttpHeaders | Headers, name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  const value = headers[name];
  return typeof value === "string" ? value : undefined;
}

function parseAuthority(authority: string, scheme: "http:" | "https:" = "http:"): URL | undefined {
  try { return new URL(`${scheme}//${authority}`); }
  catch { return undefined; }
}

function canonicalAuthority(entry: string, url: URL): string {
  const other = url.protocol === "http:" ? "https:" : "http:";
  const port = url.port !== "" ? url.port : new URL(`${other}//${entry}`).port;
  return port === "" ? url.hostname : `${url.hostname}:${port}`;
}

function isLoopbackHostname(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const parts = hostname.split(".");
  return parts.length === 4
    && parts[0] === "127"
    && parts.every((part) => /^\d{1,3}$/u.test(part) && Number(part) <= 255);
}

function isTrustedAuthority(host: URL, trustedHosts: readonly string[], protocol: "http:" | "https:"): boolean {
  return trustedHosts.some((entry) => {
    const candidate = parseAuthority(entry, protocol);
    if (candidate === undefined) return false;
    return canonicalAuthority(entry, candidate) === candidate.hostname
      ? candidate.hostname === host.hostname
      : candidate.host === host.host;
  });
}

function isBindAddressAuthority(host: URL, bindHost: string | undefined): boolean {
  if (bindHost === undefined) return false;
  const zoneAt = bindHost.indexOf("%");
  const address = zoneAt === -1 ? bindHost : bindHost.slice(0, zoneAt);
  const bindUrl = parseAuthority(address.includes(":") ? `[${address}]` : address);
  return bindUrl !== undefined && bindUrl.hostname === host.hostname;
}

function isSameAuthorityOrigin(origin: string, host: string): boolean {
  let originUrl: URL;
  try { originUrl = new URL(origin); }
  catch { return false; }
  const scheme = originUrl.protocol === "https:" ? "https:"
    : originUrl.protocol === "http:" ? "http:"
      : undefined;
  if (scheme === undefined) return false;
  const hostUrl = parseAuthority(host, scheme);
  return hostUrl !== undefined && originUrl.host === hostUrl.host;
}

function trustedHostUrl(
  request: WorkspaceTrustRequest,
  trustedHosts: readonly string[],
  bindHost?: string,
  protocol: "http:" | "https:" = "http:"
): { readonly authority: string; readonly host: URL } | undefined {
  const authority = header(request.headers, "host");
  if (authority === undefined) return undefined;
  const host = parseAuthority(authority, protocol);
  if (host === undefined) return undefined;
  if (!isLoopbackHostname(host.hostname)
    && !isTrustedAuthority(host, trustedHosts, protocol)
    && !isBindAddressAuthority(host, bindHost)) {
    return undefined;
  }
  return { authority, host };
}

/** Reject malformed declarations at plugin load instead of silently widening access. */
export function assertTrustedWorkspaceAuthority(entry: string): void {
  const url = parseAuthority(entry);
  if (url !== undefined && canonicalAuthority(entry, url) === entry.toLocaleLowerCase()) return;
  throw new Error(`oh-story: trustedHosts entry ${JSON.stringify(entry)} is not a bare host[:port] authority`);
}

/**
 * Same browser trust boundary as DSH's native API: every request must address a
 * loopback, bind-IP, or explicitly trusted Host, and browser markers must be same-origin.
 */
export function isTrustedWorkspaceRequest(
  request: WorkspaceTrustRequest,
  trustedHosts: readonly string[],
  bindHost?: string,
  protocol: "http:" | "https:" = "http:"
): boolean {
  const resolved = trustedHostUrl(request, trustedHosts, bindHost, protocol);
  if (resolved === undefined) return false;
  if (header(request.headers, "sec-fetch-site") === "cross-site") return false;
  const origin = header(request.headers, "origin");
  if (origin === undefined) return true;
  return isSameAuthorityOrigin(origin, resolved.authority);
}

/**
 * Permit a generated-game document to navigate from one loopback alias to
 * another (127.0.0.1 ↔ localhost). Subresources then become same-origin with
 * the isolated preview document and use the stricter path above.
 */
export function isTrustedPreviewNavigation(
  request: WorkspaceTrustRequest,
  trustedHosts: readonly string[],
  bindHost?: string,
  protocol: "http:" | "https:" = "http:"
): boolean {
  if (isTrustedWorkspaceRequest(request, trustedHosts, bindHost, protocol)) return true;
  if (trustedHostUrl(request, trustedHosts, bindHost, protocol) === undefined) return false;
  return header(request.headers, "origin") === undefined
    && header(request.headers, "sec-fetch-site") === "cross-site"
    && header(request.headers, "sec-fetch-mode") === "navigate"
    && ["document", "iframe"].includes(header(request.headers, "sec-fetch-dest") ?? "");
}

/** Normalize a bare `host[:port]` authority for signing into a game preview token. */
export function normalizePreviewAuthority(
  authority: string | undefined,
  protocol: "http:" | "https:" = "http:"
): string | undefined {
  if (authority === undefined) return undefined;
  const trimmed = authority.trim();
  if (trimmed === "") return undefined;
  const parsed = parseAuthority(trimmed, protocol);
  return parsed === undefined ? undefined : canonicalAuthority(trimmed, parsed);
}

function matchesBoundPreviewAuthority(
  incomingAuthority: string,
  boundAuthority: string,
  protocol: "http:" | "https:" = "http:"
): boolean {
  const incoming = parseAuthority(incomingAuthority, protocol);
  const bound = parseAuthority(boundAuthority, protocol);
  if (incoming === undefined || bound === undefined) return false;
  if (incoming.host === bound.host) return true;
  return isLoopbackHostname(incoming.hostname)
    && isLoopbackHostname(bound.hostname)
    && incoming.port === bound.port;
}

/**
 * Authorize a `/oh-story/game-preview/<signed-token>/<path...>` request whose
 * verified HMAC token binds the minting request's normalized `Host` (`boundHost`).
 * Accepts the exact bound authority or a loopback alias on the same port
 * (`127.0.0.1` ↔ `localhost` ↔ `[::1]`) while rejecting third-party origins and
 * DNS-rebound hosts without duplicating DSH's `client-connection.trustedHosts`.
 */
export function isBoundPreviewAssetRequest(
  request: WorkspaceTrustRequest,
  boundHost: string,
  protocol: "http:" | "https:" = "http:"
): boolean {
  const authority = header(request.headers, "host");
  if (authority === undefined) return false;
  if (!matchesBoundPreviewAuthority(authority, boundHost, protocol)) return false;
  const origin = header(request.headers, "origin");
  if (origin === undefined || origin === "null") return true;
  if (isSameAuthorityOrigin(origin, authority)) return true;
  try {
    const originUrl = new URL(origin);
    if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") return false;
    const hostUrl = parseAuthority(authority, originUrl.protocol);
    return hostUrl !== undefined
      && isLoopbackHostname(hostUrl.hostname)
      && isLoopbackHostname(originUrl.hostname)
      && originUrl.port === hostUrl.port;
  } catch {
    return false;
  }
}

/**
 * Host & Origin fence for `/oh-story/game-preview/<signed-token>/<path...>` GET/HEAD
 * requests. Requires a trusted Host (blocking DNS rebinding) and permits:
 * - same-origin / loopback-alias preview navigations, AND
 * - opaque-origin (`Origin: null` or absent `Origin` with `Sec-Fetch-Site: cross-site`)
 *   static subresources requested by a non-isolated sandboxed iframe whose URL already
 *   carries a server-signed capability token.
 * Rejects third-party non-null origins (`Origin: https://evil.example`).
 */
export function isTrustedPreviewAssetRequest(
  request: WorkspaceTrustRequest,
  trustedHosts: readonly string[],
  bindHost?: string,
  protocol: "http:" | "https:" = "http:"
): boolean {
  if (isTrustedPreviewNavigation(request, trustedHosts, bindHost, protocol)) return true;
  const resolved = trustedHostUrl(request, trustedHosts, bindHost, protocol);
  if (resolved === undefined) return false;
  const origin = header(request.headers, "origin");
  if (origin === undefined || origin === "null") return true;
  if (isSameAuthorityOrigin(origin, resolved.authority)) return true;
  // Allow loopback alias origin (127.0.0.1 ↔ localhost on the same port/scheme).
  try {
    const originUrl = new URL(origin);
    if (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") return false;
    const hostUrl = parseAuthority(resolved.authority, originUrl.protocol);
    return hostUrl !== undefined
      && isLoopbackHostname(hostUrl.hostname)
      && isLoopbackHostname(originUrl.hostname)
      && originUrl.port === hostUrl.port;
  } catch {
    return false;
  }
}
