---
tier: premise
status: proposed
claim: open
owner: joris
date: 2026-08-31
normative: spec/v1/40-composition.md#versioning
---

# The data model's version is not the package's version

## Rests on
The artifact schema version can be decoupled from `package.json`'s version, and
composition can accept a compatibility range per fragment without losing "no
combination renders unexpectedly", because the lock records exact resolved
versions and reproducibility therefore survives. False if: a permitted range
admits two toolkit versions that produce different renders from identical
inputs. Settled by: a render-hash equality test across adjacent toolkit patch
versions: render the same pinned inputs under each version a range admits and
assert the output hashes are equal.

## Why
In the replaced repository the two versions were one number by construction:
its `src/cluster-context/schema.ts:75-79` asserted
`ctx.spec.schemaVersion !== getPackageVersion()` and throws
`E_SCHEMA_VERSION_MISMATCH`, where `getPackageVersion()` reads `package.json`'s
`version`. That field moves at release cadence, not model cadence: CHANGELOG.md
shows 26 releases in ten weeks (2026-06-09 to 2026-08-20), most of which
changed code, not the data model. The old set's lockstep record (recoverable from
commit `7ea3c4f`) records the live result: skew of `0.16.0` in four project repos,
`0.20.0` in `stalwart-provisioner`, `0.22.0` in the published contexts, and
the estate still functions. The equality rule is stricter than what the estate
demonstrably needs.

Under composition the same rule amplifies from a local annoyance into an
estate-wide stop. Review finding B3 (three independent reviewers) names it:
equality is asserted fail-closed over the union of fragments, so every toolkit
release refuses every participant until it republishes at that exact version,
and nothing deploys until all have (including the one shipping the fix), and `dormant: true` exempts a participant from `maxAge` but not from the
version assert. Post-v1, each of those 26-in-ten-weeks releases would open
roughly ten Renovate PRs that must all merge before anything renders. Two spec
artifacts already contradict lockstep as written: `spec/v1/40-composition.md:237`
and `spec/v1/10-project-intent.md:36` both declare `schemaVersion: 1.0.0`,
satisfiable only while the npm package sits at exactly `1.0.0`.

Separability does not surrender determinism. The guarantee the old equality
bought (document, toolkit and context provably aligned so no combination
renders unexpectedly) is preserved by two facts: the model version moves only
on model change, and the lock records the exact toolkit and fragment versions
that resolved, so any replay uses those exact versions regardless of what range
was declared. The range governs admission; the lock governs reproduction. The
concrete range rule and rollout mechanics are decided in
[0044](0044-artifact-schema-versioning.md) and
[0047](0047-one-publication-path.md); the normative rule lives in
[40-composition](../../../spec/v1/40-composition.md#versioning).

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Rival premise: the package version IS the model version (lockstep, status quo) | 26 releases/10 weeks × ~10 consumer Renovate PRs each, all red until both contexts republish; under composition one stale participant halts every composition | The old record itself shows three-way skew functioning in production; the assert forbids what reality already tolerates, and B3 shows it fail-closed over the union |
| Rival premise: the contract needs no version at all | Silent misinterpretation: a document written against one model is read as another with no error; the abandoned `feat/unversioned-contract` branch is the estate's own retreat from this | Removes the only fail-closed guard against rendering a document the toolkit does not understand |

## Reversibility
Undo cost today: add an equality assert to the composition resolve stage and
delete the `schemaVersion` range from the schema: hours of work; blast radius is every consumer pin, which Renovate already
churns. Becomes irreversible once: fragments carrying a decoupled
`schemaVersion` are published to OCI and pinned by consumers' locks. Reverting
to equality would then invalidate every published fragment at once, exactly the
estate-wide stop this premise exists to avoid.

## Consequences
- A toolkit release that does not change the data model no longer forces an
  estate-wide republish-and-pin round, saved by every consumer repository;
  paid by the toolkit maintainer (joris), who must judge per release whether the
  model moved.
- A genuine model change must now be recognised and versioned deliberately,
  since `package.json` no longer does it automatically, paid by the toolkit
  maintainer (joris).
- Two version numbers exist where there was one, and the render-hash test
  named above must exist and run before any range is trusted, paid by the
  toolkit's CI budget.
- Reproducibility claims shift their weight onto the lock recording exact
  resolved versions; a lock that recorded only ranges would break replay,
  paid by the composition implementation, guarded in
  [0044](0044-artifact-schema-versioning.md).
