// The meaning lint, executed. scripts/lint-meaning.ts catches a citation to a
// superseded decision presented as current, a term the model retired still
// read as current, and a stated count that has drifted from what it counts.
// This runs it against the repository's own tree, the way CI would, and
// proves the guard at the bottom of the script still starts it as a command.
//
// REQ-028 (docs/requirements.md): a citation to a superseded decision, a
// retired term, or a stated count is checked against what it claims.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, test } from "vitest";
import {
  CHECKED_COUNTS,
  RETIRED_TERMS,
  lintMeaning,
  main,
} from "../scripts/lint-meaning.ts";
import { collect } from "./support/collect.ts";

const REPOSITORY = join(import.meta.dirname, "..");

test("the meaning lint, run as a command, passes over the committed tree", () => {
  const out = execFileSync(
    process.execPath,
    [join(REPOSITORY, "scripts", "lint-meaning.ts")],
    { encoding: "utf8" },
  );
  expect(out).toMatch(/^meaning lint: \d+ files clean$/m);
});

describe("lintMeaning", () => {
  it("passes the repository's own tracked Markdown", () => {
    expect(lintMeaning(REPOSITORY).errors).toStrictEqual([]);
  });

  it("reads more than a handful of files, so a clean result is not vacuous", () => {
    expect(lintMeaning(REPOSITORY).files).toBeGreaterThan(50);
  });
});

describe("the data tables", () => {
  it("holds only phrases with no legitimate current sense of their own", () => {
    expect(RETIRED_TERMS.length).toBeGreaterThanOrEqual(2);
    for (const retired of RETIRED_TERMS) {
      expect(retired.term.length, retired.term).toBeGreaterThan(0);
      expect(retired.retiredBy, retired.term).toMatch(/^\d{4}$/);
      expect(retired.exemptFiles.length, retired.term).toBeGreaterThan(0);
    }
  });

  it("ties every checked count to a file that exists in this repository", () => {
    expect(CHECKED_COUNTS.length).toBeGreaterThanOrEqual(2);
    for (const claim of CHECKED_COUNTS) {
      expect(claim.actual(REPOSITORY), claim.id).toBeGreaterThan(0);
      for (const file of claim.files)
        expect(existsSync(join(REPOSITORY, file)), `${claim.id}: ${file}`).toBe(
          true,
        );
    }
  });
});

describe("the command", () => {
  it("checks this repository when no tree is named", () => {
    expect(main([], collect())).toBe(0);
  });
});
