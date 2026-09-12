---
tier: decision
status: proposed
claim: settled
date: 2026-09-08
normative: spec/v1/30-deliverables.md#adapters
rests-on: ["0003"]
---

# A repository publishes its Intent Fragment and nothing else; every derivation runs once, centrally

## Rests on
Every kind the five publish-time producers emit is derivable centrally from the
same declaration over the composed union, so the producers add no information a
consumer can observe. False if: a fragment kind carries something the domain file
does not, a fact only knowable in the Service repository at publish time.
Settled by: composing the worked domains from their Intent Fragments alone and
diffing the rendered tree against a render fed by the five producer documents,
byte for byte.

## Why
[0095](0095-platform-intent-is-the-second-authored-document.md) made
publication one mechanism: everything authored enters composition as an Intent
Fragment by digest. That leaves the five `*-fragment` adapters as the one
remaining second path into the render, and the deletion test decides them.
Remove `traefik-route-fragment`, `kubernetes-workload-fragment`,
`gatus-endpoint-fragment`, `edge-catalog-fragment` and `image-metadata-fragment`
together with `adapter-compat.ts`, and nothing a consumer observes changes: the
central run already derives every one of those kinds from the composed intent.
They are a second render of the same declaration, plus a compat map whose digest
pads `renderHash` for no reason but to pair them.

They predate composition. When each repository rendered locally, a producer was
how its output reached the estate; with a composed union
([0037](0037-composition-oci-fragments.md)) the repository's job is to publish
what it declared, and the render is one run over everything declared. One
runtime, one use-case, and the publish-time step becomes what 0037 already says
it is: push a domain file by digest. A Service owner wanting to see their own
render runs the same core locally with the same pinned inputs, a use-case, not a
second adapter set.

Three more shallow modules fall to the same test. The **estate-scoped
Deliverables** (the Gatus endpoints, the two edge catalogs) had adapters of
their own and landed in a namespace no tenant owns. With Gatus and Traefik as
declared Services ([0096](0096-the-foundation-is-declared.md)) they are
**inbound derivations** of the Service that consumes them, exactly as the
database catalog is for `postgres` ([0080](0080-database-catalog-is-derived-data.md)):
what every exposure in the union implies for `gatus`, rendered as its own Asset
by the `kubernetes` adapter. Three adapters exist to render three ConfigMaps whose
content is an inbound derivation the model already has a word for.

**Image metadata** was a document "not a Kubernetes object", consumed by tooling.
It is a projection of the images lock (which Workload runs which alias at which
digest), and that is a layer-2 fact [0033](0033-assignments-published-back.md)
already publishes back. It joins the Resolved Deployment artifact set and its
adapter goes.

**`flux-root`** renders one Flux `Kustomization` per layer with `dependsOn` and
health checks. That is one delivery mechanism's reading of the Reconcile Unit
DAG, and chapter 00 puts how the estate deploys in the deferred set. The render
emits the kustomize groupings and the Reconcile Unit ordering in the Resolved
Deployment, and no Flux object; `flux-root` moves to `docs/adr/deferred/` with
the pull-versus-push question it belongs to. Keeping it in the bootstrap set was
the other option and fails on the first new edge, because the objects encode an
ordering that changes.

**Two Traefik adapters** split by tier were Traefik's entryPoint distinction
leaking into the adapter set. A tier is now four declared edge facts
([0097](0097-authored-values-name-model-concepts.md)), and one `traefik`
adapter renders one route set and one middleware set per tier, so
`traefik-middleware` folds in too, and the route-to-middleware reference is
owned by the adapter that emits both. The guarantee that matters (LAN traffic
never proxied through Frankfurt, which the estate is not permitted to do for
Jellyfin's volume) rests on facts an author can see, not on which adapter ran:
two tiers with disjoint audiences, a route's audience as the only way it reaches
a tier, and two Traefik Services placed on different nodes. Adding a tier is a
Platform document edit.

What remains is six adapters, one per subsystem: `kubernetes`, `networking`,
`prometheus`, `traefik`, `vault-policy`, `vso`. [0052](0052-registered-adapters-are-v1.md)
is rewritten to record the rule rather than the count: the registry is the
enumeration, nothing renders that is not registered, and a change to the set is
a decision. The number was a second copy of the register table, amended four
times in a week, and a second copy is what drifts.

The `Fragment` collision `CONTEXT.md` recorded closes with this: only the Intent
Fragment remains, and the output unit is a **Deliverable**, in chapter 30 as
everywhere else.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Keep the producers as a separate, later decision | Platform Intent is already large | Leaves two publication paths in a decision whose premise is that there is one |
| Keep the producers for a local fast check | A repository sees its rendered fragment at publish time | That check is the same core run locally with the same inputs, a use-case, not a second adapter set pushed by digest |
| Keep estate-scoped adapters with assigned paths | 0070 already gives them one owner; nothing is broken | Four adapters render four ConfigMaps whose content is an inbound derivation the model already names |
| Keep `flux-root` because 0059 says today's Flux tree delivers v1 | The Flux objects come from somewhere | Renders one delivery mechanism's objects inside a model whose chapter 00 says delivery is defined separately |
| Keep two Traefik adapters | The split is visible in the registry | It encodes the segregation constraint in the place least connected to the audience an author writes |
| Amend 0052 a fifth time | Consistent with how it has been handled | Guarantees a sixth, for a number the register already carries |

## Reversibility
Undo cost today: the producers still exist in `deploy-config-schema`, and the
adapter set here is not yet written. Becomes irreversible once: repositories
publish only Intent Fragments and the central run is the only render, because a
producer would then have to be reintroduced as a new publication path with its
own lock semantics.

## Consequences
- The adapter set goes from twenty to six, and every one of them is a central
  adapter over the composed union, paid in the clean rewrite 0052 already
  committed to, which now writes fewer adapters.
- `renderHash` loses the compat-map digest, so it covers exactly the pinned
  inputs and the schema package, paid by nobody, and "attributable change"
  gets simpler to state.
- Chapter 30's two-role table collapses to one role, and its `Fragment` becomes
  `Deliverable` throughout, paid in one chapter pass, and a glossary entry
  closes.
- `flux-root` joins the deferred set, so the Flux `Kustomization` per layer is
  delivery's to define; until it is, the bootstrap Flux source applies the tree
  the kustomize groupings describe, paid by the delivery definition, which
  inherits an ordering rather than an object.
- A Service repository's publish workflow shrinks to validate-and-push, paid by
  nobody, and ten repositories lose a render step.
- Jellyfin's LAN-only path is now a property of the Platform document rather
  than of the adapter registry, so a reviewer reading `tiers` can see it, paid in
  one place to look instead of two.
