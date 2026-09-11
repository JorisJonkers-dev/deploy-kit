---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/10-service-intent.md#exposure
rests-on: ["0005"]
---

# Route precedence is derived and rendered explicitly, and a duplicate route is refused

## Rests on
Which route serves a request is decided by the declaration, and path specificity
is enough to decide it for every exposure in this estate. False if: two routes on
one host need an order that specificity does not produce: a shorter prefix that
must win over a longer one. Settled by: rendering the estate's exposures and
finding every route's precedence explicit, with `auth`'s `/api` ahead of `/` by
derivation rather than by proxy sort, and no exposure needing a hand-set number.

## Why
Most of R17 has already been closed by rewriting chapter 10: an exposure now
requires a `name`, every route requires a `path` and a `match`, and
[0072](0072-the-label-set-is-fixed.md) settled the label set with no hostname
label. What survives is the part nobody had to think about because it happens to
work.

`auth` declares `/api` and `/` as prefixes on one host. The request for
`/api/foo` reaches `auth-api` rather than `auth-ui` **because Traefik sorts
matching rules by rule length and then by name**, behaviour of one proxy at one
version, documented nowhere in this model, and load-bearing for the estate's most
common exposure shape. Which route serves a request is a routing decision, and by
[0005](0005-derivation-is-total.md) a decision that determines behaviour is one
the model makes.

So specificity derives a precedence, `exact` before `prefix`, longer prefix
before shorter, and the rendered route carries it. Three things follow: the
document says what the edge does, a change in ordering appears in a diff, and a
proxy that tie-breaks differently changes nothing. That last one is not
hypothetical bookkeeping: the layer-1 files name no Kubernetes kind precisely so
that a substrate swap is a v2 migration rather than an undo, and inheriting
routing semantics from a proxy's internals is the same trap one layer down.

Refusing overlaps outright was the other way to make precedence unnecessary, and
it refuses the normal case: `/api` beside `/` is the estate's standard split, and
an overlap is exactly what it is.

The duplicate is separate and simpler. Two routes on one host with the same
`path` and `match` have no correct interpretation (whichever wins is decided by
a rule-name comparison no author can see), so `E_DUPLICATE_ROUTE` refuses the
pair at composition, one level down from `E_DUPLICATE_HOST`. Declaration order
was the alternative: it would make YAML list order semantic, which nothing else
in this model does, and a reordering diff would silently change routing.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Rely on Traefik's ordering and document it | Produces the right answer for every route today; nothing to derive | Correctness rests on undocumented tie-breaking inside one proxy version, and an upgrade that changes it reroutes traffic silently |
| Refuse overlapping paths | Precedence never arises | `/api` beside `/` is the estate's most common exposure shape, and it is an overlap |
| Let declaration order break a duplicate | Reads top to bottom like a router config | Makes list order semantic, and a reordering diff would change routing with nothing to see |
| Author a priority per route | Full control for the case specificity gets wrong | A priority is a mechanism, and every author would have to hold the whole host's routing in their head to pick a number |

## Reversibility
Undo cost today: one derivation and one invariant; the rendered field is
patchable in place. Becomes irreversible once: routes rely on derived precedence
in a proxy whose own sort would have ordered them differently, because removing
the field then reorders live traffic.

## Consequences
- R17 closes, and route precedence stops being a property of a proxy's source
  code, paid by nobody.
- A route needing an order specificity does not produce has no way to say so; it
  restates the derived value with a reason like any other derivation
  ([0031](0031-derived-overrides-with-reason.md)), paid by whoever needs it, and
  the override records why.
- `E_DUPLICATE_ROUTE` can fire on a document that works today, since a duplicate
  currently resolves silently; adoption may surface one, paid at adoption, which
  is the point of a build error over a coin flip.
- The rendered IngressRoute grows a field, so the golden trees change for every
  routed Service, paid once, in the comment-strip pass that is already rewriting
  them.
