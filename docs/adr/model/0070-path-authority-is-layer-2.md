---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/20-resolved-deployment.md#the-path-plan
rests-on: ["0003"]
---

# Layer 2 assigns every output path; layer 3 serialises what it is handed

## Rests on
Where a Deliverable is written is a decision, not a formatting detail, and every
path in the estate is assignable from the Resolved Deployment alone. False if:
a path can only be known once an object is being serialised: a name derived
from content the plan does not carry. Settled by: rendering the three worked
domains with `E_PATH_COLLISION` evaluated on the assembled plan, before any
adapter runs, and no adapter holding an API that returns a path.

## Why
Layer 3 contains no decisions ([0003](0003-three-layer-meta-model.md)), and a
path is a decision. It says which directory owns an object, and therefore which
kustomization includes it, which Reconcile Unit applies it, and who is
answerable for a field. The earlier rule, a path is a pure function of its
adapter and the object it carries, reads like serialisation but is authority in
disguise.

Two live cases prove it cannot hold. `namespace.yaml` and the namespace-wide
default-deny are **one object per domain**, while an adapter keyed off the
Service emits one directory per Service: `auth` has one Service so nothing
collides, `data` has three and renders three identical Namespace objects at
three paths, with nothing but write order deciding which survives. And the
Gatus endpoints ConfigMap is estate-scoped: it lands in `utility-system`, a
namespace no participating Service owns, and `E_FOREIGN_NAMESPACE` is satisfied
only because the adapter owns the path rather than the Service. Under an
adapter-computed path both outcomes are accidents; under a plan both are
assignments with an owner.

Moving authority up also moves a check earlier. `E_PATH_COLLISION` has zero
occurrences under `src/` today while the writer applies each prepared file in
turn, two adapters sharing a path both write, second wins, silently, both
reporting `action: "create"`. With the complete path set known before any
adapter runs, the collision is decidable at plan assembly, which is the only
place it can be reported as a defect in a decision rather than as a race in a
writer.

What does not change: an Adapter still declares a `defaultPath` in the registry
([0054](0054-adapter-attribution.md)), because that is how the set states what
each Adapter is for and it is what the plan assigns from. Attribution stays a
property of the producer. The plan records which Adapter owns each path; it does
not let one Adapter write into another's.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Keep the path a function of the adapter and the object | No spec edit; matches the sentence chapter 30 already carries | Leaves the per-domain object and the estate-scoped Deliverable unresolvable, and keeps collision detection at the writer, where it has never existed |
| A layout policy module consulted by both layers | An explicit seam, testable alone | A component holding decisions while sitting outside the three layers is the unnamed middle the meta-model exists to prevent, and it would own authority no chapter assigns it |
| Let the writer resolve collisions by precedence | Nothing to design; deterministic given an order | Encodes authority as evaluation order, which is invisible in every artifact a reviewer reads, and makes adding an adapter a change to what an existing one emits |

## Reversibility
Undo cost today: the plan is a field set on the Resolved Deployment and a
parameter the adapter port already needs, so reverting is deleting both while
restoring per-adapter path computation, under a day before adapters are
written. Becomes irreversible once: the Resolved Deployment's schema is
published and repositories read paths back from their projection, because the
plan is then part of the artifact contract and its removal is a schema break.

## Consequences
- Layer 2's artifact grows a path per rendered object, so the Resolved
  Deployment gets larger and its diff shows a path change as the decision it is,
  paid in artifact size, and repaid in review.
- `E_PATH_COLLISION` becomes decidable before any adapter runs, so a collision
  is reported once against the plan rather than discovered as a silent
  overwrite, paid by nobody; it is the fix.
- A new Adapter cannot invent a location: its `defaultPath` states intent and
  the plan assigns, so adding one requires deciding where its output belongs
  before it can emit anything, paid by the author, deliberately.
- Chapter 30's rule sentence changes, and every reader who learned the old form
  has to unlearn it; the chapter records the old form and why it failed rather
  than quietly replacing it, paid once, in prose.
