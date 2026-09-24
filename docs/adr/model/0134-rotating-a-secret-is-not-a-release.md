---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-24
normative: spec/v1/55-delivery.md#secret-rotation
rests-on: ["0005"]
---

# Rotating a secret is not a release, so it never starts a switchover

A new value for a Vault-delivered secret reaches a running Process by reload or
by a restart in place, as its grant's `rotation.tolerates` says, and never by a
blue/green release. The render excludes every Secret it asks Vault to write from
Flagger's configuration tracking, and a restart names the workload that is
serving. The rule is
[chapter 10](../../../spec/v1/10-project-intent.md#rotation-is-not-a-release)'s,
and its mechanics are
[chapter 55](../../../spec/v1/55-delivery.md#secret-rotation)'s.

## Rests on

The derivation is total ([0005](0005-derivation-is-total.md)): whether a change
is a release follows from what changed. A rotated value changes nothing in
layer 1 or layer 2, so the Application's revision is unchanged and there is no
new version to switch to.

**False if:** rotating a secret a `blue-green` Process reads starts a Canary
analysis, or leaves two versions of the Application running. **Settled by:**
rotate `knowledge-api`'s database credential and observe no Canary phase change
and exactly one restart of `knowledge-api-primary`.

## Why

**A release is a new version, and a new value is not one.** The Release Gate
analyses a new version beside the old one and holds the Application if it fails.
A rotated credential has no old and new version to compare: both copies would
read the same new value from the same Secret, so the analysis would measure
nothing it could fail on.

**Flagger's default would make it one.** Flagger counts a change to a Secret a
Canary references as a new revision and starts a full analysis. With the
estate's cadence that is minutes of two copies per rotation, on every Process,
on every rotation schedule, for no decision.

**Uniform exclusion, not per Process.** Marking only the Secrets a `blue-green`
Process reads would make a Secret's behaviour change when its consumer's
switchover does. Marking every Vault-delivered Secret keeps rotation one rule.

**The owner already chose the cost.** `tolerates: reload` costs nothing and
`tolerates: restart` costs a restart; both are declared on the grant. Starting a
release on top of either would spend what the owner did not agree to spend.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Let Flagger track Secrets, as it does by default | nothing to render | every rotation becomes a full analysis with two copies running, and a failed analysis holds a release nobody made |
| Exclude only the Secrets `blue-green` Processes read | fewer annotations | a Secret's behaviour would depend on its consumer's switchover |
| Restart the `<name>` Deployment, as today | no rename | between releases it is Flagger's scaled-down source, so the restart reaches nothing that serves |

## Reversibility

Undo cost today: supersede this record and drop one annotation from the render,
an hour. Nothing grows around it, so it stays cheap.

## Consequences

- A rotated value that breaks a Process is not caught by a gate: it fails as the
  Process's own health checks see it, paid by the grant's owner, who chose the
  delivery and the tolerance.
- The restart target of a `blue-green` Process is spelled differently from every
  other Process's, paid once by the adapter that spells it.
