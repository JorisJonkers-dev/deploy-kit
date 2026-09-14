// Every rendered example object, validated against Kubernetes and CRD schemas.
//
// "All parse" was the old bar, and it is what let R8 through: a PVC with
// `storage: null` parses and cannot apply. This checks shape and required
// fields against the schemas for the k3s version the Cluster Context records,
// plus the CRDs the estate actually uses: Traefik, VSO, Prometheus, Flux.
//
// kubeconform fetches the schemas from pinned upstreams, so a machine without
// the binary skips loudly rather than passing quietly. Nothing here talks to a
// cluster.
//
// A library first: tests call lintManifests() in-process with a stand-in
// binary, and `node scripts/lint-manifests.ts [root]` is the command, which
// takes the binary from KUBECONFORM, or from the PATH.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.ts";
import { processOutput, type GateOutput } from "./lib/output.ts";

const REPOSITORY = join(import.meta.dirname, "..");

// The version the worked Cluster Context records
// (spec/v1/examples/context/cluster-context.yml).
const KUBERNETES_VERSION = "1.31.4";
const CRD_CATALOG =
  "https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/" +
  "{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json";

/** Every YAML file inside a `rendered/` directory of the worked examples, sorted. */
export function renderedFiles(root: string): string[] {
  const examples = join(root, "spec", "v1", "examples");
  if (!existsSync(examples)) return [];
  return readdirSync(examples, { recursive: true, encoding: "utf8" })
    .filter(
      (rel) =>
        rel.endsWith(".yaml") &&
        rel.split(sep).slice(0, -1).includes("rendered"),
    )
    .map((rel) => join(examples, rel))
    .filter((path) => statSync(path).isFile())
    .sort();
}

/** Validate every rendered example under `root` with the kubeconform at `bin`. */
export function lintManifests(
  root: string,
  bin: string,
  output: GateOutput,
): number {
  const probe = spawnSync(bin, ["-v"], { encoding: "utf8" });
  if (probe.error) {
    output.out(
      `manifest lint: SKIPPED because ${bin} is not on PATH. ` +
        "CI installs a pinned release; set KUBECONFORM to run it locally.\n",
    );
    return 0;
  }

  const files = renderedFiles(root);
  if (files.length === 0) {
    output.err("manifest lint: no rendered examples found\n");
    return 1;
  }

  const run = spawnSync(
    bin,
    [
      "-kubernetes-version",
      KUBERNETES_VERSION,
      "-strict",
      "-summary",
      "-schema-location",
      "default",
      "-schema-location",
      CRD_CATALOG,
      ...files,
    ],
    { encoding: "utf8" },
  );
  if (run.error) {
    output.err(`manifest lint: could not run ${bin}: ${run.error.message}\n`);
    return 1;
  }
  output.out(run.stdout);
  output.err(run.stderr);
  return run.status ?? 1;
}

/** Lint the tree named by argv[0], or this repository. */
export function main(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  output: GateOutput = processOutput,
): number {
  return lintManifests(
    argv[0] ?? REPOSITORY,
    env.KUBECONFORM ?? "kubeconform",
    output,
  );
}

if (isEntrypoint(import.meta.url, process.argv[1]))
  process.exitCode = main(process.argv.slice(2));
