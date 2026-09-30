---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-09-29
normative: spec/v1/10-project-intent.md#configuration
rests-on: ["0005"]
---

# Configuration is dotenv at three scopes merged onto the Process, a derived value is only ever a named placeholder, and the model derives no framework wiring

Configuration is authored as dotenv in three scopes: project, Application and
Process. Each scope is a directory holding a `base.env` and one overlay per
Cluster Target. The lowering merges the three onto the Process
([0012](0012-shared-intent-descends-and-is-lowered.md)); the narrower value
holds, and the same variable at the same value in two scopes is refused. A
scope directory naming no Application or Process is `E_UNKNOWN_ENV_SCOPE`.

A literal is written literally. A derived value is only ever a named
placeholder (`${dependency:…}`, `${secret:…}`, `${exposure:…}`,
`${identity:…}`), never a literal and never overridden. The model derives no
framework wiring: a self-delivering Process's client configuration lives in its
own env file, and only the derived values it references are placeholders.

## Rests on

Every non-secret value a Process's environment needs is either a literal its
author knows or a total function of the intent and pinned inputs
([0005](0005-derivation-is-total.md)). So a placeholder can name every derived
value, and nothing derived needs a hand-kept copy.

**False if:** a Process needs a variable neither a literal nor a placeholder
produces, or either implementation accepts a scope directory that names nothing
the file declares. **Settled by:** `test/model/env.test.ts`, which covers the
merge and `E_UNKNOWN_ENV_SCOPE`, and a refusal fixture
`spec/v1/examples/refusals/unknown-env-scope` whose committed diagnostics both
implementations reproduce; the fixture is to be written, owned by joris.

## Why

**Processes overlap, so scopes exist.** `knowledge-api` and
`knowledge-ingest-worker` share database and RabbitMQ coordinates and nothing
else. A scope written once reaches every Process below it.

**A scope is a directory, because a dotenv is a file.** A block in the project
file would be a second format for the same content, with no natural home for
the overlay per Cluster Target.

**One merge, joins per Process.** Everything downstream reads the effective
environment. The joins that catch an unbound grant or an unauthorised
reference run per Process on that shape.

**A narrower value is a statement; a copy is refused.** A different `DB_HOST`
in one Process says it reads a different database. The same line twice says
nothing, so it is `E_SHARED_DECLARATION_DUPLICATED`. A misspelt scope must be
loud, because its variables would reach no Process silently.

**A permitted override is indistinguishable from a stale copy.** So no hatch
reaches a derived value. The `serviceAccountName()` defect of the replaced
generation was exactly a hand-kept name disagreeing with a derived one.

**No framework taxonomy.** Producing `auth-api`'s four spring-cloud-vault lines
would require knowing the Process is Spring Boot, which `runtime: jvm` does not
say and must not. `runtime` selects the Runtime Profile, the observability
wiring; crossing it with frameworks multiplies it by every library the estate
adopts. A framework is what a Process is built with, and nothing the platform
does depends on it ([0019](0019-engine-is-process-vocabulary.md) draws the same
line for `engine`). What the platform decided about the Process itself (its
`vaultRole`, `serviceAccount`, `namespace`) is exposed as `${identity:…}`, a
closed key set, so those lines cannot drift from the derivation.

**Dotenv stays.** It was the one `.env` format in the estate already carrying
real configuration. The subset read is fixed in the chapter, and anything
outside it is refused.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Per-Process env files only | no scope directories | shared coordinates copied once per Process |
| Shared variables as a block in the project file | one file to read | a second format for dotenv content |
| Derived values defaulted but overridable | local patches possible | a permitted override is a stale copy nobody can tell apart |
| Ignore an unknown scope directory | a misspelling costs nothing | its variables reach no Process, silently |
| A `secretClient` field with a wiring catalog | removes boilerplate | a framework taxonomy that grows with every library |
| Only `${identity:vaultRole}` | smallest surface | the next Process writes its namespace as a literal |

## Reversibility

Undo cost today: fold shared scopes back into each Process's directory: hours.
Becomes irreversible once: repositories beyond the worked set author shared
scopes or `${identity:…}`, because removal is then a migration in each.

## Consequences

- An effective value can take six files to determine, a base and an overlay in
  each of three scopes, paid by whoever debugs a value.
- A self-delivering Process carries its framework's boilerplate in its own env
  file, paid in a few lines per Process, in the repository that owns the
  framework.
- Runtime Profile keys stay out of every scope, because they derive from
  `runtime`, paid by the platform owner.
- Today only the TypeScript implementation checks scope names against the
  declared Applications and Processes; the refusal fixture binds both.
