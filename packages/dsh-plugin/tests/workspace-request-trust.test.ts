import { describe, expect, it } from "vitest";
import {
  assertTrustedWorkspaceAuthority,
  isTrustedPreviewAssetRequest,
  isTrustedPreviewNavigation,
  isTrustedWorkspaceRequest
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
});
