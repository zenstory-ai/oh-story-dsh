import { readdir, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { defineTool, type ToolDefinition, type ToolGuard, type ToolRuntime } from "@deepseek-ai/dsh-tools";
import { defaultBundledSkillRoot } from "./skill-provider.js";

export const OH_STORY_REFERENCE_TOOL_NAME = "oh_story_bundled_reference";

interface BundledReference {
  readonly canonicalPath: string;
  readonly name: string;
}

async function collectMarkdown(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry): Promise<string[]> => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectMarkdown(root, path);
    return entry.isFile() && entry.name.endsWith(".md") ? [path] : [];
  }));
  return nested.flat();
}

async function bundledReferences(storySetupRoot: string): Promise<readonly BundledReference[]> {
  const root = await realpath(resolve(storySetupRoot));
  const referenceRoot = await realpath(join(root, "references", "agent-references"));
  const referenceDirectory = relative(root, referenceRoot);
  if (referenceDirectory === "" || referenceDirectory.startsWith("..") || isAbsolute(referenceDirectory)) {
    throw new Error("Bundled Oh Story reference directory escaped its package root.");
  }
  const values = await Promise.all((await collectMarkdown(referenceRoot)).map(async (path): Promise<BundledReference> => {
    const canonicalPath = await realpath(path);
    const inside = relative(referenceRoot, canonicalPath);
    if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) {
      throw new Error(`Bundled Oh Story reference escaped its package root: ${path}`);
    }
    return {
      canonicalPath,
      name: `story-setup/references/agent-references/${inside.replaceAll("\\", "/")}`
    };
  }));
  return values.sort((left, right) => left.name.localeCompare(right.name));
}

export async function createOhStoryReferenceTool(
  storySetupRoot = join(defaultBundledSkillRoot(), "story-setup")
): Promise<ToolDefinition> {
  const references = await bundledReferences(storySetupRoot);
  if (references.length === 0) throw new Error("No bundled Oh Story references were found.");
  const paths = references.map((reference) => reference.name);
  const byName = new Map(references.map((reference) => [reference.name, reference.canonicalPath]));
  return defineTool({
    name: OH_STORY_REFERENCE_TOOL_NAME,
    description: "Read one exact, pinned Oh Story story-setup reference bundled with this plugin. This does not resolve project Skills or workspace files.",
    parameters: {
      reference: {
        type: "string",
        required: true,
        enum: paths,
        description: "The exact story-setup reference path named by the active bundled Role."
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          reference: { type: "string", required: true },
          content: { type: "string", required: true }
        }
      },
      render: (_args, value) => [{
        type: "text",
        text: `Bundled Oh Story reference: ${value.reference}\n\n${value.content}`
      }]
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      const path = byName.get(args.reference);
      if (path === undefined) throw new Error(`Oh Story reference is not bundled: ${args.reference}`);
      return { reference: args.reference, content: await readFile(path, "utf8") };
    }
  });
}

/** Deny a scoped same-name replacement instead of executing untrusted reference code. */
export function bundledReferenceGuard(
  definition: ToolDefinition,
  tools: Pick<ToolRuntime, "get">
): ToolGuard {
  return (execution) => execution.name === OH_STORY_REFERENCE_TOOL_NAME
    && tools.get(OH_STORY_REFERENCE_TOOL_NAME, execution.agent) !== definition
    ? "The pinned Oh Story reference tool was shadowed in this Agent scope."
    : undefined;
}
