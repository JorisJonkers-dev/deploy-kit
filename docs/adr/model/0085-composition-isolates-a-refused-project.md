---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-10-01
normative: spec/v1/40-composition.md#a-refused-project-is-isolated
rests-on: ["0001"]
---

# Composition isolates a refused Project, and every other Project still composes

A fragment that breaks an estate-wide invariant is set aside: its Project stays
at its last composed fragment, and every other Project still composes. A
fragment that depends on an isolated one fails its own references and is
isolated in turn. Only a refused Platform document, or a breach no changed
fragment caused, still fails the whole run
([chapter 40](../../../spec/v1/40-composition.md#a-refused-project-is-isolated)).

## Rests on

The estate is one maintainer with about thirty Applications
([0001](0001-estate-scale-and-ownership.md)), released independently, so on any
day some fragment is likely to be broken, and the maintainer fixes one thing at
a time.

**False if:** an isolated Project's last composed fragment breaks an invariant
against the fragments that compose beside it, so the composed estate is not one
the invariants accept. **Settled by:** publish a fragment that duplicates
another Project's host, and observe the run isolate it, compose the rest, and
check every invariant over the result.

## Why

**One broken fragment stopped every deploy.** Under the previous rule every
collision failed the run, so one Project's mistake blocked the fix another
Project was shipping, and the stale-participant bound turned one quiet
repository into an estate-wide outage
([0043](0043-participants-list-staleness.md)).

**The last composed fragment already passed.** It composed in an earlier run
against the same invariants, so composing it again keeps the estate in a state
the invariants accepted. The Project is not deleted and not frozen by hand; it
simply does not move until its fragment is fixed.

**Isolation is decided by what changed.** An invariant breach names the
fragments involved. The ones whose digest differs from the previous lock are the
ones set aside, so a collision is blamed on the fragment that introduced it, not
on the one that was there first. When none of them changed, the breach came
from the Platform document or the toolkit, and there is nothing to isolate.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Every collision fails the run, as before | simplest; the composed estate is always the newest | one Project blocks all |
| Drop the refused Project from the render | no stale content | a render that omits a Project prunes it ([chapter 40](../../../spec/v1/40-composition.md#a-missed-publish-is-a-deletion)) |
| Isolate both sides of a collision | no blame rule | an unchanged Project is held back by its neighbour's change |

## Reversibility

Undo cost today: the isolation step in the `compose` use-case and its
notifications, a day. Nothing outside composition depends on it.

## Consequences

- Composition reads the previous lock to decide which fragment to isolate, paid
  in one more input it already had.
- An isolated Project is reported on the commit that published it, in one
  Estate-repository issue and on Discord
  ([chapter 55](../../../spec/v1/55-delivery.md#notifications)), paid by its owner
  in a fix.
- A Project depending on an isolated one is isolated too, so a provider's
  broken release holds its consumers back, paid by those consumers' owners.
