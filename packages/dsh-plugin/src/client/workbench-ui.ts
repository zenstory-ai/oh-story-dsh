import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/** Roving-focus keyboard contract shared by every workbench tablist. */
export function handleTabKey<T extends string>(
  event: ReactKeyboardEvent<HTMLButtonElement>,
  values: readonly T[],
  current: T,
  select: (value: T) => void
): void {
  const currentIndex = values.indexOf(current);
  if (currentIndex < 0) return;
  let index: number | undefined;
  if (event.key === "Home") index = 0;
  else if (event.key === "End") index = values.length - 1;
  else if (event.key === "ArrowRight") index = (currentIndex + 1) % values.length;
  else if (event.key === "ArrowLeft") index = (currentIndex - 1 + values.length) % values.length;
  if (index === undefined) return;
  event.preventDefault();
  const value = values[index];
  if (value === undefined) return;
  select(value);
  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role='tab']")[index]?.focus();
}

export type OhStoryApiPrefix = "api/oh-story" | "oh-story";

/**
 * Detect whether the active DSH host mounts Oh Story endpoints under `api/oh-story` (DSH 0.2.2+
 * `connection.fetch.register`) or legacy `oh-story` (DSH 0.2.0-rc.2 `webServer.register`),
 * reading the injected `#oh-story-workbench-css` link element and defaulting to `api/oh-story`.
 */
export function detectOhStoryApiPrefix(): OhStoryApiPrefix {
  if (typeof document !== "object" || document === null || typeof document.getElementById !== "function") {
    return "api/oh-story";
  }
  const link = document.getElementById("oh-story-workbench-css");
  if (link === null || typeof link.getAttribute !== "function") return "api/oh-story";
  const explicit = link.getAttribute("data-oh-story-api-prefix");
  if (explicit === "oh-story" || explicit === "api/oh-story") return explicit;
  const href = link.getAttribute("href");
  if (typeof href === "string" && href !== "") {
    if (/(?:^|\/)api\/oh-story\/workbench\.css(?:[?#]|$)/u.test(href)) return "api/oh-story";
    if (/(?:^|\/)oh-story\/workbench\.css(?:[?#]|$)/u.test(href)) return "oh-story";
  }
  return "api/oh-story";
}

/**
 * Resolve an Oh Story endpoint relative to `document.baseURI` when running on HTTP(S)
 * so DSH `connection.fetch.register` (`api/oh-story/*`) and legacy `webServer` (`oh-story/*`)
 * routes work across mount-prefix proxies, Electron IPC, and Web Workers, falling back cleanly
 * to a root-relative path in non-HTTP / jsdom environments.
 */
export function ohStoryEndpointUrl(path: string): string {
  const prefix = detectOhStoryApiPrefix();
  const relative = `${prefix}/${path.replace(/^\/+/u, "")}`;
  const baseUri = typeof document === "object" && document !== null && typeof document.baseURI === "string"
    ? document.baseURI
    : undefined;
  if (baseUri !== undefined) {
    try {
      const parsedBase = new URL(baseUri);
      if (parsedBase.protocol === "http:" || parsedBase.protocol === "https:") {
        return new URL(relative, parsedBase).toString();
      }
    } catch {
      // Fall back below when document.baseURI is unavailable or non-HTTP.
    }
  }
  const origin = typeof globalThis.location === "object" && globalThis.location !== null && typeof globalThis.location.origin === "string"
    ? globalThis.location.origin
    : undefined;
  if (origin !== undefined && origin !== "null") {
    try {
      const parsedOrigin = new URL(origin);
      if (parsedOrigin.protocol === "http:" || parsedOrigin.protocol === "https:") {
        return new URL(`/${relative}`, parsedOrigin).toString();
      }
    } catch {
      // Fall back to root-relative path string below.
    }
  }
  return `/${relative}`;
}

export function endpoint(path: string, sessionId: string, file?: string, version?: string): string {
  const base = ohStoryEndpointUrl(path);
  const params = new URLSearchParams();
  params.set("sessionId", sessionId);
  if (file !== undefined) params.set("path", file);
  if (version !== undefined && version !== "") params.set("version", version);
  const query = params.toString();
  return query === "" ? base : `${base}${base.includes("?") ? "&" : "?"}${query}`;
}
