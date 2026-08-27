import { describe, expect, it } from "vitest";
import { withStorageShim } from "../src/workspace-route.js";

const decode = (bytes: Uint8Array): string => Buffer.from(bytes).toString("utf8");

describe("preview storage shim", () => {
  it("installs the fallback immediately after <head> so it runs before any module", () => {
    const html = "<!doctype html><html><head><meta charset=\"utf-8\"><script type=\"module\" src=\"js/main.js\"></script></head><body></body></html>";
    const shimmed = decode(withStorageShim(Buffer.from(html, "utf8")));
    expect(shimmed.indexOf("localStorage")).toBeLessThan(shimmed.indexOf("js/main.js"));
    expect(shimmed).toContain("<head>");
    expect(shimmed).toContain("</html>");
  });

  it("handles a head tag with attributes and a document with no head at all", () => {
    expect(decode(withStorageShim(Buffer.from("<html><head lang=\"zh\"><title>x</title></head></html>", "utf8"))))
      .toMatch(/<head lang="zh"><script>/u);
    const headless = decode(withStorageShim(Buffer.from("<div>bare fragment</div>", "utf8")));
    expect(headless.startsWith("<script>")).toBe(true);
    expect(headless).toContain("bare fragment");
  });

  it("preserves the original document byte-for-byte apart from the inserted shim", () => {
    const html = "<html><head></head><body>金瓶梅 · 风月总账</body></html>";
    const shimmed = decode(withStorageShim(Buffer.from(html, "utf8")));
    const shim = shimmed.slice(shimmed.indexOf("<script>"), shimmed.indexOf("</script>") + "</script>".length);
    expect(shimmed.replace(shim, "")).toBe(html);
    expect(shimmed).toContain("金瓶梅 · 风月总账");
  });

  it("provides a working in-memory store when the real one throws", () => {
    const shimmed = decode(withStorageShim(Buffer.from("<html><head></head></html>", "utf8")));
    const body = shimmed.slice(shimmed.indexOf("<script>") + "<script>".length, shimmed.indexOf("</script>"));
    // Stand in for a sandboxed document: every storage access throws.
    const denied = { get localStorage(): never { throw new Error("SecurityError"); }, get sessionStorage(): never { throw new Error("SecurityError"); } };
    const window: Record<string, unknown> = Object.create(denied);
    new Function("window", body)(window);

    const store = window.localStorage as Storage;
    expect(store.getItem("missing")).toBeNull();
    store.setItem("jpm_mute", "1");
    expect(store.getItem("jpm_mute")).toBe("1");
    expect(store.length).toBe(1);
    store.removeItem("jpm_mute");
    expect(store.getItem("jpm_mute")).toBeNull();
    expect(window.sessionStorage).toBeDefined();
  });
});
