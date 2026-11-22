import { describe, expect, it } from "vitest";
import {
  assertTrustedWorkspaceAuthority,
  isBoundPreviewAssetRequest,
  isTrustedPreviewAssetRequest,
  isTrustedPreviewNavigation,
  isTrustedWorkspaceRequest,
  normalizePreviewAuthority
} from "../src/workspace-request-trust.js";

function request(headers: Record<string, string | undefined>) {
  return { headers };
}

describe("workspace browser trust", () => {
  it("accepts loopback and explicitly trusted same-origin authorities", () => {
    expect(isTrustedWorkspaceRequest(request({ host: "127.0.0.1:3080" }), [])).toBe(true);
    expect(isTrustedWorkspaceRequest(request({
      host: "studio.internal:3080",
      origin: "http://studio.internal:3080",
      "sec-fetch-site": "same-origin"
    }), ["studio.internal:3080"])).toBe(true);
  });

  it("rejects DNS-rebinding, cross-site and opaque-origin requests", () => {
    expect(isTrustedWorkspaceRequest(request({ host: "evil.example:3080" }), [])).toBe(false);
    expect(isTrustedWorkspaceRequest(request({
      host: "localhost:3080",
      origin: "http://evil.example"
    }), [])).toBe(false);
    expect(isTrustedWorkspaceRequest(request({
      host: "localhost:3080",
      "sec-fetch-site": "cross-site"
    }), [])).toBe(false);
    expect(isTrustedWorkspaceRequest(request({ host: "localhost:3080", origin: "null" }), [])).toBe(false);
  });

  it("validates configured authorities without widening malformed entries", () => {
    expect(() => { assertTrustedWorkspaceAuthority("studio.internal:3080"); }).not.toThrow();
    for (const entry of ["studio.internal/path", "user@studio.internal", " studio.internal", "studio.internal:"]) {
      expect(() => { assertTrustedWorkspaceAuthority(entry); }).toThrow(/bare host\[:port\] authority/u);
    }
  });

  it("allows only loopback cross-origin preview navigations, not opaque subresource reads", () => {
    expect(isTrustedPreviewNavigation(request({
      host: "localhost:3080",
      "sec-fetch-site": "cross-site",
      "sec-fetch-mode": "navigate",
      "sec-fetch-dest": "iframe"
    }), [])).toBe(true);
    expect(isTrustedPreviewNavigation(request({
      host: "localhost:3080",
      origin: "null",
      "sec-fetch-site": "cross-site",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "script"
    }), [])).toBe(false);
    expect(isTrustedPreviewNavigation(request({
      host: "evil.example:3080",
      "sec-fetch-site": "cross-site",
      "sec-fetch-mode": "navigate",
      "sec-fetch-dest": "iframe"
    }), [])).toBe(false);
  });

  it("matches DSH bindHost, HTTPS default-port normalization, and http(s) origin scheme rules", () => {
    expect(isTrustedWorkspaceRequest(request({
      host: "192.168.1.20:3080",
      origin: "http://192.168.1.20:3080"
    }), [], "192.168.1.20", "http:")).toBe(true);
    expect(isTrustedWorkspaceRequest(request({
      host: "studio.internal:443",
      origin: "https://studio.internal"
    }), ["studio.internal"], undefined, "https:")).toBe(true);
    expect(isTrustedWorkspaceRequest(request({
      host: "127.0.0.1:3080",
      origin: "ftp://127.0.0.1:3080"
    }), [])).toBe(false);
  });

  it("permits opaque-origin signed-token preview subresources while rejecting external origins and DNS rebinding", () => {
    expect(isTrustedPreviewAssetRequest(request({
      host: "[::1]:3080",
      origin: "null",
      "sec-fetch-site": "cross-site",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "script"
    }), [])).toBe(true);
    expect(isTrustedPreviewAssetRequest(request({
      host: "127.0.0.1:3080",
      origin: "https://localhost:3080",
      "sec-fetch-site": "cross-site"
    }), [])).toBe(true);
    expect(isTrustedPreviewAssetRequest(request({
      host: "localhost:3080",
      origin: "https://evil.example",
      "sec-fetch-site": "cross-site"
    }), [])).toBe(false);
    expect(isTrustedPreviewAssetRequest(request({
      host: "evil.example:3080",
      origin: "null",
      "sec-fetch-site": "cross-site"
    }), [])).toBe(false);
  });

  it("authorizes Host-bound preview tokens for remote authorities and loopback aliases while rejecting rebinding and third-party origins", () => {
    expect(normalizePreviewAuthority("Studio.Example.COM:8443")).toBe("studio.example.com:8443");
    expect(normalizePreviewAuthority("127.0.0.1:3080")).toBe("127.0.0.1:3080");
    expect(isBoundPreviewAssetRequest(request({
      host: "studio.example.com",
      origin: "https://studio.example.com"
    }), "studio.example.com")).toBe(true);
    expect(isBoundPreviewAssetRequest(request({
      host: "studio.example.com",
      origin: "null",
      "sec-fetch-site": "cross-site"
    }), "studio.example.com")).toBe(true);
    // Loopback alias swap (127.0.0.1 ↔ localhost ↔ [::1]) on the same port stays allowed.
    expect(isBoundPreviewAssetRequest(request({
      host: "localhost:3080",
      origin: "null"
    }), "127.0.0.1:3080")).toBe(true);
    expect(isBoundPreviewAssetRequest(request({
      host: "[::1]:3080",
      origin: "http://127.0.0.1:3080"
    }), "127.0.0.1:3080")).toBe(true);
    // Port mismatch, DNS rebinding, and third-party origins are rejected.
    expect(isBoundPreviewAssetRequest(request({ host: "localhost:9999" }), "127.0.0.1:3080")).toBe(false);
    expect(isBoundPreviewAssetRequest(request({ host: "evil.example", origin: "null" }), "studio.example.com")).toBe(false);
    expect(isBoundPreviewAssetRequest(request({
      host: "studio.example.com",
      origin: "https://evil.example"
    }), "studio.example.com")).toBe(false);
  });

  it("rejects non-bare authorities and CSP/header-injection payloads in Host headers", () => {
    const payloads = [
      "127.0.0.1:3080/;script-src *",
      "127.0.0.1:3080;script-src 'unsafe-eval'",
      "127.0.0.1:3080/path",
      "127.0.0.1:3080?x=1",
      "127.0.0.1:3080#frag",
      "user:pass@127.0.0.1:3080",
      "@127.0.0.1:3080",
      "127.0.0.1:3080\r\nX-Injected: 1",
      "127.0.0.1:3080,evil.example"
    ];
    for (const host of payloads) {
      expect(normalizePreviewAuthority(host), host).toBeUndefined();
      expect(isTrustedWorkspaceRequest(request({ host }), []), host).toBe(false);
      expect(isBoundPreviewAssetRequest(request({ host }), "127.0.0.1:3080"), host).toBe(false);
      expect(isTrustedPreviewAssetRequest(request({ host, origin: "null" }), []), host).toBe(false);
      expect(() => { assertTrustedWorkspaceAuthority(host); }, host).toThrow(/bare host\[:port\] authority/u);
    }
  });
});
