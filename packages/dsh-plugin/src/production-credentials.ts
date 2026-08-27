/**
 * Readiness of the upstream production adapters' credentials.
 *
 * The pinned Drama Skills adapters read their credentials from the process
 * environment (`provider_adapters.py`), and they only do so inside `run` —
 * after `production_tool.py` has already consumed the creator's confirmation.
 * A missing key therefore costs the creator a confirmation round-trip before
 * anything explains why. This module reports readiness up front.
 *
 * Only whether a variable is set is ever reported. Values never leave the host.
 */

export type ProductionCredentialState = "ready" | "missing";

export interface ProductionAdapterReadiness {
  /** Adapter id as named in the upstream provider references. */
  readonly adapter: string;
  /** Which production job kinds this adapter serves. */
  readonly jobKinds: readonly ("image" | "video" | "music")[];
  readonly credentialVariable: string;
  readonly baseUrlVariable: string;
  /** Upstream default, used when the base URL variable is unset. */
  readonly defaultBaseUrl: string;
  readonly credential: ProductionCredentialState;
  /** Present only when the operator overrode the default; never a secret. */
  readonly baseUrl?: string | undefined;
}

interface AdapterDefinition {
  readonly adapter: string;
  readonly jobKinds: readonly ("image" | "video" | "music")[];
  readonly credentialVariable: string;
  readonly baseUrlVariable: string;
  readonly defaultBaseUrl: string;
}

/** Mirrors provider_adapters.py; keep in step when upstream adds an adapter. */
export const PRODUCTION_ADAPTERS: readonly AdapterDefinition[] = [
  { adapter: "gpt-image-2", jobKinds: ["image"], credentialVariable: "OPENAI_API_KEY", baseUrlVariable: "OPENAI_BASE_URL", defaultBaseUrl: "https://api.openai.com/v1" },
  { adapter: "seedance", jobKinds: ["video"], credentialVariable: "ARK_API_KEY", baseUrlVariable: "SEEDANCE_BASE_URL", defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3" },
  { adapter: "minimax-music", jobKinds: ["music"], credentialVariable: "MINIMAX_API_KEY", baseUrlVariable: "MINIMAX_BASE_URL", defaultBaseUrl: "https://api.minimax.io/v1" }
];

/**
 * `_base_url` in provider_adapters.py rejects anything that is not https, and
 * anything carrying inline credentials, so an override that cannot work is
 * worth reporting as unusable rather than echoing back as configured.
 */
export function usableBaseUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed === "") return undefined;
  let parsed: URL;
  try { parsed = new URL(trimmed); }
  catch { return undefined; }
  if (parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "") return undefined;
  return trimmed.replace(/\/+$/u, "");
}

export function productionReadiness(env: Readonly<Record<string, string | undefined>>): ProductionAdapterReadiness[] {
  return PRODUCTION_ADAPTERS.map((definition) => {
    const baseUrl = usableBaseUrl(env[definition.baseUrlVariable]);
    return {
      adapter: definition.adapter,
      jobKinds: definition.jobKinds,
      credentialVariable: definition.credentialVariable,
      baseUrlVariable: definition.baseUrlVariable,
      defaultBaseUrl: definition.defaultBaseUrl,
      credential: (env[definition.credentialVariable]?.trim() ?? "") === "" ? "missing" : "ready",
      baseUrl
    };
  });
}
