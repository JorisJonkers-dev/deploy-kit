---
tier: decision
status: accepted
claim: settled
date: 2026-10-04
normative: spec/v1/16-dependencies.md#the-backup-identitys-policy
rests-on: ["0004", "0005"]
---

# A backup identity has a network policy of its own, from facts the platform states: the surface its method dumps and where its off-cluster copy goes

Each backup identity gets a derived network policy beside its Process's: egress
to the Process it backs up, on the surface the engine's method connects to, to
the cluster's DNS, and to the address ranges of the off-cluster destination; no
ingress. The Platform document states the two facts the derivation needs and
nothing else knows: the surface, on the engine's entry, and the ranges, on the
class's off-cluster copy. The Process's own policy admits its backup identity on
that surface. The Secret Store is not among a backup's peers.

## Rests on

Derivation covers the estate only if every pod the render creates is covered by
a rule the render also creates ([0005](0005-derivation-is-total.md)): a backup
pod under a namespace-wide default-deny and no policy of its own is a pod that
can reach nothing. And a value is declared by whoever contends for the resource
it names ([0004](0004-contention-decides-authority.md)): the platform chose the
method image and the off-cluster destination, so what that image connects to and
where that destination is are the platform's to state.

**False if:** a backup pod needs no network at all, so that no policy is the
right policy; or a project could know what the platform's method image connects
to without the platform saying. **Settled by:** the `data` project's rendered
tree, where the postgres backup is admitted to port 5432 of its own Process and
to the destination's range, and the rabbitmq backup to its management port; and
the refusal of a project whose Process does not provide the surface its engine's
method dumps.

## Why

**Default-deny selects backup pods too.** The namespace's default-deny
([0035](0035-network-policy-is-default-deny-and-render-only.md)) selects every
pod, and until now only Processes had a policy admitting anything. A backup runs
as its own identity in its own pods
([0018](0018-durability-class-derives-a-backup.md)), so on the day policy is
enforced every backup that dumps over the network, and every off-cluster copy,
would have stopped, silently, at night.

**The surface is the platform's word, not the project's.** Which port a backup
connects to is a property of the method image: the postgres method speaks
postgres, the rabbitmq method exports definitions through the management API,
the files method reads the volume and connects to nothing. A project names its
`engine` and has no way to know which of its surfaces a platform image uses.
Stated once per engine, it is also what makes the check possible: a Process that
does not provide the surface is refused at composition rather than discovered as
a backup that times out.

**A policy cannot admit a hostname.** A NetworkPolicy peer is a namespace, a pod
or an address range. The destination was authored as a URI, which is what the
method is handed and what a policy cannot use. So the copy's entry also says
where the destination is, as ranges with a port, and at least one is required:
an off-cluster copy whose destination no policy can admit is one that never
arrives.

**The Secret Store is not a peer, because the pod never calls it.** A backup's
credential is delivered `env`: the operator reads the Secret Store and the pod
mounts no token ([0031](0031-identity-per-process.md)). A rule to a service the
pod cannot authenticate to admits nothing it uses and one more path out of a pod
that holds a destination's credential.

**Both halves are derived, or neither works.** Egress from the backup pod is
half a flow: the datastore's own policy is default-deny on ingress, so the
Process's allow set gains its backup identity on the dumped surface. Deriving
both from the one platform fact is what keeps them from disagreeing.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| The Process's first surface is the one a backup dumps | no new field | true for postgres, false for rabbitmq, whose first surface is AMQP and whose backup uses the management API; a convention that is wrong for one of three engines is not one |
| Admit a backup to every surface of its Process | no new field, never wrong | wider than any method needs, for the one pod that holds an off-cluster credential |
| The project file names the dumped surface | the platform stays smaller | the project does not know what the platform's image connects to, and would have to be changed when the platform changes its method |
| Admit the destination as everything outside the cluster on 443 | no address to maintain | needs the cluster's own ranges pinned to exclude them, and lets the pod holding the credential reach any host on the internet |
| Leave the destination out until a CNI admits hostnames | nothing to state today | the policy is rendered now and enforced later, and the off-cluster copy would stop on the day it is |
| Admit a backup to the Secret Store, as the design first listed | matches the Process baseline | the pod never authenticates to it; the rule admits nothing the backup uses |

## Reversibility

Undo cost today: two optional-or-additive Platform fields, one derived policy
and one refusal: hours, in both implementations. Becomes irreversible once:
policy is enforced on a cluster, because removing the derived policy then cuts
every backup off rather than leaving it open.

## Consequences

- The Platform document gains two facts to keep true: an engine's surface and a
  destination's ranges. A destination that moves to another range has to be
  restated, or the off-cluster copy stops once policy is enforced.
- A Process whose engine's method dumps a surface it does not provide is refused
  at composition, so a platform that adds a surface to an engine's entry can
  refuse a project that was accepted before.
- An address range is carried as authored: nothing checks that it is where the
  destination is.
