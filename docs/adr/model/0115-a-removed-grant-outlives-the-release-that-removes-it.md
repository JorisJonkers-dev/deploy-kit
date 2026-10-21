---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-21
normative: spec/v1/55-delivery.md#a-removed-grant-outlives-its-release
rests-on: ["0005"]
---

# A removed grant's sync objects outlive the release that removes them, and the Release Gate deletes them once the Application serves

Flux keeps every sync object of a gated Application, and each names the revision
that rendered it. Once the Release Gate records the Application serving a
revision, it deletes that Application's sync objects of any other revision.
Restart targets are unchanged.

## Rests on

The render derives everything from one release's pinned inputs
([0005](0005-derivation-is-total.md)). So it cannot tell a grant this release
added from one it already had, or render differently before and after
promotion. What changes at promotion has to be done by something that sees it
happen.

**False if:** a release that drops a synced grant, or replaces one with
another, fails because a primary restarted before promotion cannot find the
Secret its template reads; or a sync object of an older revision is still in
the cluster after its Application serves the new one.
**Settled by:** a release of estate-dashboard that replaces its kv grant with
an edge credential, as in
[#466](https://github.com/JorisJonkers-dev/deploy-kit/issues/466), promoting
with no hand rollback, and the old `VaultStaticSecret` gone once the record
shows the new revision serving.

## Why

**Pruning with the release deletes a Secret the serving copy still reads.** A
`blue-green` primary runs the previous template until promotion. On 2026-10-16
estate-dashboard 0.5.0 replaced a kv grant with an edge credential: Flux pruned
the `VaultStaticSecret`, and the operator deleted its Secret with it. The new
`VaultDynamicSecret`'s first sync restarted the primary, as every sync of a
static or restart-only secret does
([0053](0053-rotating-a-secret-is-not-a-release.md)), and the restarted pod
could not start. The old pod kept serving, but the release could not promote
without a hand rollback.

**The Release Gate already knows the moment.** It keeps the one record of what
an Application serves, and advances it only once every member's primary runs
the new revision. Before that moment a copy may still read the old Secret;
after it, none does. Deleting at that moment needs no new state.

**Restarting less does not work in a static render.** Two narrower fixes were
weighed and both fail on the model's own rules. A restart that names only the
canary patches `<name>`, the template Flagger watches, and starts the very
release it is in ([chapter 55](../../../spec/v1/55-delivery.md#secret-rotation)).
Giving a new grant no restart target until promotion needs a render that knows
which grants are new and changes at promotion, which a pure render cannot be.
Keeping the old Secret makes the one restart a first sync triggers harmless,
because the primary it restarts finds what its template reads.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Re-enable Flagger's configuration tracking, so the primary reads its own `-primary` copies | no new code | reverses [0053](0053-rotating-a-secret-is-not-a-release.md): a rotated secret would start a release, and reach the primary only at its next promotion |
| Keep removed sync objects (`prune: disabled`) and sweep them by hand or by a periodic job | smallest change | orphaned objects pile up until someone sweeps, and a sweep on a clock can delete under a release still in flight |
| Restart only the canary for a secret only the new release reads | none in the render | restarting `<name>` starts a new release |

## Reversibility

Easy. Dropping the two annotations returns sync objects to ordinary pruning;
the gate's deletion then finds nothing to delete.

## Consequences

- A gated Application's `VaultAuth`, `VaultStaticSecret` and `VaultDynamicSecret`
  carry `kustomize.toolkit.fluxcd.io/prune: disabled` and
  `estate.jorisjonkers.dev/revision`; nothing else changes in the render.
- The Release Gate needs `list` and `delete` on those three kinds in every
  gated Application's namespace, granted by its own `api` declaration.
- A held release never serves, so its sync objects and the previous ones stay
  until a release promotes.
