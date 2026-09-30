---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-09-29
normative: spec/v1/55-delivery.md#the-release-gate
rests-on: ["0001", "0003", "0005"]
---

# An Application is the unit of atomic release, and a first-party Release Gate holds its members at a barrier and fails closed

Things that must release together are Processes of one Application; there is no
mechanism to couple two Applications. No member's new version receives traffic
until every member has passed its analysis, and one member failing holds the
whole Application on its old versions. The switch of a `blue-green` Application
is performed by Flagger and decided by a first-party **Release Gate**, which
answers the two questions a Canary asks (may this member's new version start,
may it be promoted) from the Application's release-gate inputs in the Resolved
Deployment. It holds every member at a barrier until all have passed, and answers
no whenever it cannot answer. The delivery machinery (Flagger, the gate, the edge
proxies) is listed in the Platform document and never gated. Analysis cadence is
the platform's; each member's checks derive from its Runtime Profile.

## Rests on

Every lockstep pair in the estate can be one Application without losing a
referencable name, and the boundary is the model's own
([0003](0003-three-model-pipeline.md)). Which Processes are members, what each is
analysed on and how long the unit waits follow from declarations already made
([0005](0005-derivation-is-total.md)). One maintainer on one cluster
([0001](0001-estate-scale-and-ownership.md)), so one small controller is cheaper
than a service mesh.

**False if:** a pair must release together and both names must be referencable
from outside their project, a member receives new-version traffic before every
member has passed, or a release proceeds while the gate is unreachable.
**Settled by:** every `dependsOn` target in the composed union
(`platform-postgres`, `platform-rabbitmq`, `stalwart`, `platform-valkey`, none of
them a merged pair); `auth` released with `auth-ui`'s analysis forced to fail and
`auth-api` never promoted; and the gate stopped mid-release with every Canary
waiting.

## Why

**The boundary carries the guarantee.** A `releaseUnit` name coupled Applications
across repositories, invisibly in any single file. Under one file per project the
coupled things are adjacent Processes of one Application, and the boundary
already means "switches together". `auth-api`'s estate-wide role is the
forward-auth middleware, not an edge, so folding it into `auth` breaks no
reference.

**Atomicity is not ordering.** The Reconcile Unit is derived from the dependency
graph and answers ordering ([0033](0033-reconcile-unit-derived.md)). The
Application is drawn by an author and answers atomicity: a product judgement the
graph cannot see.

**Flagger switches; nothing in it holds a unit.** Its blue/green runs one Canary
per Deployment with no dependency between Canaries. Its `confirm-rollout` and
`confirm-promotion` webhooks are where a barrier plugs in.

**From data, not scripts.** A loadtester running rendered `kubectl` and `jq`
would be executable code in a Deliverable
([0014](0014-file-shaped-configuration-is-an-asset.md)) reading live objects to
decide what the model already says.

**Staggered promotion, one barrier.** Promotion copies each Canary onto its
primary member by member, and Process-to-Process traffic crosses their own
Services, so no mechanism flips an Application at one instant. The rule the model
can keep is the barrier: no member promoted until all have passed.

**Fail closed, and never gate the gate.** A gate that lets releases through while
down fails exactly when needed. A gate cannot gate its own release, and a proxy
bound to a host port cannot run two copies, so the machinery rolls in place
([0021](0021-runtime-mechanics-derive-from-cutover.md)).

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A `releaseUnit` name across Applications | coupling without merging | a cross-repository coupling invisible in any file |
| Co-location implies atomicity | nothing to declare | editing an unrelated line couples a rollout |
| Inputs in layer 2 with nothing reading them | no controller to write | the release-unit rule stays a promise |
| Loadtester scripts rendered into each Canary | ships today | executable code in a Deliverable |
| An edge-level atomic flip | one flip at the edge | east-west traffic still staggers |
| Fail open | releases continue during an outage | the barrier lapses exactly then |

## Reversibility

Undo cost today: reintroduce a coupling field and split merged Applications, an
afternoon plus one pull request per project file; delete the gate's inputs and
Canaries: hours. Becomes irreversible once: an inbound reference exists to a
merged Application's id, or releases depend on the gate.

## Consequences

- A Process is not independently referencable; an edge to a merged Process means
  undoing the merge and restoring its id.
- A lockstep pair that cannot merge is evidence the boundary is drawn wrong,
  judged one pair at a time by joris.
- The estate writes and runs one controller, the Release Gate, paid by joris.
- Chapter 55 also has the gate read which revision each primary runs, which is
  not layer-2 data; naming the live facts it may read is an open proposal.
