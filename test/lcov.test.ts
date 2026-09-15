// The minimal lcov reader scripts/pr-report.ts uses for patch coverage.
import { describe, expect, it } from "vitest";
import { parseLcov } from "../scripts/lib/lcov.ts";

describe("parseLcov", () => {
  it("reads one file's line hits", () => {
    const report = parseLcov(
      ["SF:scripts/a.ts", "DA:1,3", "DA:2,0", "end_of_record", ""].join("\n"),
    );
    expect(report.get("scripts/a.ts")?.get(1)).toBe(3);
    expect(report.get("scripts/a.ts")?.get(2)).toBe(0);
  });

  it("reads more than one file, each closed by its own end_of_record", () => {
    const report = parseLcov(
      [
        "SF:scripts/a.ts",
        "DA:1,1",
        "end_of_record",
        "SF:scripts/b.ts",
        "DA:1,0",
        "DA:2,2",
        "end_of_record",
      ].join("\n"),
    );
    expect(report.size).toBe(2);
    expect(report.get("scripts/b.ts")?.get(2)).toBe(2);
  });

  it("skips record kinds it does not read, such as FN and BRDA", () => {
    const report = parseLcov(
      [
        "SF:scripts/a.ts",
        "FN:1,myFunction",
        "FNDA:1,myFunction",
        "BRDA:1,0,0,1",
        "DA:1,1",
        "end_of_record",
      ].join("\n"),
    );
    expect(report.get("scripts/a.ts")?.get(1)).toBe(1);
    expect(report.get("scripts/a.ts")?.size).toBe(1);
  });

  it("ignores a malformed DA line missing its hit count", () => {
    const report = parseLcov(
      ["SF:scripts/a.ts", "DA:5", "DA:6,2", "end_of_record"].join("\n"),
    );
    expect(report.get("scripts/a.ts")?.has(5)).toBe(false);
    expect(report.get("scripts/a.ts")?.get(6)).toBe(2);
  });

  it("ignores a DA line before any SF has opened a record", () => {
    const report = parseLcov(["DA:1,1", "end_of_record"].join("\n"));
    expect(report.size).toBe(0);
  });

  it("returns an empty report for empty input", () => {
    expect(parseLcov("").size).toBe(0);
  });
});
