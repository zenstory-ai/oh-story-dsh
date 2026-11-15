import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function bundledKnowledgePath(metaUrl: string, knowledgeSubpath: string): string {
  const current = dirname(fileURLToPath(metaUrl));
  return basename(current) === "src"
    ? resolve(current, "../../knowledge", knowledgeSubpath)
    : resolve(current, knowledgeSubpath);
}
