import { describe, expect, it } from "vitest";
import { PRODUCTION_ADAPTERS, productionReadiness, usableBaseUrl } from "../src/production-credentials.js";

describe("production adapter readiness", () => {
  it("covers exactly the adapters provider_adapters.py reads credentials for", () => {
    expect(PRODUCTION_ADAPTERS.map((adapter) => adapter.credentialVariable).sort())
      .toEqual(["ARK_API_KEY", "MINIMAX_API_KEY", "OPENAI_API_KEY"]);
  });

  it("reports a missing credential without ever exposing a configured one", () => {
    const readiness = productionReadiness({ OPENAI_API_KEY: "sk-live-secret", ARK_API_KEY: "   " });
    const byAdapter = new Map(readiness.map((entry) => [entry.adapter, entry]));

    expect(byAdapter.get("gpt-image-2")?.credential).toBe("ready");
    // Whitespace-only is not a usable credential.
    expect(byAdapter.get("seedance")?.credential).toBe("missing");
    expect(byAdapter.get("minimax-music")?.credential).toBe("missing");
    expect(JSON.stringify(readiness)).not.toContain("sk-live-secret");
  });

  it("reports an overridden base URL but only when the adapter would accept it", () => {
    const readiness = productionReadiness({
      OPENAI_BASE_URL: "https://gateway.internal/v1/",
      SEEDANCE_BASE_URL: "http://gateway.internal/v3",
      MINIMAX_BASE_URL: "https://user:pass@gateway.internal/v1"
    });
    const byAdapter = new Map(readiness.map((entry) => [entry.adapter, entry]));

    expect(byAdapter.get("gpt-image-2")?.baseUrl).toBe("https://gateway.internal/v1");
    // provider_adapters.py `_base_url` rejects both of these outright.
    expect(byAdapter.get("seedance")?.baseUrl).toBeUndefined();
    expect(byAdapter.get("minimax-music")?.baseUrl).toBeUndefined();
  });

  it("treats an unset or unparseable base URL as using the upstream default", () => {
    for (const value of [undefined, "", "   ", "not a url"]) expect(usableBaseUrl(value)).toBeUndefined();
    const readiness = productionReadiness({});
    expect(readiness.every((entry) => entry.baseUrl === undefined)).toBe(true);
    expect(readiness.map((entry) => entry.defaultBaseUrl)).toEqual([
      "https://api.openai.com/v1",
      "https://ark.cn-beijing.volces.com/api/v3",
      "https://api.minimax.io/v1"
    ]);
  });
});
