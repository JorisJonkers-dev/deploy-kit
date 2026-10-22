---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-15
normative: spec/v1/10-project-intent.md#generated-keys
rests-on: ["0004", "0005"]
---

# A generated key is declared on its grant and written by its own Project's Vault policy job, once, under that Project's prefix

A key of a `kv` grant may declare `generate`, with a length and an encoding.
The Project's own Vault policy job writes every generated key of that Project
that Vault does not hold, per render and every hour, under the Project's own
prefix, and never changes a key Vault holds. Nothing a person runs creates a session key, an HMAC key or any
other value whose only requirement is to be random and stable.

## Rests on

A value whose only requirement is to be random and stable is contended by
nobody, so no author declares it, and it is derived
([0004](0004-contention-decides-authority.md),
[0005](0005-derivation-is-total.md)). Vault configuration is already rendered
and applied in the cluster by the policy job
([0040](0040-vault-policy-is-a-deliverable.md),
[0087](0087-in-cluster-consumers-read-the-render.md)), so the same job applies
it.

**False if:** a generated value must be known outside the cluster before the
Project's first release, or must be rotated on a schedule. **Settled by:** a
Project moved onto the estate path with its session key declared `generate`,
and no stage of `cluster.sh` writing it.

## Why

**The Project's own job already runs where it must.** Each Project's unit
carries its own policy job
([0087](0087-in-cluster-consumers-read-the-render.md),
[0116](0116-a-project-owns-every-object-it-delivers.md)). A grant's Secret
syncs only once the job has written the role it is read through, and the unit
is Ready only once the job has run, so a key it writes is there when the
Process first reads it. A failure holds that Project alone, where one job for
every Project held every Project with a grant.

**It adds no real privilege.** The job's writer may write policies and auth
roles of its own namespace's names, so it can already grant its own Project
anything. Creating KV documents below that namespace's prefix is less than
that, and the writer's policy confines it to that prefix by the
ServiceAccount's namespace. The job still writes only the keys a rendered
document names.

**Never overwriting makes a re-run safe.** The job writes a key only when Vault
lacks it, check-and-set against the version it read, so the hourly run, a
re-render and a restored Vault never change a value a Process holds.

**One owner per value.** A generated key lives under its own Project's prefix,
one grant generates it, and nothing else writes its path, so no two writers
race and a reader knows where it comes from.

**A value that must survive a move is adopted, not copied by hand.** A Project
moving its secrets under its own prefix often holds a value that cannot change:
a key that sealed stored data, a push key pair its clients hold. The key names
the old location, and the job copies it there once, while the key is absent. The
writer may read every KV document, since an old location lies outside the
Project's prefix by definition, so `adopt` is held to a path the Project already
reads through one of its own grants: it reads nothing the Project could not.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A seed Job per Project, beside its policy job | a narrower policy per Project | a second Job, policy, role and ordering per Project, for a power the Project's own policy job already holds |
| One estate-wide job writes every Project's keys | one job | every Project with a key waits on it, and one Project's change or failure holds them all ([0116](0116-a-project-owns-every-object-it-delivers.md)) |
| `cluster.sh` keeps generating keys | nothing to build | a person runs a script for every Project moved and after every restore |
| A `generated:` block apart from grants | keys declared in one list | two places to keep in step: what is generated and what is read |
| Generate on every render | no state | a new value every render logs everyone out |
| A person copies a value that must survive a move | nothing to build | a Vault write by hand for every Project moved |
| `adopt` from any location | no grant to keep | the writer reads every KV document, so a project file could copy another Project's secret into its own key |

## Reversibility

Undo cost today: one field, three refusals and one document the job reads:
a day. Becomes costly once: Projects declare `generate`, and dropping it means
writing their keys by hand again.

## Consequences

- A Project declares `generate` on a key it reads, paid by its author once.
- The writer role every policy job logs in as reads KV documents and writes
  them below its own namespace's prefix, granted in `cluster.sh` once per
  cluster.
- A key generated this way never rotates; rotating one is deleting it, after
  which the next run writes a new value.
- `E_GENERATED_KEY_OUTSIDE_PROJECT`, `E_GENERATED_KEY_TWICE` and
  `E_GENERATED_KEY_WRITTEN_ELSEWHERE` refuse a second owner, and
  `E_GENERATED_KEY_ADOPTS_UNGRANTED` an adopted value the Project does not
  read.
- A Project keeps its grant on an adopted location for as long as it declares
  `adopt`; both go once the move is done.
