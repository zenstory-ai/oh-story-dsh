import { describe, expect, it } from "vitest";
import { gameRoot, previewContentSecurityPolicy } from "../src/workspace-route.js";

const assets = "http://127.0.0.1:4000/oh-story/game-preview/example/jin-ping-mei/";

describe("game preview security boundary", () => {
  it("confines every preview response, not only HTML documents", () => {
    const policy = previewContentSecurityPolicy(assets);
    // A scripted .svg is an active document; without a per-response policy it would inherit the
    // iframe's script permission while losing every restriction the HTML document carries.
    expect(policy).toContain("sandbox allow-scripts");
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain(`connect-src ${assets}`);
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");
  });

  it("confines the workspace API to the preview asset prefix", () => {
    const connect = previewContentSecurityPolicy(assets).split("; ").find((part) => part.startsWith("connect-src "));
    expect(connect).toBe(`connect-src ${assets}`);
    expect(connect).not.toContain("/oh-story/workspace");
    expect(connect).not.toContain("/oh-story/file");
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
