---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: spec/v1/10-service-intent.md#configuration
rests-on: ["0005"]
---

# The model derives no framework wiring; it exposes the Workload's own identity as placeholders

## Rests on
A self-delivering Workload's Vault client configuration is its framework's
concern, and the only part the model must supply is the derived values that
configuration references. False if: two Workloads of the estate wire the same
framework and their boilerplate drifts apart in a way that breaks one of them —
which would make the duplication, not the taxonomy, the real cost. Settled by:
`auth-api` rendering with its four spring-cloud-vault lines in its own env file,
`VAULT_KUBERNETES_ROLE` resolved through `${identity:vaultRole}`, and no
framework named anywhere in the model.

## Why
`delivery: self` was specified as deriving "a Vault policy, a Kubernetes auth
role, and the application's own client wiring". The third item cannot be
derived. For `auth-api` it is four spring-cloud-vault variables, and producing
them requires knowing the process is Spring Boot — which `runtime: jvm` does not
say and must not be made to say. `runtime` selects the Runtime Profile, the
observability wiring; crossing it with frameworks multiplies it by every library
the estate ever adopts, and R22 records the pressure to do exactly that.

A `secretClient` field with a platform catalog was the other real option, and it
loses on the same ground as a neutral IR: each catalog entry is the model
guessing at somebody else's configuration surface, and the taxonomy grows
whenever a repository changes library. [0078](0078-engine-is-workload-vocabulary.md)
added a field for what a process **is**, which the platform must act on to back
it up. A framework is what a process is *built with*, and nothing the platform
does depends on it.

So the wiring stays where the framework knowledge is: the Workload's own env
file, in its own repository. That leaves one real problem, which is the reason
this is a decision rather than a shrug. One of those four lines is
`VAULT_KUBERNETES_ROLE: auth-api`, and the role name is **derived**
([0024](0024-identity-per-workload.md)). Written as a literal it is precisely
the staleness that produced the `serviceAccountName()` defect, where a
hand-maintained name and a derived one disagreed and nothing noticed until two
Workloads shared a principal.

Hence `${identity:…}`, a fourth named source beside `${dependency:…}`,
`${secret:…}` and `${exposure:…}`. The first three name something else; this one
names what the platform decided about **this** Workload — `vaultRole`,
`serviceAccount`, `namespace` — as a closed key set, with no template language,
exactly like the others. A literal where a placeholder belongs is already a build
error, so the drift closes.

Restricting it to `vaultRole` alone was tempting and leaves the next self-delivering
Workload writing its namespace as a literal, which is the same defect one field
later. Reusing `${dependency:…}` for self-reference would muddle a source that
means "an edge to another Service" and force the edge invariants to special-case
it.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| A `secretClient` field with a platform wiring catalog | Removes the boilerplate; derived once for every consumer | The model would carry a framework taxonomy that grows with every library adopted, each entry a guess at someone else's configuration surface |
| Extend `runtime` into a framework taxonomy | One field, no new vocabulary | The overload R22 names: every runtime crossed with every framework, with observability wiring hanging off the same value |
| Keep "derives the client wiring" and special-case Spring | Matches what the estate needs today, exactly | One framework hardcoded into a platform derivation, and the second framework rewrites it |
| Only `${identity:vaultRole}` | Smallest surface, nothing speculative | The next Workload writes its namespace as a literal, reintroducing the drift one field over |
| Reuse `${dependency:…}` for self-reference | No new source | A dependency is an edge to another Service; self-reference muddles the source and the invariants that check edges |

## Reversibility
Undo cost today: one placeholder source with three keys, and the sentence about
client wiring. Becomes irreversible once: env files across repositories use
`${identity:…}`, because removing the source then breaks every one of them —
though that is a rename, not a redesign.

## Consequences
- R22 closes without the model learning what a framework is, which is the
  outcome worth having — paid in four boilerplate lines per self-delivering
  Workload, in the repository that owns the framework.
- `VAULT_KUBERNETES_ROLE` can no longer disagree with the derived role, so the
  `serviceAccountName()` class of defect is closed on the authoring side too —
  paid by nobody.
- A fourth placeholder source is a fourth thing to validate, complete in an
  editor and resolve; the key set is closed so the validation is a lookup — paid
  once, in the resolver.
- Nothing derives observability wiring for a framework either, so a Spring
  application still writes whatever Spring needs beyond `OTEL_*`; the Runtime
  Profile boundary stays exactly where it was — paid by the application, and it
  keeps the profile from becoming a framework catalog by increments.
