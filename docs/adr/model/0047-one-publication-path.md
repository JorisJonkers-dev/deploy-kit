---
tier: decision
status: accepted
claim: settled
date: 2026-09-29
normative: spec/v1/30-deliverables.md#adapters
rests-on: ["0003"]
---

# A repository publishes its Intent Fragment and nothing else, and every derivation runs once, centrally

A project repository validates its project file and pushes it as an Intent
Fragment by digest. It renders nothing. Every derivation runs once, in one
central run over the composed union, through the six registered adapters
([0037](0037-six-registered-adapters-satisfy-one-port.md)). What used to be
estate-scoped catalogs (Gatus endpoints, edge catalogs) are inbound derivations
of the Application that consumes them. Image metadata is a projection of the
images lock in the Resolved Deployment. The render emits no Flux object:
delivery writes the Kustomizations ([0050](0050-delivery-is-part-of-the-model.md)).
One `traefik` adapter renders one route set and one middleware set per tier.
Nothing pins a toolkit or model version that composition must order, so no
Renovate ordering gate exists.

## Rests on

Every kind the replaced publish-time producers emitted is derivable centrally
from the same declaration over the composed union
([0003](0003-three-model-pipeline.md)), so they added no information a consumer
could observe.

**False if:** a published kind carries something the project file does not, a
fact knowable only in the project repository at publish time. **Settled by:**
composing the worked projects from their Intent Fragments alone and diffing the
rendered tree against a render fed by the producer documents, byte for byte.

## Why

**The deletion test decided the producers.** Remove the five `*-fragment`
adapters and their compat map, and nothing a consumer observes changes: the
central run already derived every kind. They were a second render of the same
declaration, and the compat map's digest padded `renderHash` for no reason.
They predated composition. An owner who wants to see their render runs the same
core locally with the same pinned inputs: a use-case, not a second adapter set.

**Three shallow modules fell to the same test.** Estate-scoped catalog adapters
rendered three ConfigMaps whose content is an inbound derivation the model
already has a word for, like the database catalog
([0026](0026-migration-is-declared-on-the-application.md)). Image metadata is a
layer-2 fact already published back
([0032](0032-the-resolved-deployment-is-a-versioned-artifact.md)). A Flux
Kustomization per layer is delivery's reading of the Reconcile Unit DAG, not a
render output.

**Two Traefik adapters leaked an entryPoint distinction.** A tier is declared
edge facts in the Platform document, so one adapter renders per tier. The
guarantee that matters, LAN traffic never proxied through Frankfurt, rests on
facts an author can see: two tiers with disjoint audiences and two Traefik
Applications on different nodes.

**The ordering gate lost its subject.** It ordered the republishing of deploy
contexts before consumers pinned a new toolkit. No context bundle and no
aggregator pin remain, so there is nothing to order.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep the producers for a local fast check | a repository sees its render at publish time | the same core run locally is that check |
| Keep estate-scoped catalog adapters with assigned paths | nothing is broken | three adapters for three inbound derivations |
| Two Traefik adapters by tier | the split is visible in the registry | encodes the LAN constraint where no author looks |
| Render the per-layer Flux Kustomizations | the Flux objects come from the render | they encode an ordering that changes on the first new edge |
| Keep a Renovate ordering gate for toolkit bumps | bumps arrive in order | nothing pins what it orders |

## Reversibility

Undo cost today: the producers still exist in `deploy-config-schema`, and the
adapter set here is not yet written. Becomes irreversible once: repositories
publish only Intent Fragments and the central run is the only render.

## Consequences

- The adapter set is six, every one central over the composed union.
- `renderHash` covers exactly the pinned inputs and the schema package.
- A project repository's publish workflow shrinks to validate and push.
- The Jellyfin LAN-only path is a property of the Platform document's tiers, one
  place for a reviewer to look.
