---
tier: decision
status: proposed
claim: settled
date: 2026-09-08
normative: spec/v1/14-platform-intent.md#the-foundation-is-declared
rests-on: ["0003"]
---

# The foundation is declared as Services; nothing hand-written enters the render

## Rests on
Every foundation component the estate runs can be stated in the Service Intent
vocabulary (an image, Workloads, grants, exposure, volumes, a class) and what
a Helm chart adds beyond that is either a default a declaration replaces or a CRD
the bootstrap set pins. False if: a component the estate needs has configuration
no field of chapter 10 or 14 can express and no derivation can produce. Settled
by: rendering Vault, VSO, Traefik, Prometheus and Gatus from platform-owned
domain files and diffing the result against what the packs deliver today, with
every difference explained by a decision rather than a missing word.

## Why
The direction is that the DSL owns everything, and two paths into the rendered
tree defeat it. Blueprint packs deliver 41 objects (nine percent of the estate)
as hand-written Kubernetes copied whole from `flux-modules` at a git ref that
chapter 60 says is *"recorded, not verified"*. The `kubernetes` adapter carries a
"guarded raw manifests" pass-through of unbounded shape. Neither path is seen by
a single estate-wide invariant in chapter 40: no attribution check, no
default-deny derivation, no secrets gate, no label rule. And chapter 00 records
that the foundation is *"the part carrying the CVEs and the CRD upgrades"*,
precisely the objects that most need a diff a reviewer reads.

The alternative to a pack is not a bigger pack; it is a declaration. Vault is a
Workload with a volume of class `irreplaceable` and an `engine`. Traefik is two
Services placed by capability (one on the `public-ingress` node, one on a LAN
node), each the proxy for one tier. VSO is a Workload with grants. Prometheus and
Gatus are Workloads whose configuration is an **inbound derivation**: what every
scrape surface and every exposure in the union implies for them, which is the
shape [0080](0080-database-catalog-is-derived-data.md) already gave the database
catalog. Every word needed exists in chapter 10 today.

Helm is the objection, and it dissolves into two parts. A chart brings
**defaults**, and a declaration is what replaces a default. A chart brings
**CRDs**, which are cluster-scoped schema that must exist before any object of
that kind can apply, so they join the bootstrap set as pinned facts, beside k3s
itself, the Flux source and Vault's unseal. Adding a chart-shaped Workload source
instead would reintroduce a hand-maintained values surface, which is a chart's
whole configuration, and every invariant that reads a Deployment would see
nothing.

The bootstrap set is deliberately minimal and deliberately a table: k3s because
it is what applies, the Flux source because it pulls the tree everything else
is in, Vault's unseal because the model must never hold that secret, and the
CRDs. Growing it is a decision. Everything else is a Service.

Deleting the pass-through is the same decision applied to the escape hatch.
[0012](0012-assets-not-code.md) refuses executable content for a Service; a raw
manifest is content the model cannot see, for the platform. What cannot yet be
declared is a Bidirectional Ledger entry with a review date
([0055](0055-bidirectional-ledgers.md)), a deferred fix, never a permanent
exemption.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Keep packs at a pinned checkout, ledgered | Cheapest today; 0013 already decided how they arrive | Leaves 41 hand-written objects outside every invariant, carrying the estate's CVEs and CRD upgrades |
| A chart-shaped Workload source rendering `HelmRelease` | Fast path for chart-only upstreams | Reintroduces a values surface no invariant reads, and the Deployment-shaped checks see nothing |
| Declare everything, including Flux and Vault's unseal | Purest | A render cannot apply itself; the description would be aspirational rather than checkable |
| Keep the raw-manifest pass-through, guarded | Handles the case nobody anticipated | An unbounded shape the model cannot see; the ledger already exists for exactly the case nobody anticipated |

## Reversibility
Undo cost today: the platform domain files are deletable and the packs still
exist in `flux-modules`. Becomes irreversible once: the packs are deleted from
their repository and the rendered foundation is what runs, because reverting
then means reconstructing hand-written objects from a rendered tree.

## Consequences
- 0013 is superseded: there is nothing left for a pinned checkout to deliver,
  paid in one supersession.
- `flux-packs` and `flux-source` are deleted, and `HelmRelease` and
  `HelmRepository` stop being rendered kinds, paid by whoever declares the five
  foundation Services, once each.
- The foundation gets default-deny, the secrets gate, the label set, attribution
  and a byte diff on every change, which it has never had, paid in the first
  diff, which will be large and is the point.
- v1 grows: rendering the estate now includes rendering its foundation, and
  0059's stopping clause is amended to say what is actually held constant (the
  Flux installation, applying a tree the model renders), paid in scope, and
  chapter 00 already said the foundation is where the risk is.
- Adoption order in chapter 60 puts the platform domain first, because tenants
  depend on it, paid in sequencing, which the Reconcile Unit already computes.
