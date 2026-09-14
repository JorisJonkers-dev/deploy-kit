// REQ-017 (docs/requirements.md): every specification E_ code is exercised or pending.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PENDING,
  RETIRED,
  codeErrors,
  lintCodes,
  main,
  type Pending,
} from "../scripts/lint-codes.ts";
import { collect } from "./support/collect.ts";
import { temporary } from "./setup.ts";

const REPOSITORY = join(import.meta.dirname, "..");

const code = (name: string): string => ["E", name].join("_");
const ALPHA = code("ALPHA");
const BETA = code("BETA");
const GAMMA = code("GAMMA");
const chapter = (...codes: string[]): string =>
  `| code |\n| ${codes.join(" |\n| ")} |\n`;
const pending = (ticket: string, ...codes: string[]): Pending => ({
  ticket,
  reason: "waits on the thing that runs it",
  codes,
});

function tree(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(join(temporary(), "codes-lint-"));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "-A"], { cwd: root });
  return root;
}

describe("codeErrors", () => {
  it("passes a code a test exercises and a code pending on a ticket", () => {
    const result = codeErrors(
      {
        "spec/v1/10-intent.md": chapter(ALPHA, BETA),
        "test/a.test.ts": `expect(x).toBe("${ALPHA}")`,
      },
      [pending("#1", BETA)],
    );

    expect(result).toStrictEqual({
      defined: 2,
      exercised: 1,
      pending: 1,
      errors: [],
    });
  });

  it("fails a defined code nothing exercises and nothing lists pending", () => {
    expect(
      codeErrors({ "spec/v1/10-intent.md": chapter(ALPHA) }, []).errors,
    ).toStrictEqual([
      `${ALPHA}: defined by the specification, exercised by no test, and not pending`,
    ]);
  });

  it("counts a Java test and a committed diagnostics oracle as exercising", () => {
    const result = codeErrors(
      {
        "spec/v1/10-intent.md": chapter(ALPHA, BETA, GAMMA),
        "emf/parity/src/test/java/X.java": ALPHA,
        "spec/v1/examples/refusals/x.diagnostics.json": `[{"code":"${BETA}"}]`,
        "emf/parity/src/main/java/Y.java": GAMMA,
      },
      [pending("#1", GAMMA)],
    );

    expect(result).toStrictEqual({
      defined: 3,
      exercised: 2,
      pending: 1,
      errors: [],
    });
  });

  it("fails a pending code once a test exercises it, naming the file", () => {
    const result = codeErrors(
      { "spec/v1/10-intent.md": chapter(ALPHA), "test/a.test.ts": ALPHA },
      [pending("#7", ALPHA)],
    );

    expect(result.errors).toStrictEqual([
      `${ALPHA}: pending on #7, but test/a.test.ts exercises it`,
    ]);
  });

  it("fails a pending code no chapter defines, listed twice, or with no reason", () => {
    const result = codeErrors({ "spec/v1/10-intent.md": chapter(ALPHA) }, [
      pending("#1", ALPHA),
      { ticket: "#2", reason: " ", codes: [ALPHA, BETA] },
    ]);

    expect(result.errors).toStrictEqual([
      "pending on #2: names no reason",
      `${ALPHA}: pending on both #1 and #2`,
      `${BETA}: pending on #2, but no chapter defines it`,
    ]);
  });

  it("fails a code used in the tree that no chapter defines, once per code", () => {
    const result = codeErrors(
      {
        "spec/v1/10-intent.md": chapter(ALPHA),
        "docs/adr/model/0001-x.md": `${ALPHA} and ${BETA}`,
        "src/z.ts": BETA,
      },
      [pending("#1", ALPHA)],
    );

    expect(result.errors).toStrictEqual([
      `docs/adr/model/0001-x.md uses ${BETA}, which no chapter defines`,
    ]);
  });

  it("ignores codes out of scope, in superseded decisions, retired by name, or inside a longer name", () => {
    const [retired = ""] = Object.keys(RETIRED);
    const result = codeErrors(
      {
        "spec/v1/10-intent.md": chapter(ALPHA),
        "docs/mde/notes.md": BETA,
        "docs/adr/deferred/0041-x.md": BETA,
        "review/old.md": BETA,
        "scripts/diagrams/draw.py": BETA,
        "CHANGELOG.md": BETA,
        "docs/adr/model/0017-x.md": `---\nsuperseded-by: "0061"\n---\n${BETA}`,
        "docs/adr/model/0061-x.md": retired,
        "src/env.ts": `RELEASE_${code("APP_ID")} and ${code("APP_ID").toLowerCase()}`,
      },
      [pending("#1", ALPHA)],
    );

    expect(result.errors).toStrictEqual([]);
  });

  it("does not count a chapter mention outside spec/v1 chapters as a definition", () => {
    const result = codeErrors(
      {
        "spec/v1/examples/README.md": ALPHA,
        "spec/v1/10-intent.md": chapter(BETA),
        "test/b.test.ts": BETA,
      },
      [],
    );

    expect(result.errors).toStrictEqual([
      `spec/v1/examples/README.md uses ${ALPHA}, which no chapter defines`,
    ]);
  });
});

describe("the committed pending list", () => {
  it("names a ticket and a reason for every group, and holds no code twice", () => {
    const codes = PENDING.flatMap((group) => group.codes);

    expect(
      PENDING.every(
        (group) => /^#\d+$/.test(group.ticket) && group.reason.length > 0,
      ),
    ).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("holds over this repository", () => {
    const result = lintCodes(REPOSITORY);

    expect(result.errors).toStrictEqual([]);
    expect(result.defined).toBe(result.exercised + result.pending);
  });
});

describe("the command", () => {
  it("says what is defined, exercised and pending, and exits 0", () => {
    const output = collect();
    const root = tree({
      "spec/v1/10-intent.md": chapter(ALPHA),
      "test/a.test.ts": ALPHA,
    });

    expect(main([root], output, [])).toBe(0);
    expect(output.text()).toBe(
      "codes lint: 1 codes defined, 1 exercised, 0 pending\n",
    );
  });

  it("lists every violation under a count, and exits 1", () => {
    const output = collect();
    const root = tree({ "spec/v1/10-intent.md": chapter(ALPHA) });

    expect(main([root], output, [])).toBe(1);
    expect(output.text()).toBe(
      `codes lint: 1 error(s)\n  - ${ALPHA}: defined by the specification, exercised by no test, and not pending\n`,
    );
  });

  it("checks this repository when no tree is named", () => {
    expect(main([], collect())).toBe(0);
  });

  it("runs when Node starts the script", () => {
    const run = spawnSync(
      process.execPath,
      [join(REPOSITORY, "scripts", "lint-codes.ts")],
      {
        encoding: "utf8",
      },
    );

    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(
      /^codes lint: \d+ codes defined, \d+ exercised, \d+ pending$/m,
    );
  });
});
