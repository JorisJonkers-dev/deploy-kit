---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-09-24
normative: spec/v1/55-delivery.md#rendered-artifacts-and-pins
rests-on: ["0001", "0006"]
---

# A Project is delivered as a signed OCI artifact pinned by digest, and a deploy is a pin commit

Composition publishes each Project's render as one OCI artifact, signed keyless
by the composition workflow's own identity and annotated with the render hash
and the lock digest. A deploy is a `[ci skip]` commit to the estate repository's
`main` that moves a Project's `OCIRepository` to the new digest, and Flux
verifies the signature before it applies anything. No rendered Deliverable is
committed. An application repository publishes its Intent Fragment only after
its images exist, with their digests resolved, which amends
[0037](0037-composition-oci-fragments.md). The mechanics are
[chapter 55](../../../spec/v1/55-delivery.md#rendered-artifacts-and-pins)'s.

## Rests on

Every assignment is a function of pinned, digested inputs
([0006](0006-pinned-inputs.md)), and what Flux applies is an input to the
cluster like any other: naming it by digest is that premise read one step
further out. The estate is one maintainer on one cluster
([0001](0001-estate-scale-and-ownership.md)), so one composition workflow is the
one signer, and one repository's history is enough of a deploy log.

**False if:** the cluster runs a render whose digest no pin commit on the
estate repository's `main` names, or Flux applies an artifact its signer did not
sign. **Settled by:** deploy one Project through a pin commit, then push an
artifact signed by another identity to the same repository, point a pin at it,
and observe Flux refuse it while the previous render keeps running.

## Why

**Committed YAML is the drift the model exists to remove.** The tree being
replaced commits rendered manifests, so the repository holds two sources of
truth, the intent and its render, and nothing but review keeps them in step. An
artifact named by digest has one source, and the render inside it is exactly
what the pinned inputs produce.

**One artifact per Project, not per estate.** A Project is the unit of
authorship and of a namespace. One estate-wide artifact would move every pin on
every fragment publish; per Project, a render whose content did not change
publishes nothing, and an unrelated publish deploys nothing.

**Keyless, because a key is a secret.** A signing key must be stored, rotated
and kept out of logs. The workflow's OIDC identity is issued per run and names
the repository, workflow and branch that signed, which is exactly the claim
Flux needs to check.

**The pin is a commit, because the history is then the deploy log.** Who
deployed what, and when, is `git log` on one file per Project, and a revert is a
commit like any other. `[ci skip]` keeps the estate repository's push checks off
a commit that only moves digests.

**Fragments after images.** A fragment published before its images exist
names a digest nothing can pull, and the render built from it fails at pod
start rather than at composition. Publishing after the build, with digests
resolved into the fragment's share of the images lock, moves that failure to
the one place that can refuse it.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Commit the rendered tree, as today | no registry, no signing | two sources of truth kept in step by review, and a diff of generated YAML on every change |
| One estate-wide artifact | one pin, one signature | every publish redeploys every Project, and a failed verification stops the whole estate |
| A signing key held as a repository secret | works without OIDC | a long-lived secret to rotate and to leak |
| Flux image automation writing tags back | built into Flux | reads a mutable tag, which the pinned-input rule forbids, and writes to application repositories |
| Keep publishing fragments independently of images | intent-only changes publish sooner | a render can name a digest that does not exist yet |

## Reversibility

Undo cost today: supersede this record and restore the committed tree, a day.
Becomes expensive once every Project is handed over
([#159](https://github.com/JorisJonkers-dev/deploy-kit/issues/159)) and the
committed tree is deleted.

## Consequences

- The estate repository holds one Flux source per Project and the Reconcile
  Units' Kustomizations, and nothing else rendered, paid once by joris
  ([#148](https://github.com/JorisJonkers-dev/deploy-kit/issues/148)).
- The Platform document records where artifacts live and who signs them, paid
  by the platform's owner.
- An intent-only change waits for its repository's image build to finish before
  it publishes, paid in minutes by every application repository.
- A pin revert is break-glass, and the next composition undoes it unless the
  inputs are reverted too, paid by whoever reaches for it.
- Image admission stays unverified: a recorded gap, owned by joris.
