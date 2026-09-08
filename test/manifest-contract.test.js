// The manifest gate, executed.
//
// lint-manifests.mjs wraps kubeconform for two reasons: it skips loudly when the
// binary is absent rather than passing quietly, and it fails the build when the
// binary fails. Both behaviours are what make it a gate rather than a script,
// and neither is proven by running it against a clean tree.
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const LINT = join(import.meta.dirname, "..", "scripts", "lint-manifests.mjs");

/** A tree with one rendered file, plus a fake kubeconform that exits `code`. */
function run({ withFile = true, fake = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), "manifest-lint-"));
  try {
    if (withFile) {
      const dir = join(root, "spec", "v1", "examples", "x", "rendered");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "ns.yaml"),
        "apiVersion: v1\nkind: Namespace\nmetadata:\n  name: x\n",
      );
    } else {
      mkdirSync(join(root, "spec", "v1", "examples"), { recursive: true });
    }
    const env = { ...process.env };
    delete env.KUBECONFORM;
    if (fake !== null) {
      const bin = join(root, "fake-kubeconform");
      writeFileSync(
        bin,
        `#!/bin/sh\necho "fake kubeconform $*"\nexit ${fake}\n`,
      );
      chmodSync(bin, 0o755);
      env.KUBECONFORM = bin;
    } else {
      env.KUBECONFORM = join(root, "definitely-not-here");
    }
    const r = spawnSync("node", [LINT, root], { encoding: "utf8", env });
    return { code: r.status, output: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("an absent binary skips loudly and passes", () => {
  const { code, output } = run();
  assert.equal(code, 0, output);
  assert.match(output, /SKIPPED/);
});

test("a passing kubeconform passes, and is given every rendered file", () => {
  const { code, output } = run({ fake: 0 });
  assert.equal(code, 0, output);
  assert.match(output, /fake kubeconform .*ns\.yaml/);
  assert.match(output, /-kubernetes-version/);
});

test("a failing kubeconform fails the build", () => {
  const { code } = run({ fake: 1 });
  assert.equal(code, 1);
});

test("a tree with no rendered examples fails loudly", () => {
  const { code, output } = run({ withFile: false, fake: 0 });
  assert.equal(code, 1);
  assert.match(output, /no rendered examples found/);
});
