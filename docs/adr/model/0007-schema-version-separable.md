---
tier: premise
status: accepted
claim: settled
owner: joris
date: 2026-08-31
normative: spec/v1/40-composition.md#versioning
---

# The data model's version is the package's version

## Rests on
A fragment, the resolved artifact and the toolkit that reads them can carry one
number, because every model change ships in a package release and a release
that changes the model says so in its semver. False if: a release changes the
model's meaning without a major, or adds vocabulary without a minor. Settled
by: release-please's conventional-commit bumps, with every breaking model change
marked `!`.

## Why
The model and the toolkit were first kept apart because the toolkit released at
a code cadence, 26 releases in ten weeks, and an equality check between them
isolated every participant not yet republished. Two things changed. Composition
admits a fragment on a range, same major and a minor no newer than the
toolkit's, so lockstep no longer means equality; and the toolkit is the one
place the model is defined, so a separate model version would be a second
number for one fact, kept in step by hand.

From 1.0.0 on, `schemaVersion` is exactly the package version a fragment was
validated with, patch included. Admission ignores the patch, and the lock still
records the exact versions that ran
([0032](0032-the-resolved-deployment-is-a-versioned-artifact.md)). The breaking
cuts before any Project was delivered are released once, as 1.0.0, rather than
as a 2.0.0 nobody had deployed the 1.x of.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| a model version apart from the package's | the model moves only when it changes | two numbers for one fact, and a bump that is easy to forget |
| equality between fragment and toolkit | trivially reproducible | isolates every participant on every release |

## Reversibility
Undo cost today: a second version field and its admission rule, a day.
Becomes irreversible once: fragments published at 1.x are composed by a
toolkit that reads their version as the package's.

## Consequences
- A model change is a package release, paid in release notes that say so.
- A fragment's `schemaVersion` tells a reader which toolkit validated it.
