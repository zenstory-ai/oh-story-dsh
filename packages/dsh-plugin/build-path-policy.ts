import { relative } from "node:path";

export function isLocalArtifactPath(assetRoot: string, source: string): boolean {
  const normalized = relative(assetRoot, source).replaceAll("\\", "/");
  return /(?:^|\/)__pycache__(?:\/|$)/u.test(normalized)
    || normalized.endsWith(".pyc")
    || /(?:^|\/)\.DS_Store$/u.test(normalized)
    || /(?:^|\/)\.om[cx](?:\/|$)/u.test(normalized);
}
