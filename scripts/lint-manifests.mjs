#!/usr/bin/env node
// Every rendered example object, validated against Kubernetes and CRD schemas.
//
// "All parse" was the old bar, and it is what let R8 through: a PVC with
// `storage: null` parses and cannot apply. This checks shape and required
// fields against the schemas for the k3s version the Cluster Context records,
// plus the CRDs the estate actually uses (Traefik, VSO, Prometheus, Flux).
//
// It is offline-hostile on purpose in one direction only: schemas are fetched
// from pinned upstreams, so a machine with no network skips loudly rather than
// passing quietly. Nothing here talks to a cluster.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = process.argv[2] ?? repo;

// The version the worked Cluster Context records
// (spec/v1/examples/context/cluster-context.yml).
const KUBERNETES_VERSION = "1.31.4";
const CRD_CATALOG =
  "https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/" +
  "{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json";

const bin = process.env.KUBECONFORM ?? "kubeconform";
const probe = spawnSync(bin, ["-v"], { encoding: "utf8" });
if (probe.error) {
  console.log(
    `manifest lint: SKIPPED: ${bin} is not on PATH. ` +
      "CI installs a pinned release; set KUBECONFORM to run it locally.",
  );
  process.exit(0);
}

const glob = spawnSync(
  "sh",
  [
    "-c",
    `find "${root}/spec/v1/examples" -path '*/rendered/*' -name '*.yaml' | sort`,
  ],
  { encoding: "utf8" },
);
const files = glob.stdout.split("\n").filter(Boolean);
if (files.length === 0) {
  console.error("manifest lint: no rendered examples found");
  process.exit(1);
}
if (!existsSync(files[0])) {
  console.error(`manifest lint: cannot read ${files[0]}`);
  process.exit(1);
}

const r = spawnSync(
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
  { stdio: "inherit" },
);
if (r.error) {
  console.error(`manifest lint: could not run ${bin}: ${r.error.message}`);
  process.exit(1);
}
process.exit(r.status ?? 1);
