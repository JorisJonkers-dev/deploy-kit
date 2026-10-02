// The `deploy-kit` entry: the arguments, the clock and the toolkit's release
// handed to the CLI, and its outcome handed to the boundary, which this test
// stands in for (RULE-013: only the boundary touches the process).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type * as Cli from "../../src/cli/main.ts";
import type { Outcome } from "../../src/cli/main.ts";

const performed: Outcome[] = [];
vi.mock("../../src/cli/boundary.ts", () => ({
  perform: (outcome: Outcome) => performed.push(outcome),
}));
const decided = vi.hoisted(() => ({ worlds: [] as unknown[] }));
vi.mock("../../src/cli/main.ts", async (original) => {
  const actual = await original<typeof Cli>();
  return {
    ...actual,
    main: (
      argv: readonly string[],
      world: Parameters<typeof actual.main>[1],
    ) => {
      decided.worlds.push({
        argv,
        version: world.toolkitVersion,
        now: world.now(),
      });
      return actual.main(argv, world);
    },
  };
});

describe("deploy-kit", () => {
  it("hands the arguments, the clock and its release to the CLI, and the outcome to the boundary", async () => {
    vi.stubGlobal("process", {
      ...process,
      argv: ["node", "deploy-kit", "bogus"],
    });
    await import("../../src/cli/index.ts");
    vi.unstubAllGlobals();

    const { version } = JSON.parse(
      readFileSync(
        join(import.meta.dirname, "..", "..", "package.json"),
        "utf8",
      ),
    ) as { version: string };
    expect(decided.worlds).toEqual([
      {
        argv: ["bogus"],
        version,
        now: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
        ) as string,
      },
    ]);
    expect(performed.map(({ code }) => code)).toEqual([2]);
  });
});
