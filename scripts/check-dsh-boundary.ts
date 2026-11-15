import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const violations: string[] = [];
let scannedOutsidePlugin = 0;

async function walk(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (['dist', 'lib', 'node_modules', 'vendor'].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) { await walk(path); continue; }
    if (!entry.isFile() || !/\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/u.test(entry.name)) continue;
    const projectPath = relative(root, path).replaceAll('\\', '/');
    if (projectPath.startsWith('packages/dsh-plugin/')) continue;
    scannedOutsidePlugin += 1;
    const source = await readFile(path, 'utf8');
    if (/\b(?:from\s+|import\s*\()['"]@deepseek-ai\//u.test(source)) violations.push(projectPath);
  }
}

await walk(resolve(root, 'packages'));
await walk(resolve(root, 'scripts'));
if (scannedOutsidePlugin === 0) throw new Error('DSH boundary check scanned zero files outside packages/dsh-plugin/.');
if (violations.length > 0) throw new Error(`DeepSeek Harness imports escaped the native plugin boundary: ${violations.join(', ')}`);
process.stdout.write(`DSH boundary OK: scanned ${String(scannedOutsidePlugin)} non-plugin files; all @deepseek-ai imports stay in @oh-story/dsh.\n`);
