---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-29
normative: spec/v1/55-delivery.md#scope
rests-on: ["0001", "0006"]
---

# Co-testing is parked: if it is taken up, an Aggregator owns each relationship's system tests and gates the pin commit

The model does not co-test. If co-testing is taken up, its shape is already
known and recorded here, so the work starts from a design rather than from
nothing:

- An **Aggregator** owns the system tests of a relationship: a provider together
  with its consumers. It lists the Applications it `exercises`, many-to-many.
- The gate point is the **pin commit**: a Project's pin moves only after its
  Aggregators' suites pass against the render the pin names. Flux stays the one
  applier; no Aggregator applies anything.
- The test substrate is measured before it gates: one provision-and-apply of the
  composed estate on the CI runner within fifteen minutes wall and 4 GB peak
  memory.

Until then the estate's 147 system tests gate no deployment.

## Rests on

A co-test set cannot be derived from an Application's own declarations, because
an Application declares outbound edges only and never names who calls it
([0001](../model/0001-estate-scale-and-ownership.md): one maintainer, many repositories).
A pin names one render by digest ([0006](../model/0006-pinned-inputs.md)), so the render a
suite passed against can be the render that deploys, with no push.

**False if:** every system-test class touches only Applications inside one named
Application's outbound closure, making the set derivable; or one measured
substrate run exceeds either threshold. **Settled by:** for each class under
`tests/stack-integration-tests/src/test`, the hostnames it references compared
against every named Application's outbound `dependsOn` closure; and one timed
`k3d cluster create` plus apply of the latest composition lock, with elapsed wall
time and peak RSS recorded. Owned by joris, at the co-testing review.

## Why

**The suite shows which way the edges run.** Twelve of 32 system-tagged classes
are `auth-api` relationship tests, and every one exercises `auth-api` with its
consumers. A provider cannot list its consumers from its own file, so a separate
owner of the relationship is needed.

**Pull delivery removed the obstacle.** It was once argued that tested-equals-
deployed needed push, because composition takes effect without a merge for a
suite to gate. The pin commit is that merge: gating it makes the tested render
the deployed one, with Flux still the only applier
([0050](../model/0050-delivery-is-part-of-the-model.md)).

**The substrate is unmeasured.** A vcluster per suite, six suites per change,
over some 400 rendered objects is a cost nobody has timed. It gates only after it
is measured.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Aggregators that also deploy what they test | the tested thing is the deployed thing by construction | a second applier, which delivery refuses |
| Derive co-test sets from the dependency graph | no new document | a provider's consumers are not in its own declarations |
| Gate every pin on the whole estate's suites | one gate | every change waits on every suite |
| Take co-testing up now | the suites finally gate | the substrate cost is unmeasured and delivery is not yet live |

## Reversibility

Undo cost today: nothing is built: minutes. Becomes irreversible once: pins wait
on Aggregator suites, because removing the gate then ships untested renders.

## Consequences

- The 147 system tests keep running outside delivery and gate nothing, paid in
  risk until the review.
- Co-testing is reviewed on 2026-11-30, owned by joris.
- Taking it up adds an Aggregator document and a gate on the pin commit, paid by
  whoever takes it up.
