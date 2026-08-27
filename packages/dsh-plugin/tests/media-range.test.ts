import { describe, expect, it } from "vitest";
import { resolveMediaRange } from "../src/workspace-route.js";

const SIZE = 1_000;

describe("workspace media byte ranges", () => {
  it("serves the whole file when no range is asked for", () => {
    expect(resolveMediaRange(undefined, SIZE)).toEqual({ kind: "full" });
  });

  it("reads a suffix range as the LAST N bytes, not the first", () => {
    // RFC 7233: `bytes=-500` on a 1000-byte file is bytes 500-999. Serving
    // 0-500 hands an MP4 demuxer leading mdat bytes labelled as the trailing
    // moov atom, and cache-control pins the wrong body.
    expect(resolveMediaRange("bytes=-500", SIZE)).toEqual({ kind: "partial", start: 500, end: 999 });
    expect(resolveMediaRange("bytes=-1", SIZE)).toEqual({ kind: "partial", start: 999, end: 999 });
  });

  it("clamps a suffix larger than the file to the whole file", () => {
    expect(resolveMediaRange("bytes=-4000", SIZE)).toEqual({ kind: "partial", start: 0, end: 999 });
  });

  it("resolves explicit and open-ended ranges and clamps the end to EOF", () => {
    expect(resolveMediaRange("bytes=0-99", SIZE)).toEqual({ kind: "partial", start: 0, end: 99 });
    expect(resolveMediaRange("bytes=500-", SIZE)).toEqual({ kind: "partial", start: 500, end: 999 });
    expect(resolveMediaRange("bytes=900-99999", SIZE)).toEqual({ kind: "partial", start: 900, end: 999 });
    expect(resolveMediaRange("  bytes=10-20  ", SIZE)).toEqual({ kind: "partial", start: 10, end: 20 });
  });

  it("reports 416 territory instead of silently answering 200 with the whole file", () => {
    expect(resolveMediaRange("bytes=1000-", SIZE)).toEqual({ kind: "unsatisfiable" });
    expect(resolveMediaRange("bytes=5000-6000", SIZE)).toEqual({ kind: "unsatisfiable" });
    expect(resolveMediaRange("bytes=-0", SIZE)).toEqual({ kind: "unsatisfiable" });
    expect(resolveMediaRange("bytes=0-", 0)).toEqual({ kind: "unsatisfiable" });
  });

  it("degrades malformed, multi-range and reversed headers to the full body", () => {
    for (const header of ["bytes=abc-def", "items=0-10", "bytes=0-10, 20-30", "bytes=-", "bytes=90-10", ""]) {
      expect(resolveMediaRange(header, SIZE)).toEqual({ kind: "full" });
    }
  });

  it("never returns a range that escapes the file", () => {
    for (const header of ["bytes=-500", "bytes=0-99", "bytes=500-", "bytes=900-99999", "bytes=-4000"]) {
      const resolved = resolveMediaRange(header, SIZE);
      if (resolved.kind !== "partial") continue;
      expect(resolved.start).toBeGreaterThanOrEqual(0);
      expect(resolved.end).toBeLessThan(SIZE);
      expect(resolved.start).toBeLessThanOrEqual(resolved.end);
    }
  });
});
