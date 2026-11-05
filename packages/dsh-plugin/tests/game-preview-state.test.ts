import { describe, expect, it } from "vitest";
import { gamePreviewStatus, previewUrls, type GamePreviewObservation } from "../src/client/game-preview-state.js";
import { gameProjectTitle } from "../src/workspace-route.js";

const settled: GamePreviewObservation = { frameLoaded: true, frameError: false, probe: "ok", building: false, pending: false, isolated: true };

describe("game preview status", () => {
  it("reports a loaded build as ready", () => {
    expect(gamePreviewStatus(settled)).toEqual({ tone: "ready", label: "预览已载入" });
    expect(gamePreviewStatus({ ...settled, isolated: false }).label).toContain("存档功能不可用");
  });

  it("reports a failed probe for the build on screen as an error", () => {
    expect(gamePreviewStatus({ ...settled, probe: "failed" }).tone).toBe("error");
    expect(gamePreviewStatus({ ...settled, frameLoaded: false, frameError: true }).tone).toBe("error");
  });

  it("does not let an iframe load hide a failure the probe saw", () => {
    expect(gamePreviewStatus({ ...settled, frameLoaded: true, probe: "failed" }).tone).toBe("error");
  });

  // Audit 2026-10-19 #15: the red dot sat beside a working game while a newer build waited.
  it("shows a waiting new version, not a failure, once a newer build replaced the one that failed", () => {
    expect(gamePreviewStatus({ ...settled, probe: "failed", pending: true })).toEqual({ tone: "loading", label: "新版本已就绪 · 由你决定何时载入" });
    expect(gamePreviewStatus({ ...settled, pending: true })).toEqual({ tone: "ready", label: "新版本已就绪 · 由你决定何时载入" });
  });

  it("shows the Agent's rewrite in progress instead of a failure caused by it", () => {
    expect(gamePreviewStatus({ ...settled, probe: "failed", building: true }).tone).toBe("building");
  });

  it("waits for the frame before claiming the build is loaded", () => {
    expect(gamePreviewStatus({ ...settled, frameLoaded: false, probe: "pending" })).toEqual({ tone: "loading", label: "正在载入预览…" });
  });
});

describe("game preview URLs", () => {
  it("frames the other loopback alias but probes the page's own origin, which the route trusts", () => {
    const urls = previewUrls("/oh-story/game-preview/workspace/s/p/index.html", "v1", 2, "http://127.0.0.1:3180");
    expect(urls.isolated).toBe(true);
    expect(new URL(urls.href).origin).toBe("http://localhost:3180");
    expect(new URL(urls.probeHref).origin).toBe("http://127.0.0.1:3180");
    expect(new URL(urls.href).search).toBe(new URL(urls.probeHref).search);
    expect(new URL(urls.href).searchParams.get("build")).toBe("v1");
  });

  it("is not isolated on a host without a loopback alias", () => {
    const urls = previewUrls("/oh-story/game-preview/workspace/s/p/index.html", "v1", 0, "https://dsh.example.test");
    expect(urls.isolated).toBe(false);
    expect(urls.href).toBe(urls.probeHref);
  });
});

describe("game project title", () => {
  it("drops the brief label, its separator and the work's 书名号", () => {
    // Audit 2026-10-19 #17: rendered as 「我的项目 · — 《雪夜渡》」 and 「《— 《雪夜渡》》」.
    expect(gameProjectTitle("# PRODUCT_BRIEF — 《雪夜渡》\n\n## 一句话", "xue-ye-du")).toBe("雪夜渡");
    expect(gameProjectTitle("# PRODUCT_BRIEF · 雪夜渡", "id")).toBe("雪夜渡");
    expect(gameProjectTitle("# Product Brief: Snow Ferry", "id")).toBe("Snow Ferry");
    expect(gameProjectTitle("# 《雪夜渡》", "id")).toBe("雪夜渡");
  });

  it("keeps 书名号 that do not wrap the whole name", () => {
    expect(gameProjectTitle("# 《雪夜渡》改编试玩", "id")).toBe("《雪夜渡》改编试玩");
  });

  it("falls back to the project directory", () => {
    expect(gameProjectTitle(undefined, "xue-ye-du")).toBe("xue-ye-du");
    expect(gameProjectTitle("# PRODUCT_BRIEF", "xue-ye-du")).toBe("xue-ye-du");
    expect(gameProjectTitle("正文没有标题", "xue-ye-du")).toBe("xue-ye-du");
  });
});
