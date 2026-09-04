import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface PythonProbe { readonly ok: boolean; readonly version?: string | undefined }

export async function commandOutput(command: string, args: readonly string[]): Promise<string | undefined> {
  try {
    const { stdout, stderr } = await execFileAsync(command, [...args], { encoding: "utf8", timeout: 5_000, maxBuffer: 4 * 1_024 * 1_024 });
    return `${stdout}${stderr}`.trim();
  } catch { return undefined; }
}

/** Upstream Skills require Python 3.10+. */
export function pythonVersion(value: string | undefined): PythonProbe {
  const match = /Python\s+(\d+)\.(\d+)(?:\.(\d+))?/u.exec(value ?? "");
  if (match === null) return { ok: false };
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return { ok: major > 3 || (major === 3 && minor >= 10), version: match[0].replace(/^Python\s+/u, "") };
}

/**
 * The interpreter the host will run upstream scripts with. The first command
 * that meets the version floor wins; an interpreter that answers but is too old
 * is reported only when nothing better exists, so `python3` at 3.9 does not hide
 * `python` at 3.12. The command is written into the adapter config's argv, so
 * this is the same choice everywhere the plugin starts Python.
 */
export async function hostPython(probe: (command: string, args: readonly string[]) => Promise<string | undefined> = commandOutput): Promise<{ readonly command: string; readonly probe: PythonProbe }> {
  let fallback: { readonly command: string; readonly probe: PythonProbe } | undefined;
  for (const command of ["python3", "python"]) {
    const parsed = pythonVersion(await probe(command, ["--version"]));
    if (parsed.ok) return { command, probe: parsed };
    if (parsed.version !== undefined) fallback ??= { command, probe: parsed };
  }
  return fallback ?? { command: "python3", probe: { ok: false } };
}
