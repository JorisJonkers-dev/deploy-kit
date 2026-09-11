// No new em-dashes may enter the repository.
//
// THIS ONLY STOPS NEW ONES. Rewriting the existing ones off the list is #26
// (specification) and #27 (decision records, registers, root documents and
// tooling). Each rewrite batch is expected to take its files off the allow
// list below in the same pull request, so a listed file that no longer carries
// an em-dash *also* fails: the list can only shrink, never silently go stale.
//
// Two trees are never scanned: `docs/mde/`, which holds third-party papers,
// lecture material and coursework kept verbatim, and `CHANGELOG.md`, which
// release-please writes.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = join(import.meta.dirname, "..");

const EXCLUDE = ["CHANGELOG.md"];
const EXCLUDE_PREFIXES = ["docs/mde/"];

// Files that still contain an em-dash today. The list can only shrink: each
// rewrite batch (see #26 and #27) removes the files it cleaned. A file listed
// here that no longer contains an em-dash fails the same way a new offender
// does, so the list cannot drift from the tree.
const ALLOW = [
  ".dependency-cruiser.cjs",
  "CLAUDE.md",
  "CONTEXT.md",
  "README.md",
  "VERSIONING.md",
  "docs/adr/README.md",
  "docs/adr/architecture/0065-one-hexagon-domain-mirrors-the-layers.md",
  "docs/adr/architecture/0066-wire-shape-is-not-the-domain.md",
  "docs/adr/architecture/0067-adapters-build-objects-one-serializer.md",
  "docs/adr/architecture/0068-failures-are-a-diagnostic-list.md",
  "docs/adr/architecture/0069-boundaries-enforced-on-the-graph.md",
  "docs/adr/architecture/README.md",
  "docs/adr/deferred/0008-tested-equals-deployed-requires-push.md",
  "docs/adr/deferred/0041-push-delivery-boundary.md",
  "docs/adr/deferred/0042-apply-before-prune-inventory.md",
  "docs/adr/deferred/0043-delete-authority-durability-gate.md",
  "docs/adr/deferred/0044-reconcile-cronjob.md",
  "docs/adr/deferred/0045-break-glass-reporting.md",
  "docs/adr/deferred/0046-distinct-field-managers.md",
  "docs/adr/deferred/0047-namespace-per-deployer.md",
  "docs/adr/deferred/0048-class-b-pinning.md",
  "docs/adr/deferred/0049-aggregator-owned-tests.md",
  "docs/adr/deferred/0050-exercises-and-deploys.md",
  "docs/adr/deferred/0051-vcluster-substrate.md",
  "docs/adr/deferred/0058-delivery-machinery-observability.md",
  "docs/adr/deferred/README.md",
  "docs/adr/model/0001-estate-scale-and-ownership.md",
  "docs/adr/model/0002-kubernetes-as-substrate.md",
  "docs/adr/model/0003-three-layer-meta-model.md",
  "docs/adr/model/0004-contention-decides-authority.md",
  "docs/adr/model/0005-derivation-is-total.md",
  "docs/adr/model/0006-pinned-inputs.md",
  "docs/adr/model/0007-schema-version-separable.md",
  "docs/adr/model/0009-vault-read-is-per-path.md",
  "docs/adr/model/0010-flat-service-identity.md",
  "docs/adr/model/0011-configuration-env-files-per-workload.md",
  "docs/adr/model/0012-assets-not-code.md",
  "docs/adr/model/0013-blueprint-packs-pinned-checkout.md",
  "docs/adr/model/0014-probes-are-siblings.md",
  "docs/adr/model/0015-durability-class-per-volume.md",
  "docs/adr/model/0016-pod-hardening.md",
  "docs/adr/model/0017-placement-by-capability.md",
  "docs/adr/model/0018-exposure-by-audience.md",
  "docs/adr/model/0019-registered-unmanaged-surfaces.md",
  "docs/adr/model/0020-dependency-edges-carry-surface.md",
  "docs/adr/model/0021-observability-scrape-and-alert-class.md",
  "docs/adr/model/0022-grants-live-on-the-service.md",
  "docs/adr/model/0023-grant-unit-is-the-path.md",
  "docs/adr/model/0024-identity-per-workload.md",
  "docs/adr/model/0025-access-tiers-derive-policy.md",
  "docs/adr/model/0026-delivery-env-file-self.md",
  "docs/adr/model/0027-secret-reference-join-key.md",
  "docs/adr/model/0028-secrets-at-rest-gate.md",
  "docs/adr/model/0029-resolved-deployment-versioned-artifact.md",
  "docs/adr/model/0030-runtime-mechanics-derived.md",
  "docs/adr/model/0031-derived-overrides-with-reason.md",
  "docs/adr/model/0032-reconcile-unit-derived.md",
  "docs/adr/model/0033-assignments-published-back.md",
  "docs/adr/model/0034-cluster-state-pinned-input.md",
  "docs/adr/model/0035-network-policy-default-deny.md",
  "docs/adr/model/0036-cni-selection.md",
  "docs/adr/model/0037-composition-oci-fragments.md",
  "docs/adr/model/0038-participants-list-staleness.md",
  "docs/adr/model/0039-artifact-schema-versioning.md",
  "docs/adr/model/0040-renovate-ordering-gate.md",
  "docs/adr/model/0052-registered-adapters-are-v1.md",
  "docs/adr/model/0053-adapter-port-contract.md",
  "docs/adr/model/0054-adapter-attribution.md",
  "docs/adr/model/0055-bidirectional-ledgers.md",
  "docs/adr/model/0056-node-facts-single-source.md",
  "docs/adr/model/0057-datastore-and-restore.md",
  "docs/adr/model/0059-v1-scope-stopping-rule.md",
  "docs/adr/model/0060-release-unit.md",
  "docs/adr/model/0061-placement-is-hard-dimensions.md",
  "docs/adr/model/0062-service-is-the-release-unit.md",
  "docs/adr/model/0063-intent-authored-per-domain.md",
  "docs/adr/model/0064-sidecars-are-workload-vocabulary.md",
  "docs/adr/model/0070-path-authority-is-layer-2.md",
  "docs/adr/model/0071-release-gate-inputs-are-layer-2.md",
  "docs/adr/model/0072-the-label-set-is-fixed.md",
  "docs/adr/model/0073-vault-policy-is-a-deliverable.md",
  "docs/adr/model/0074-networking-adapter-emits-policy.md",
  "docs/adr/model/0075-no-workload-rbac-in-v1.md",
  "docs/adr/model/0076-middleware-has-one-producer.md",
  "docs/adr/model/0077-durability-derives-a-backup.md",
  "docs/adr/model/0078-engine-is-workload-vocabulary.md",
  "docs/adr/model/0079-alert-class-derives-from-a-rule-catalog.md",
  "docs/adr/model/0080-database-catalog-is-derived-data.md",
  "docs/adr/model/0081-volume-size-is-a-hard-dimension.md",
  "docs/adr/model/0082-images-lock-carries-uid-and-gid.md",
  "docs/adr/model/0083-privileged-port-needs-the-capability.md",
  "docs/adr/model/0084-render-only-is-the-v1-policy-stage.md",
  "docs/adr/model/0085-a-grant-is-a-union-on-engine.md",
  "docs/adr/model/0086-kv-read-covers-its-metadata-sibling.md",
  "docs/adr/model/0087-token-mounted-only-for-delivery-self.md",
  "docs/adr/model/0088-startup-probe-targets-liveness.md",
  "docs/adr/model/0089-replicas-derived-no-minavailable.md",
  "docs/adr/model/0090-edges-resolve-against-the-register.md",
  "docs/adr/model/0091-identity-placeholders-not-framework-wiring.md",
  "docs/adr/model/0092-writable-paths-are-declared.md",
  "docs/adr/model/0093-route-precedence-is-derived.md",
  "docs/adr/model/0094-asset-change-restarts-unconditionally.md",
  "docs/adr/model/0095-platform-intent-is-the-second-authored-document.md",
  "docs/adr/model/0096-the-foundation-is-declared.md",
  "docs/adr/model/0097-authored-values-name-model-concepts.md",
  "docs/adr/model/0098-one-publication-path.md",
  "docs/adr/model/0099-bootstrap-set-is-recorded.md",
  "docs/architecture.md",
  "review/EXPOSURE-MANIFEST.md",
  "review/PLACEMENT-DOMAIN-MANIFEST.md",
  "scripts/diagrams/class-diagram.py",
  "scripts/lint-adrs.mjs",
  "scripts/lint-boundaries.mjs",
  "scripts/lint-links.mjs",
  "scripts/lint-manifests.mjs",
  "spec/v1/00-overview.md",
  "spec/v1/10-service-intent.md",
  "spec/v1/14-platform-intent.md",
  "spec/v1/16-dependencies.md",
  "spec/v1/20-resolved-deployment.md",
  "spec/v1/30-deliverables.md",
  "spec/v1/40-composition.md",
  "spec/v1/50-lifecycle.md",
  "spec/v1/60-setup.md",
  "spec/v1/diagrams/00-overview-meta-model.drawio.svg",
  "spec/v1/diagrams/10-service-intent-model.drawio.svg",
  "spec/v1/diagrams/16-derivation-map-assignments.drawio.svg",
  "spec/v1/diagrams/16-derivation-map-deliverables.drawio.svg",
  "spec/v1/diagrams/16-edge-derives.drawio.svg",
  "spec/v1/diagrams/16-exposure-trace.drawio.svg",
  "spec/v1/diagrams/20-resolved-deployment-io.drawio.svg",
  "spec/v1/diagrams/30-render-pipeline.drawio.svg",
  "spec/v1/diagrams/40-composition-run.drawio.svg",
  "spec/v1/diagrams/60-bootstrap-order.drawio.svg",
  "spec/v1/diagrams/README.md",
  "spec/v1/examples/RENDER-GAPS.md",
  "spec/v1/examples/auth/auth.domain.yml",
  "spec/v1/examples/auth/rendered/README.md",
  "spec/v1/examples/data/data.domain.yml",
  "spec/v1/examples/data/rendered/README.md",
  "spec/v1/examples/knowledge/knowledge.domain.yml",
  "spec/v1/examples/knowledge/rendered/README.md",
  "spec/v1/examples/minimal/README.md",
  "spec/v1/examples/negative/duplicate-service-id/README.md",
  "spec/v1/examples/negative/duplicate-service-id/intent-a/knowledge.yml",
  "spec/v1/examples/negative/duplicate-service-id/intent-b/agents.yml",
  "spec/v1/examples/negative/duplicate-workload-name/README.md",
  "spec/v1/examples/negative/duplicate-workload-name/intent/agents.yml",
  "spec/v1/examples/platform/README.md",
  "spec/v1/examples/refusals/README.md",
  "spec/v1/examples/refusals/alert-class-unknown.domain.yml",
  "spec/v1/examples/refusals/cutover-recreate-over-rwo.domain.yml",
  "spec/v1/examples/refusals/cutover-rolling-over-rwo.domain.yml",
  "test/adr-lint-negative.test.js",
  "test/simplification-contract.test.js",
];

function isExcluded(rel) {
  if (EXCLUDE.includes(rel)) return true;
  return EXCLUDE_PREFIXES.some((prefix) => rel.startsWith(prefix));
}

// Pure classification over a {rel: content} map, so the mechanism is testable
// against synthetic trees exactly the way link-contract.test.js does.
// Returns the list of offenders, each prefixed with why it fails.
function classify(files) {
  const offenders = [];
  for (const rel of Object.keys(files).sort()) {
    const hasEmDash = files[rel].includes("\u2014");
    const allowListed = ALLOW.includes(rel);
    if (isExcluded(rel)) {
      if (allowListed) {
        offenders.push(`${rel}: excluded but listed on the allow list`);
      }
      continue;
    }
    if (hasEmDash && !allowListed) {
      offenders.push(`${rel} contains an em-dash (\u2014)`);
    } else if (!hasEmDash && allowListed) {
      offenders.push(`${rel} is on the allow list but has no em-dash left`);
    }
  }
  return offenders;
}

// The live check: every tracked file (outside the exclusions) must satisfy the
// allow list exactly as it stands today.
function trackedFiles() {
  return execFileSync("git", ["ls-files"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean)
    .sort();
}

test("no new em-dashes in tracked text outside the exclusions", () => {
  const files = {};
  for (const rel of trackedFiles()) {
    let body;
    try {
      body = readFileSync(join(ROOT, rel), "utf8");
    } catch {
      continue; // binary files that readFileSync chokes on are not prose
    }
    files[rel] = body;
  }
  const offenders = classify(files);
  assert.deepEqual(offenders, []);
});

test("adding an em-dash to an unlisted file fails and names the file", () => {
  const offenders = classify({
    "a.md": "fine\n",
    "b.md": "uses an em dash\u2014here\n",
  });
  assert.deepEqual(offenders, ["b.md contains an em-dash (\u2014)"]);
});

test("a listed file with no em-dash left fails until removed from the list", () => {
  const rel = ALLOW[0];
  const files = {};
  for (const r of ALLOW) files[r] = "\u2014\n";
  files[rel] = "clean now\n";
  const offenders = classify(files);
  assert.ok(
    offenders.some((o) => o.startsWith(`${rel} is on the allow list`)),
    offenders.join("\n"),
  );
});

test("docs/mde and CHANGELOG.md are never scanned", () => {
  const offenders = classify({
    "docs/mde/lecture/notes.md": "third-party\u2014verbatim\n",
    "CHANGELOG.md": "release please\u2014owns this\n",
  });
  assert.deepEqual(offenders, []);
});

test("the allow list holds every tracked file that contains an em-dash today", () => {
  const files = {};
  for (const rel of trackedFiles()) {
    let body;
    try {
      body = readFileSync(join(ROOT, rel), "utf8");
    } catch {
      continue;
    }
    files[rel] = body;
  }
  const actual = [];
  for (const rel of Object.keys(files).sort()) {
    if (isExcluded(rel)) continue;
    if (files[rel].includes("\u2014")) actual.push(rel);
  }
  const missing = actual.filter((rel) => !ALLOW.includes(rel));
  const stale = ALLOW.filter((rel) => !actual.includes(rel));
  assert.deepEqual(
    { missing, stale },
    { missing: [], stale: [] },
    "the allow list must match the tracked files containing an em-dash",
  );
});
