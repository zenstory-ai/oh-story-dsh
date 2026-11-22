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

/**
 * Resolve an `api/oh-story/*` endpoint relative to `document.baseURI` when running on HTTP(S)
 * so DSH `connection.fetch.register` routes work across mount-prefix proxies, Electron IPC,
 * and Web Workers, falling back cleanly to `/api/oh-story/*` in non-HTTP / jsdom environments.
 */
export function ohStoryEndpointUrl(path: string): string {
  const relative = `api/oh-story/${path.replace(/^\/+/u, "")}`;
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
