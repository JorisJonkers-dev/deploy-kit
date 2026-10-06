# Negative fixtures

One fixture per estate-wide invariant composition answers over the union
([chapter 40](../../40-composition.md#the-estate-wide-invariants)). Each is a
directory of fragments, `intent/` for one and `intent-a/` and `intent-b/` for
two, and each fires its own code and nothing else, at the code, document and
path its oracle beside it names: `<fixture>.diagnostics.json`.

| fixture | code | fragments |
|---|---|---|
| [`duplicate-project/`](duplicate-project/) | `E_DUPLICATE_PROJECT` | two |
| [`duplicate-application-id/`](duplicate-application-id/README.md) | `E_DUPLICATE_APPLICATION_ID` | two |
| [`duplicate-process-name/`](duplicate-process-name/README.md) | `E_DUPLICATE_PROCESS_NAME` | one |
| [`duplicate-exposure-name/`](duplicate-exposure-name/) | `E_DUPLICATE_EXPOSURE_NAME` | one |
| [`duplicate-host/`](duplicate-host/) | `E_DUPLICATE_HOST` | two |
| [`unresolved-application/`](unresolved-application/) | `E_UNRESOLVED_APPLICATION` | one |
| [`unknown-surface/`](unknown-surface/) | `E_UNKNOWN_SURFACE` | one |
| [`dependency-cycle/`](dependency-cycle/) | `E_DEPENDENCY_CYCLE` | one |

**How a fixture is read.** A fragment here does not carry `.project.yml`
([chapter 10](../../10-project-intent.md#two-artefacts)); it says
`kind: Project`, and a set handed to validation directly reads it by that. Every
fixture is read beside the worked foundation: the Platform document and its
pinned inputs under [`../platform/`](../platform/platform.intent.yml), and the
`delivery`, `edge`, `observability` and `secrets` projects. The identity
invariants need no Platform document; the references resolve against its
providers as well as the union, so they are answered only beside it. Each
fixture's projects are ones the worked handover ledger names, so nothing else
is refused on the way.

**Order does not matter.** Every collision is refused at each of its sides, so
the same fragments yield the same diagnostics whichever is read first, and the
fragment that introduced the collision is the one composition isolates
([chapter 40](../../40-composition.md#a-refused-project-is-isolated)).

**Which implementation meets them.** The production implementation, in
[`test/model/negative.test.ts`](../../../../test/model/negative.test.ts). The
model-driven implementation answers the same invariants under
JorisJonkers-dev/deploy-kit#89, and meets these oracles there.
