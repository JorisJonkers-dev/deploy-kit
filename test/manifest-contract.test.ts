// The manifest gate, executed.
//
// lint-manifests.ts wraps kubeconform for two reasons: it skips loudly when the
// binary is absent rather than passing quietly, and it fails the build when the
// binary fails. Both are what make it a gate rather than a script, and neither
// is proven by running it against a clean tree.
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  lintManifests,
  main,
  renderedFiles,
} from "../scripts/lint-manifests.ts";
import { collect } from "./support/collect.ts";
import { temporary } from "./setup.ts";

const REPOSITORY = join(import.meta.dirname, "..");
const NAMESPACE = "apiVersion: v1\nkind: Namespace\nmetadata:\n  name: x\n";

/** A tree whose worked examples hold `files`, relative to spec/v1/examples. */
function tree(
  files: Readonly<Record<string, string>> = { "x/rendered/ns.yaml": NAMESPACE },
): string {
  const root = mkdtempSync(join(temporary(), "manifest-lint-"));
  const examples = join(root, "spec", "v1", "examples");
  mkdirSync(examples, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(examples, rel)), { recursive: true });
    writeFileSync(join(examples, rel), content);
  }
  return root;
}

/** A stand-in kubeconform that echoes its arguments and exits `code`. */
function kubeconform(code: number): string {
  const bin = join(mkdtempSync(join(temporary(), "bin-")), "kubeconform");
  writeFileSync(bin, `#!/bin/sh\necho "fake kubeconform $*"\nexit ${code}\n`);
  chmodSync(bin, 0o755);
  return bin;
}

describe("the manifest lint", () => {
  it("skips loudly and passes when the binary is absent", () => {
    const output = collect();
    const absent = join(temporary(), "definitely-not-here");
    expect(lintManifests(tree(), absent, output)).toBe(0);
    expect(output.text()).toMatch(/SKIPPED/);
  });

  it("passes when kubeconform passes, handing it every rendered file", () => {
    const output = collect();
    expect(lintManifests(tree(), kubeconform(0), output)).toBe(0);
    expect(output.text()).toMatch(/fake kubeconform .*ns\.yaml/);
    expect(output.text()).toMatch(/-kubernetes-version 1\.31\.4/);
  });

  it("fails the build when kubeconform fails", () => {
    expect(lintManifests(tree(), kubeconform(1), collect())).toBe(1);
  });

  it("fails loudly when there are no rendered examples", () => {
    const output = collect();
    expect(lintManifests(tree({}), kubeconform(0), output)).toBe(1);
    expect(output.text()).toMatch(/no rendered examples found/);
  });

  it("fails loudly when there is no examples directory at all", () => {
    const empty = mkdtempSync(join(temporary(), "empty-"));
    expect(lintManifests(empty, kubeconform(0), collect())).toBe(1);
  });
});

describe("renderedFiles", () => {
  it("returns only YAML inside a rendered directory, sorted", () => {
    const root = tree({
      "b/rendered/two.yaml": NAMESPACE,
      "a/rendered/one.yaml": NAMESPACE,
      "a/intent.yaml": NAMESPACE,
      "a/rendered/notes.md": "# Notes\n",
    });
    expect(
      renderedFiles(root).map((path) => path.slice(root.length + 1)),
    ).toStrictEqual([
      "spec/v1/examples/a/rendered/one.yaml",
      "spec/v1/examples/b/rendered/two.yaml",
    ]);
  });
});

describe("the command", () => {
  it("takes the binary from KUBECONFORM", () => {
    expect(main([tree()], { KUBECONFORM: kubeconform(3) }, collect())).toBe(3);
  });

  it("runs when Node starts the script, which is how CI runs it", () => {
    // KUBECONFORM names a binary that is not there, so the gate has to skip.
    // Not an empty PATH: an empty PATH means the current directory, and CI
    // downloads kubeconform into the directory the tests run from.
    const absent = join(temporary(), "definitely-not-here");
    const run = spawnSync(
      process.execPath,
      [join(REPOSITORY, "scripts", "lint-manifests.ts"), tree()],
      { encoding: "utf8", env: { PATH: "", KUBECONFORM: absent } },
    );
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(
      /manifest lint: SKIPPED because .* is not on PATH/,
    );
  });
});
