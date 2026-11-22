import { describe, expect, it } from "vitest";
import {
  createPreviewTokenSecret,
  gameRoot,
  injectGamePreviewErrorBridge,
  mintPreviewToken,
  previewContentSecurityPolicy,
  previewContentType,
  verifyPreviewToken
} from "../src/workspace-route.js";

const assets = "http://127.0.0.1:4000/oh-story/game-preview/ https://127.0.0.1:4000/oh-story/game-preview/";

describe("game preview security boundary", () => {
  it("confines every preview response, not only HTML documents, and allows https loopback ancestors", () => {
    const policy = previewContentSecurityPolicy(assets);
    // A scripted .svg is an active document; without a per-response policy it would inherit the
    // iframe's script permission while losing every restriction the HTML document carries.
    expect(policy).toContain("sandbox allow-scripts");
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain(`connect-src ${assets}`);
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain(
      "frame-ancestors 'self' http://127.0.0.1:* http://localhost:* https://127.0.0.1:* https://localhost:* http://[::1]:* https://[::1]:*"
    );
  });

  it("confines the workspace API to the preview asset prefix", () => {
    const connect = previewContentSecurityPolicy(assets).split("; ").find((part) => part.startsWith("connect-src "));
    expect(connect).toBe(`connect-src ${assets}`);
    expect(connect).not.toContain("/oh-story/workspace");
    expect(connect).not.toContain("/oh-story/file");
  });

  it("maps audio, video, 3D model and font game preview assets to accurate MIME types", () => {
    expect(previewContentType("sfx/click.wav")).toBe("audio/wav");
    expect(previewContentType("voice/line.m4a")).toBe("audio/mp4");
    expect(previewContentType("voice/line.aac")).toBe("audio/aac");
    expect(previewContentType("cutscene/intro.mp4")).toBe("video/mp4");
    expect(previewContentType("cutscene/loop.webm")).toBe("video/webm");
    expect(previewContentType("models/hero.glb")).toBe("model/gltf-binary");
    expect(previewContentType("models/scene.gltf")).toBe("model/gltf+json");
    expect(previewContentType("fonts/ui.ttf")).toBe("font/ttf");
    expect(previewContentType("fonts/title.otf")).toBe("font/otf");
  });

  it("injects a read-only runtime error bridge immediately after opening <head> without duplicating it", () => {
    const html = "<!doctype html><html><head data-app=\"v1\"><script type=\"module\" src=\"./main.js\"></script><link rel=\"stylesheet\" href=\"./app.css\"></head><body><h1>Play</h1></body></html>";
    const injected = injectGamePreviewErrorBridge(html);
    expect(injected).toContain("oh-story:game-preview-error");
    expect(injected).toContain("unhandledrejection");
    const openHeadEnd = injected.indexOf("<head data-app=\"v1\">") + "<head data-app=\"v1\">".length;
    const bridgePos = injected.indexOf("oh-story:game-preview-error");
    const moduleScriptPos = injected.indexOf("<script type=\"module\"");
    expect(bridgePos).toBeGreaterThan(openHeadEnd);
    expect(bridgePos).toBeLessThan(moduleScriptPos);
    expect(bridgePos).toBeLessThan(injected.indexOf("</head>"));
    expect(injectGamePreviewErrorBridge(injected)).toBe(injected);

    // Fallback when <head> is omitted: right after <!doctype ...> or start of HTML.
    const noHead = "<!doctype html><body><script src=\"./a.js\"></script></body>";
    const injectedNoHead = injectGamePreviewErrorBridge(noHead);
    expect(injectedNoHead.indexOf("oh-story:game-preview-error")).toBeGreaterThan(injectedNoHead.indexOf("<!doctype html>"));
    expect(injectedNoHead.indexOf("oh-story:game-preview-error")).toBeLessThan(injectedNoHead.indexOf("<body>"));
  });
});

describe("game project root validation", () => {
  it("accepts real creator project names rather than a slug allowlist", () => {
    for (const name of ["ledger", "金瓶梅 · 风月总账", "_draft", "my.game-2"]) {
      expect(gameRoot(`game-adaptations/${name}`)).toBe(true);
    }
  });

  it("still rejects traversal, nesting and hidden entries", () => {
    for (const path of [
      "game-adaptations/..",
      "game-adaptations/.",
      "game-adaptations/.hidden",
      "game-adaptations/nested/deeper",
      "game-adaptations/",
      "正文/ledger",
      `game-adaptations/${"x".repeat(129)}`
    ]) {
      expect(gameRoot(path)).toBe(false);
    }
  });
});

describe("signed game preview capability token", () => {
  it("mints and verifies HMAC-SHA256 tokens stably within a bucket and rejects tampering, wrong keys and expiry", () => {
    const secret = createPreviewTokenSecret();
    const otherSecret = createPreviewTokenSecret();
    const now = 1_700_000_000_000;
    const tokenA = mintPreviewToken(secret, { sessionId: "session-1", root: "game-adaptations/金瓶梅 · 风月总账", host: "Studio.Example.COM:8443" }, now);
    const tokenB = mintPreviewToken(secret, { sessionId: "session-1", root: "game-adaptations/金瓶梅 · 风月总账", host: "studio.example.com:8443" }, now + 4_000);
    // Stable across periodic 4s workspace polls and long play sessions (12h bucket, 12–24h TTL).
    expect(tokenA).toBe(tokenB);

    const verified = verifyPreviewToken(tokenA, secret, now);
    expect(verified.sessionId).toBe("session-1");
    expect(verified.root).toBe("game-adaptations/金瓶梅 · 风月总账");
    expect(verified.host).toBe("studio.example.com:8443");
    expect(verified.exp - Math.floor(now / 1_000)).toBeGreaterThanOrEqual(12 * 3_600);
    expect(verified.exp - Math.floor(now / 1_000)).toBeLessThanOrEqual(24 * 3_600);

    expect(() => verifyPreviewToken(tokenA, otherSecret, now)).toThrow();
    expect(() => verifyPreviewToken(`${tokenA}x`, secret, now)).toThrow();
    expect(() => verifyPreviewToken("unsigned-token", secret, now)).toThrow();

    const expired = mintPreviewToken(secret, { sessionId: "session-1", root: "game-adaptations/demo", exp: Math.floor(now / 1_000) - 1 }, now);
    expect(() => verifyPreviewToken(expired, secret, now)).toThrow("已过期");
  });
});
