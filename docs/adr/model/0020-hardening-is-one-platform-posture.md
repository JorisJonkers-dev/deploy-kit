---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-09-29
normative: spec/v1/14-platform-intent.md#hardening-policy
rests-on: ["0002", "0004", "0006"]
---

# Hardening is one platform posture with no exception surface: writable paths are declared, the user comes from the images lock, and a privileged port is refused

One posture, `restricted`, applies to every container the estate renders,
sidecars included. It is declared once, in the Platform document, and no
Process or sidecar authors a control. Three facts make that hold without
exceptions:

- A Process declares the paths it writes. Each becomes an `emptyDir` of the
  platform's ephemeral size, and `readOnlyRootFilesystem` stays true.
- The images lock records each image's numeric `uid` and `gid`; `runAsUser`,
  `runAsGroup` and `fsGroup` derive from them, with
  `fsGroupChangePolicy: OnRootMismatch`. A named user is
  `E_IMAGE_USER_NOT_NUMERIC`, at lock time.
- A port below 1024 is refused rather than granted the capability.

An image that cannot meet the posture is `E_HARDENING_UNMET`; the fix is the
image, or a Bidirectional Ledger entry while it is replaced. The controls are
listed in [chapter 10](../../../spec/v1/10-project-intent.md#hardening).

## Rests on

Kubernetes applies the four controls (non-root, an immutable root filesystem, no
capabilities, the default syscall filter) per pod and per container
([0002](0002-kubernetes-is-the-substrate-for-one-applier.md)), so the render can
state all four on every container with no author involved. Ephemeral disk is
contended, so its size is platform-assigned
([0004](0004-contention-decides-authority.md)). The lock is a pinned input
([0006](0006-pinned-inputs.md)), so a user read from it is a derivation, not a
registry read at render time.

**False if:** a container in the worked set needs a hardening field or an
exception to render, a Process's writable set cannot be enumerated ahead of
time, or an image the estate depends on has no numeric user and cannot be
replaced. **Settled by:** the committed trees under
`spec/v1/examples/{auth,data,knowledge,minimal}/rendered/` carrying the four
controls on every container, the `postgres-exporter` sidecar included, with no
project file carrying a hardening field (a test asserting both is to be
written, owned by joris); and `platform-postgres` running `initdb` on a freshly
provisioned `local-path` volume.

## Why

**One legal value carries no information.** A field holding `restricted` on
every Process restates one estate-wide decision thirty times.

**A relaxation with a reason is an override under another name.** It outlives
the image that justified it: the estate's list of what it could not harden was
written once and never shortened. Refusing puts the cost where the defect is, in
the image.

**Writable paths keep the control intact.** A JVM needs `/tmp`; nginx needs
`/var/cache/nginx` and `/var/run`. `auth-ui` used to relax the whole
`readOnlyRootFilesystem` control for two directories. Mounting what a Process
declares keeps the image's filesystem immutable, which is what the control
means. Nothing is implicit: `/tmp` appears only where declared.

**The user is a fact of the image.** `runAsNonRoot` with no `runAsUser` depends
on the image's `USER`, and a named user fails at the kubelet with no diagnostic.
A fresh `local-path` directory is root-owned, so a non-root pod with no
`fsGroup` cannot write its own volume. The lock step already reads the registry
to resolve a digest, so it reads the user too. An init container that chowns the
volume would need root on every stateful Process.

**A low port is refused.** `auth-ui` declared port 80 under `restricted` and
rendered a pod that could not bind it. Deriving `NET_BIND_SERVICE` would re-add a
dropped capability silently. A route names a surface, not a number
([0023](0023-exposure-is-declared-by-audience.md)), so moving to 8080 changes
nothing a consumer sees.

**The render settles it.** Whether an image starts under the posture is found at
apply, and the answer is the image or a ledger entry
([0038](0038-bidirectional-ledgers.md)).

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A hardening field per Process, with a reasoned exception | a per-container exception vocabulary | an override under another name that never shrinks |
| A writable path as an exception entry | one inventory for every relaxation | conflates a mounted tmpfs with disabling the control |
| Author a size per writable path | consistent with volume sizes | a temp directory's size is the node's tolerance, not the data's |
| The Process authors `runAsUser` | explicit | a mechanism in layer 1 that can disagree with the image |
| An init container that chowns the volume | the common chart pattern | needs root on every stateful Process |
| Derive `NET_BIND_SERVICE` for a low port | nothing authored changes | silently re-adds a dropped capability |
| Prove the posture in a vcluster | a live answer per render | parked with co-testing ([0069](../deferred/0069-co-testing-is-parked.md)); the claim is about authored documents, which a render shows |

## Reversibility

Undo cost today: re-adding a field is additive; the lock fields and the mount
derivation are hours. Becomes irreversible once: volumes hold data owned by
these uid and gid pairs, because changing the derivation then means chowning
live data.

## Consequences

- Every non-static Process declares its writable set, and an image that writes
  elsewhere fails at start, paid by the application author.
- The lock step needs registry read access for every alias and fails on an
  unpullable image, paid at lock time.
- An image with a named `USER` or a fixed low port cannot enter the estate until
  replaced or ledgered, paid by whoever owns it.
- `E_HARDENING_UNMET` stays pending until an implementation checks images
  against the posture.
