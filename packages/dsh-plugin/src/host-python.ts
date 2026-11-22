import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface PythonProbe { readonly ok: boolean; readonly version?: string | undefined; readonly minimum: string }

/** A Python version floor as `[major, minor]`. */
export type PythonFloor = readonly [major: number, minor: number];
/** Every bundled Drama script declares `MINIMUM_PYTHON = (3, 9)`. */
export const DRAMA_PYTHON: PythonFloor = [3, 9];
/** video-recap-skills documents Python 3.10 or newer. */
export const VIDEO_PYTHON: PythonFloor = [3, 10];

export async function commandOutput(command: string, args: readonly string[]): Promise<string | undefined> {
  try {
    const { stdout, stderr } = await execFileAsync(command, [...args], { encoding: "utf8", timeout: 5_000, maxBuffer: 4 * 1_024 * 1_024 });
    return `${stdout}${stderr}`.trim();
  } catch { return undefined; }
}

/** Each upstream Skill set has its own floor, so the caller names the one it runs. */
export function pythonVersion(value: string | undefined, floor: PythonFloor): PythonProbe {
  const minimum = `${String(floor[0])}.${String(floor[1])}`;
  const match = /Python\s+(\d+)\.(\d+)(?:\.(\d+))?/u.exec(value ?? "");
  if (match === null) return { ok: false, minimum };
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return { ok: major > floor[0] || (major === floor[0] && minor >= floor[1]), version: match[0].replace(/^Python\s+/u, ""), minimum };
}

/**
 * The interpreter the host will run upstream scripts with. The first command
 * that meets the version floor wins; an interpreter that answers but is too old
 * is reported only when nothing better exists, so `python3` at 3.9 does not hide
 * `python` at 3.12. The command is written into the adapter config's argv, so
 * this is the same choice everywhere the plugin starts Python.
 */
export async function hostPython(
  floor: PythonFloor,
  probe: (command: string, args: readonly string[]) => Promise<string | undefined> = commandOutput,
  platform: NodeJS.Platform = process.platform
): Promise<{ readonly command: string; readonly probe: PythonProbe }> {
  const candidates: readonly { readonly command: string; readonly args: readonly string[] }[] = platform === "win32"
    ? [
        { command: "python3", args: [] },
        { command: "python", args: [] },
        { command: "py", args: ["-3"] }
      ]
    : [
        { command: "python3", args: [] },
        { command: "python", args: [] }
      ];
  let fallback: { readonly command: string; readonly probe: PythonProbe } | undefined;
  for (const candidate of candidates) {
    const parsed = pythonVersion(await probe(candidate.command, [...candidate.args, "--version"]), floor);
    if (parsed.ok) return { command: candidate.command, probe: parsed };
    if (parsed.version !== undefined) fallback ??= { command: candidate.command, probe: parsed };
  }
  return fallback ?? { command: "python3", probe: { ok: false, minimum: pythonVersion(undefined, floor).minimum } };
}
