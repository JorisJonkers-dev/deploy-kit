// Guards every test shares.
//
// A suite that can reach the network eventually does, usually on somebody's
// train, so the capability is removed and using it fails the test that tried.
// And each test gets a directory of its own, removed after it, so no test can
// pass because of a file an earlier one left behind.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";

const REAL_FETCH = globalThis.fetch;

let directory: string | undefined;

beforeEach((context) => {
  globalThis.fetch = (input) => {
    const target =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    throw new Error(
      `"${context.task.name}" tried to reach ${target}. ` +
        "Tests read the tree or a fixture, never the network.",
    );
  };
});

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
  if (directory !== undefined) {
    rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  }
});

/** The one directory a test may write to: made on first use, removed after the test. */
export function temporary(): string {
  directory ??= mkdtempSync(join(tmpdir(), "deploy-kit-test-"));
  return directory;
}
