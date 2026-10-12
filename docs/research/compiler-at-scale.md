# The compiler at scale

Which modules, seams, architecture records and enforced rules the compiler
holds, what each costs to keep, and what the record shows each has caught.
Measured 2026-10-12 at `origin/main` `4c12851`, for
[issue #360](https://github.com/JorisJonkers-dev/deploy-kit/issues/360) on the
map in [issue #341](https://github.com/JorisJonkers-dev/deploy-kit/issues/341).
It is the code-side companion of `docs/research/what-pays-its-way.md` on
branch `research/what-pays-its-way`, which measured the specification and the
decision record at the same commit
([issue #342](https://github.com/JorisJonkers-dev/deploy-kit/issues/342)).

This file measures and recommends nothing. Every table is sorted so that the
items with the fewest dependents, the least evidence of use and the highest
cost come first, which is an ordering, not a verdict: the structure is a later
decision
([issue #361](https://github.com/JorisJonkers-dev/deploy-kit/issues/361)).
Each count is reproducible from the commands in [Method](#method).

The scale every number is read against is the premise in
[0001](../adr/model/0001-estate-scale-and-ownership.md): one maintainer, one
cluster and about thirty Applications.

## Findings

**The compiler is 89 modules and 12,463 lines in ten folders, and it is
young.** `model/` holds 29 modules and 23.1% of the lines, `adapters/` 18.3%,
`check/` 16.0%, `application/` 14.8% and `resolve/` 12.1%. Ten modules hold
45.6% of the lines; the largest are `adapters/kubernetes/render.ts` (855),
`model/resolved-deployment.ts` (756), `application/compose-estate.ts` (753),
`check/union.ts` (665) and `check/project.ts` (573). 33 modules are imported
by exactly one other module, and 14 by ten or more, of which 10 are in
`model/`. The first file under `src/` landed on 2026-09-14, and 83 of the 89
modules first appear at their current path on or after 2026-09-30, nine days
before the commit measured. Of the 155 commits since 2026-08-31, 53 touched
`src/`. See [Folders](#folders) and [Modules](#modules).

**Coverage and mutation score do not tell one module from another.** Every
module under `src/` that coverage includes, which is all but
`cli/boundary.ts`, has 100% of its lines covered, and all but two have 100% of
their branches (`check/composition.ts` and `check/project.ts` each miss one
branch). The repository-wide shortfall, 99.48% of lines, is in `scripts/`. The
mutation break score is 100, so in a green run every module scores 100% by
construction: the latest green run on `main` generated 6,759 mutants in 78
modules, killed 6,663, timed out on 20 and ignored 76 that a `// Stryker
disable` comment excludes, in 21 modules. Eleven modules hold no mutant at
all. What does differ is how many test files reach a module: the median is 7,
from 1 for `cli/index.ts` to 21 for `read/yaml.ts`. See [Modules](#modules).

**One concept chapter's code sits in 7 to 21 modules, across 4 to 8 folders.**
The layout in
[issue #358](https://github.com/JorisJonkers-dev/deploy-kit/issues/358) gives
each concept one chapter; the code is organised by pipeline stage. Counting a
module for a concept when its code names the concept's identifiers ten times
or more, Data is in 21 modules, Secrets and access in 20, Processes in 13,
Exposure in 12, and Dependencies, Placement and Observability in 7 each. Every
concept has at least one such module in each of `model/`, `check/`, `resolve/`
and `adapters/`. Six modules carry five or six of the seven concepts
(`model/project-intent.ts`, `check/project.ts`, `resolve/process.ts`,
`model/resolved-deployment.ts`, `model/platform-intent.ts` and
`check/composition.ts`); 49 modules carry none at that threshold and 21 carry
exactly one. The count is a proxy and over-counts by design; see
[Concept chapters](#concept-chapters).

**Two ports exist and each has one implementation; four ports the
architecture document names have no declaration.** `Hasher` is implemented
once, by `sha256Hasher`, and no test passes any other hasher. `Serializer` is
implemented once, by `serialize`, and one test file passes an inline stub in
two places. The names
`PinnedInputSet`, `FragmentSource`, `FragmentPublisher` and
`DeliverableWriter` in [`docs/architecture.md`](../architecture.md#ports)
appear in no file under `src/`, `test/` or `scripts/`. The adapter registry
holds six adapters; a seventh adapter directory, `adapters/flux/`, is outside
it. See [Seams](#seams).

**Eleven of the twenty gates have never been red in CI, and no test of
compiler behaviour has ever failed there.** Over the whole history of the `CI`
workflow (618 runs, 546 completed, 2026-09-07 to 2026-10-09), lint, format,
boundaries, package contents, decisions, manifests, requirements, rules, docs,
agents and meaning never failed a run. Three more were red only for a reason
other than a finding in a pull request: actionlint (a failed download), the
secret scan (a missing licence on the first day) and links (a red push to
`main`). Six turned a pull request red on its own change and were turned green
by a later commit: mutation on 7 pull requests, the model-driven build on 4,
tests on 4, code scanning on 3, codes on 1 and types on 1. Together that is 15
of the 170 pull requests, and a sixteenth, #319, is open and red. The 10 red
runs of the `Tests` job failed in seven
test files, all of them repository-contract tests in the root of `test/`; none
was under `test/model/`, `test/application/`, `test/adapters/` or `test/cli/`.
A run in CI shows only what `npm run verify` on the author's machine did not
already stop, so "never red in CI" is not "never fired". See [Gates](#gates).

**Seven of the 74 rule-ledger rows have a red CI run on record.** Two rows are
pending on tickets that are closed. Of the 72 enforced rows, the 19
dependency-cruiser rows ran 585 times and the 22 ESLint rows 612 times without
a red run. The rows with a red run are RULE-048, RULE-050, RULE-055, RULE-058,
RULE-063, RULE-064 and RULE-065, six of them on a pull request's own change.
The rules cost little in CI and more in the suite: the `Architecture` job has
a median of 14.5 seconds and the `Lint` job 26.0, while the 29 fixture files
the ledger names take 77.1 of the 111.0 seconds the 77 test files run for when
summed across workers. The 45 test files in the root of `test/`, which hold
the repository's own gates, take 91.2 of those seconds; the 32 files that test
the compiler take 19.8. See [Rules](#rules).

**Mutation testing is 79.8% of CI minutes and is the gate with the most red
runs of both kinds.** The six shards have medians of 9.4 to 17.8 minutes. Of
its 26 red jobs, 10 were survivors in files the pull request had changed, on 7
pull requests that a later commit turned green, and one more is on an open
pull request. 14 were survivors the branch had not introduced, in two
episodes, including two red pushes to `main`; in two of those cases a rerun of
the same commit passed. One was a sandbox failure. See
[Red runs of the mutation gate](#red-runs-of-the-mutation-gate).

**Eleven of the fourteen architecture records have never had their enforcing
gate red in CI.** The three that have are
[0063](../adr/architecture/0063-coverage-and-mutation-are-ratchets.md) through
mutation,
[0067](../adr/architecture/0067-every-spec-error-code-is-proved-by-a-test.md)
on one pull request, and
[0089](../adr/architecture/0089-the-package-ships-the-command-built-when-it-is-packed.md)
on the pull request that added it.
[0059](../adr/architecture/0059-failures-are-a-diagnostic-list.md) is cited by
no file outside its register, and
[0058](../adr/architecture/0058-every-step-links-through-one-trace.md) decides
a trace that no identifier under `src/` names. See
[Architecture records](#architecture-records).

**None of the concepts decided since the rework closed has code yet.** Of 21
concepts decided on issues #323, #351, #355, #356 and #357, 20 have no
identifier under `src/`, and the one that has, the GPU `vendor`, is in the
node contract only. See
[Residue of the closed architecture rework](#residue-of-the-closed-architecture-rework).

## Method

Every count was taken at `4c12851` in a clean worktree, with the Node version
`.nvmrc` pins and `npm ci`. `emf/` is out of scope: it is deleted at its
sunset
([issue #99](https://github.com/JorisJonkers-dev/deploy-kit/issues/99)) and
measures itself.

| measure | how |
|---|---|
| lines | newline count of each file `git ls-files src` lists |
| layer | the module's folder, matched to its row in the Layers table of [`docs/architecture.md`](../architecture.md#layers) |
| modules importing it, folder imports | `node_modules/.bin/depcruise src --config .dependency-cruiser.cjs --output-type json`, each module's `dependencies[].resolved`. The configuration sets `tsPreCompilationDeps`, so a type-only import is an edge |
| test files importing it | the same command over `src test scripts`: the `*.test.ts` files that import the module directly. 25 of the 77 test files import through `src/index.ts`, which re-exports most of the tree, so a transitive count is 25 to 32 for almost every module and is not shown |
| test files covering it | the Stryker reports of the latest green run on `main`, run `37927341367` at `4c12851` (artifacts `mutation-report-1` to `mutation-report-6`, file `mutation.json`): the distinct test files named in `coveredBy` and `killedBy` over the module's mutants. Stryker runs the 36 test files `vitest.mutation.config.ts` includes, not the whole suite of 77, and 35 of them reach a mutant. A static mutant, one evaluated when its module loads (1,270 of the 6,759), records only the tests that killed it, so the count is a lower bound for the modules marked †, where more than half of the mutants are static |
| coverage | `npm run test:coverage`, then `coverage/coverage-summary.json`. Totals: statements 3,845 of 3,863, branches 2,172 of 2,210, functions 1,138 of 1,138, lines 3,482 of 3,500, over `src/` and `scripts/` |
| mutants, ignored | the same Stryker reports. `Ignored` is a mutant a `// Stryker disable` comment excludes; `src/` holds 58 such comments in 21 modules |
| commits | `git log --since=2026-08-31 --name-status -M`, read in one pass, following every rename git detects (15 modules carry history from an earlier path). The repository's first commit is 2026-09-07 |
| chapters cited | every `spec/v1/NN-name.md#anchor` in the module's text, mapped to the chapter the layout in issue #358 moves that section into (the mapping is below). 17 modules cite no chapter |
| identifier hits | per concept chapter, a case-insensitive pattern over the module's code with comments stripped (the patterns are below) |
| CI history | every run of `.github/workflows/ci.yml` (`GET /repos/JorisJonkers-dev/deploy-kit/actions/runs`, 618 runs, 2026-09-07 to 2026-10-09: 463 on pull requests, 155 on pushes to `main`) and every job and step of every attempt (`GET /actions/runs/<id>/jobs?filter=all`). 72 runs were cancelled; a job that had failed before the cancellation is counted |
| red runs, and what caused them | the log of each of the 73 failed jobs other than the aggregate `Pipeline Complete` (`GET /actions/jobs/<id>/logs`), read for the failing step's output. A red step counts for a pull request's own change when the log shows a finding in what the pull request changed and a later run on the same branch, at another commit, is green. A red step that passed on a rerun of the same commit, or that a branch inherited from `main`, is listed apart |
| CI minutes | each job's `completed_at` minus `started_at` over the 30 most recent completed runs (2026-10-08 10:24 to 2026-10-09 12:02 UTC, 21 pull request runs and 9 pushes), the sample `what-pays-its-way.md` used: 2,962.3 runner-minutes. A step's time has a resolution of one second. The setup step every job runs first has a median of 7 seconds |
| seconds locally | the median of three runs of each command on the measuring machine, which adds about 0.1 seconds to every process start. Three runs of one command differed by up to a factor of three, so a value under two seconds says only that the command is fast. The suite with coverage was run once |
| ESLint time per rule | `TIMING=all node_modules/.bin/eslint .`, once. It attributes 6.5 seconds to rules, 4.2 of them to the first type-aware rule to run, which carries the cost of building the type program |
| fixture run time | `node_modules/.bin/vitest run --reporter=json`, each test file's `endTime` minus `startTime`. The 77 files sum to 111.0 seconds across workers; the suite with coverage takes 15.8 seconds of wall-clock time |
| record to rule | a reading of each record's `Settled by` line and of the section its `normative:` field names. The ledger has no column for it |
| files citing a record | tracked files other than the record and the registers that contain its file name's `NNNN-` prefix, excluding `docs/mde/`, `emf/` and `CHANGELOG.md` |

**Sections moved by the layout.** A cited section counts for the chapter the
resolution of issue #358 moves it into; a section not listed counts for its
own chapter.

| cited in | sections | counts for |
|---|---|---|
| chapter 10 | Process, Sidecars, Configuration, Runtime profiles, the dotenv subset, three placeholder sources, Assets, Probes, Replicas, Pod hardening, Writable paths, Prepare Processes, Capacity | 11 |
| chapter 10 | Ports and surfaces, Exposure | 12 |
| chapter 10 | Storage and durability, Migration, Availability | 13 |
| chapter 10 | Dependencies | 16 |
| chapter 10 | Kubernetes API access, Secrets, Grant unit, Access tiers, Delivery, Secret references | 17 |
| chapter 10 | Placement | 18 |
| chapter 10 | Observability | 19 |
| chapter 10 | Rollout, Cutover, Rollback | 55 |
| chapter 14 | Tiers | 12 |
| chapter 14 | Durability policy, Engines, Migration policy | 13 |
| chapter 14 | Providers | 16 |
| chapter 14 | Kubernetes API access, the Vault policy job, the Secret Store | 17 |
| chapter 14 | Monitor cadence, Telemetry | 19 |
| chapter 14 | Hardening policy, Probe and ephemeral policy | 11 |
| chapter 14 | Delivery policy, Move methods | 55 |
| chapter 16 | The database catalog | 13 |
| chapter 16 | Process identity, What a grant confers, the token mount, Kubernetes API access | 17 |
| chapter 20 | The migration | 13 |
| chapter 20 | The Vault policy job, the path plan | 17 |
| chapter 20 | Layer 2 does not assign a node | 18 |
| chapter 20 | The forward-auth endpoint | 12 |
| chapter 20 | The Collector | 19 |
| chapter 20 | The move | 55 |
| chapter 30 | Vault configuration is rendered, not applied | 17 |
| chapter 30 | Flagger-ready objects | 55 |
| chapter 60 | Node facts | 15 |

**Identifier patterns.** Each is the authored field names, type names and
derived names of one concept chapter's `holds` column in issue #358.

| concept chapter | pattern |
|---|---|
| 11 Processes | `lifecycle`, `sidecar`, `probe`, `replicas`, `hardening`, `writablePaths`, `startupBudget`, `runtime` as a word, `runtimeProfile`, `asset`, `env` as a word, `EnvFile`, `EnvVariable`, `ephemeral`, `securityContext`, `capacity` |
| 12 Exposure | `exposure`, `route` and `routes` as words, a name ending in `Route`, `audience`, `tier` and `tiers` as words, `forwardAuth`, `contentPolicy`, `provides` as a word, `middleware`, `certificate`, `listener` |
| 13 Data | `volume`, `durab`, `engine` and `engines` as words, a name ending in `Engine`, `migration`, `changelog`, `backup`, `database`, `datastore`, a word starting with `claim` |
| 16 Dependencies | `dependsOn`, `DependencyEdge`, `edge` and `edges` as words, `provider`, `egress`, `ingress` as a word, `ingressOf`, `NetworkPolicy`, `PolicyPeer`, `peer` and `peers` as words |
| 17 Secrets and access | `secret`, `grant`, `vault`, `policyJob`, `apiAccess`, `ApiRule`, `api` as a word, `rotation`, `ClusterRole`, `ServiceAccount`, `holder` |
| 18 Placement | `placement`, `eligib`, `nodeContract`, `arch`, `gpu` and `site` as words, `affinity`, `priorityClass` |
| 19 Observability | `observab`, `scrape`, `alertClass`, `telemetry`, `monitor`, `collector`, `metrics` as a word, `otlp` |

## Folders

Sorted by how many other folders import the folder, then by lines. The
seventh column is the `may import` cell of the Layers table in
[`docs/architecture.md`](../architecture.md#layers); the eighth is what the
module graph holds, folders first and packages after them.

| folder | modules | lines | share of `src/` | commits since 2026-08-31 | mutants | `docs/architecture.md` says it may import | it imports | imported by |
|---|--:|--:|--:|--:|--:|---|---|---|
| `src/` (root) | 1 | 102 | 0.8% | 13 | 0 | no row | `application/`, `infrastructure/`, `model/` | nothing |
| `cli/` | 3 | 552 | 4.4% | 7 | 356 | everything | `application/`, `infrastructure/`, `model/`, `fs`, `path`, `util`, `yaml` | nothing |
| `lower/` | 1 | 226 | 1.8% | 1 | 125 | `model/` | `model/` | `application/` |
| `read/` | 7 | 342 | 2.7% | 5 | 292 | `model/`, `yaml` | `model/`, `yaml`, `zod` | `application/` |
| `resolve/` | 12 | 1,504 | 12.1% | 17 | 794 | `model/` | `model/` | `application/` |
| `check/` | 6 | 1,989 | 16.0% | 15 | 1,561 | `model/` | `model/` | `application/` |
| `adapters/` | 15 | 2,284 | 18.3% | 22 | 1,288 | `model/`, `objects/`, `adapters/shared/` | `model/`, `objects/` | `application/` |
| `infrastructure/` | 3 | 130 | 1.0% | 7 | 92 | `model/`, `objects/` | `model/`, `objects/`, `crypto`, `yaml` | `src/index.ts`, `cli/` |
| `application/` | 9 | 1,840 | 14.8% | 25 | 970 | every step, `model/` | `adapters/`, `check/`, `lower/`, `model/`, `objects/`, `read/`, `resolve/` | `src/index.ts`, `cli/` |
| `objects/` | 3 | 613 | 4.9% | 13 | 0 | nothing | nothing | `adapters/`, `application/`, `infrastructure/` |
| `model/` | 29 | 2,881 | 23.1% | 24 | 1,281 | `zod` only | `zod` | `src/index.ts`, `adapters/`, `application/`, `check/`, `cli/`, `infrastructure/`, `lower/`, `read/`, `resolve/` |

Where the two columns differ:

- `read/` imports `zod`, as a type, in `read/pinned-inputs.ts` and
  `read/schema-diagnostics.ts`. The Layers row for `read/` lists `model/` and
  `yaml`. RULE-002 allows the import.
- `application/` imports `objects/`, as a type, in
  `application/render-intent-set.ts`. The Layers row for `application/` lists
  every step and `model/`.
- `src/index.ts`, the library entry point, has no row. It re-exports from
  `application/`, `infrastructure/` and `model/`, and 25 test files import the
  compiler through it.
- `adapters/registry.ts` sits directly in `adapters/`, which the Layers row
  describes as one directory per registered adapter plus `adapters/shared/`.
  It imports all six registered adapters. No dependency-cruiser rule names
  it, since `adapters-do-not-read-each-other` matches only a module inside an
  adapter's own directory.

## Modules

Sorted by the number of modules importing it, then by the number of test
files covering it, then by commits, then by lines descending. Paths are
relative to `src/`. Commits are since 2026-08-31 and follow renames.

| module | lines | layer | modules importing it | test files covering it | test files importing it | lines / branches covered | mutants (ignored) | commits | chapters its comments cite, in the new layout | concept chapters with 10 or more identifier hits |
|---|--:|---|--:|--:|--:|--:|--:|--:|---|---|
| `index.ts` (entry point) | 102 | none | 0 | no mutant | 25 | 100% / 100% | none | 13 | none | none |
| `cli/index.ts` (entry point) | 18 | `cli/` | 0 | 1 | 1 | 100% / 100% | 3 (0) | 1 | none | none |
| `cli/boundary.ts` | 9 | `cli/` | 1 | no mutant | 0 | excluded | none | 1 | none | none |
| `read/participants.ts` | 20 | `read/` | 1 | 2 | 0 | 100% / 100% | 6 (0) | 1 | 40 | none |
| `application/parse-participants.ts` | 10 | `application/` | 1 | 2 | 1 | 100% / 100% | 1 (0) | 1 | none | none |
| `model/descriptor.ts` | 161 | `model/` | 1 | 2 | 1 | 100% / 100% | 106 (0) | 7 | none | none |
| `adapters/vault-policy/job.ts` | 149 | `adapters/` | 1 | 3 | 0 | 100% / 100% | 79 (2) | 2 | 17 | 17 |
| `resolve/migration.ts` | 92 | `resolve/` | 1 | 4 | 0 | 100% / 100% | 31 (0) | 2 | 13 | 13 |
| `application/pin-sources.ts` | 172 | `application/` | 1 | 4 | 1 | 100% / 100% | 78 (4) | 8 | 20, 55 | 12, 17 |
| `model/json-schema.ts` | 90 | `model/` | 1 | 5 † | 3 | 100% / 100% | 26 (2) | 5 | none | none |
| `adapters/kubernetes/migration.ts` | 142 | `adapters/` | 1 | 6 | 0 | 100% / 100% | 71 (0) | 1 | 55 | 13, 17 |
| `adapters/kubernetes/capacity.ts` | 75 | `adapters/` | 1 | 6 | 0 | 100% / 100% | 32 (0) | 1 | 11, 55 | none |
| `adapters/traefik/render.ts` | 96 | `adapters/` | 1 | 6 | 1 | 100% / 100% | 55 (0) | 2 | 30 | 12 |
| `adapters/prometheus/render.ts` | 77 | `adapters/` | 1 | 6 | 1 | 100% / 100% | 48 (0) | 3 | 30 | 19 |
| `adapters/vso/render.ts` | 165 | `adapters/` | 1 | 6 | 1 | 100% / 100% | 77 (0) | 4 | 17, 55 | 17 |
| `adapters/kubernetes/render.ts` | 855 | `adapters/` | 1 | 6 | 1 | 100% / 100% | 539 (12) | 13 | 55, 17, 30, 16, 20 | 11, 13, 17, 18 |
| `resolve/provenance.ts` | 22 | `resolve/` | 1 | 7 | 0 | 100% / 100% | 4 (0) | 1 | 20 | none |
| `resolve/dependencies.ts` | 52 | `resolve/` | 1 | 7 | 1 | 100% / 100% | 25 (0) | 2 | 16 | 16 |
| `resolve/union.ts` | 72 | `resolve/` | 1 | 7 | 0 | 100% / 100% | 18 (0) | 6 | 20 | none |
| `resolve/process.ts` | 356 | `resolve/` | 1 | 7 | 0 | 100% / 100% | 263 (3) | 10 | 11, 20 | 11, 12, 13, 17, 18 |
| `resolve/policy-job.ts` | 45 | `resolve/` | 1 | 8 | 0 | 100% / 100% | 15 (0) | 1 | 17 | none |
| `resolve/exposure.ts` | 107 | `resolve/` | 1 | 8 | 0 | 100% / 100% | 45 (0) | 2 | 12 | 12 |
| `model/quantities.ts` | 38 | `model/` | 1 | 8 | 1 | 100% / 100% | 31 (0) | 2 | 18 | none |
| `check/pinned-inputs.ts` | 134 | `check/` | 1 | 8 | 0 | 100% / 100% | 85 (0) | 5 | 20 | 13 |
| `resolve/volumes.ts` | 137 | `resolve/` | 1 | 8 | 0 | 100% / 100% | 39 (0) | 6 | 16, 20 | 13 |
| `resolve/application.ts` | 226 | `resolve/` | 1 | 8 | 1 | 100% / 100% | 138 (2) | 11 | 20 | 13, 16, 19 |
| `check/assets.ts` | 42 | `check/` | 1 | 12 | 0 | 100% / 100% | 19 (1) | 1 | 11 | 11 |
| `check/composition.ts` | 510 | `check/` | 1 | 12 | 0 | 100% / 99.07% | 381 (2) | 14 | 13, 14 | 12, 13, 16, 17, 19 |
| `read/platform-intent.ts` | 24 | `read/` | 1 | 13 | 0 | 100% / 100% | 6 (0) | 1 | 14 | none |
| `check/platform.ts` | 65 | `check/` | 1 | 13 | 0 | 100% / 100% | 59 (0) | 2 | 14 | 12, 13 |
| `check/union.ts` | 665 | `check/` | 1 | 13 | 1 | 100% / 100% | 536 (7) | 4 | 11, 40 | 11, 12, 16, 17 |
| `lower/project.ts` | 226 | `lower/` | 1 | 18 | 1 | 100% / 100% | 125 (8) | 1 | 10 | 11, 18 |
| `read/project-intent.ts` | 25 | `read/` | 1 | 18 | 0 | 100% / 100% | 6 (0) | 1 | 10 | none |
| `check/project.ts` | 573 | `check/` | 1 | 18 | 0 | 100% / 99.12% | 481 (0) | 9 | 10, 13, 17 | 11, 12, 13, 17, 18, 19 |
| `read/env.ts` | 145 | `read/` | 1 | 19 | 1 | 100% / 100% | 194 (0) | 3 | 11 | 11 |
| `cli/main.ts` | 525 | `cli/` | 2 | 2 | 3 | 100% / 100% | 353 (4) | 7 | 40 | none |
| `infrastructure/serializer.ts` | 59 | `infrastructure/` | 2 | 4 | 0 | 100% / 100% | 27 (0) | 3 | none | none |
| `adapters/registry.ts` | 65 | `adapters/` | 2 | 4 † | 2 | 100% / 100% | 13 (0) | 4 | 30 | none |
| `application/compose-estate.ts` | 753 | `application/` | 2 | 4 | 1 | 100% / 100% | 378 (4) | 11 | 40, 55, 60 | none |
| `application/images-lock-shares.ts` | 250 | `application/` | 2 | 5 | 1 | 100% / 100% | 144 (2) | 1 | 40 | none |
| `adapters/flux/source.ts` | 158 | `adapters/` | 2 | 5 † | 1 | 100% / 100% | 60 (0) | 6 | 55, 60 | none |
| `adapters/networking/render.ts` | 265 | `adapters/` | 2 | 6 | 1 | 100% / 100% | 185 (4) | 6 | 16 | 13, 16 |
| `adapters/vault-policy/render.ts` | 70 | `adapters/` | 2 | 6 | 1 | 100% / 100% | 46 (0) | 6 | 17 | 17 |
| `model/shape-rule.ts` | 43 | `model/` | 2 | 7 | 0 | 100% / 100% | 6 (0) | 1 | none | none |
| `model/eligibility.ts` | 60 | `model/` | 2 | 8 | 1 | 100% / 100% | 89 (0) | 1 | 18 | 18 |
| `model/reconcile-units.ts` | 15 | `model/` | 2 | 8 † | 0 | 100% / 100% | 5 (0) | 2 | 20 | none |
| `resolve/secrets.ts` | 122 | `resolve/` | 2 | 8 | 0 | 100% / 100% | 78 (3) | 4 | 20 | 11, 17 |
| `read/pinned-inputs.ts` | 47 | `read/` | 2 | 9 | 1 | 100% / 100% | 10 (0) | 2 | 20 | none |
| `infrastructure/sha256-hasher.ts` | 8 | `infrastructure/` | 2 | 9 † | 0 | 100% / 100% | 4 (0) | 2 | none | none |
| `model/fragment.ts` | 27 | `model/` | 3 | 2 † | 1 | 100% / 100% | 22 (0) | 1 | 40 | none |
| `model/pin-annotations.ts` | 38 | `model/` | 3 | 3 † | 2 | 100% / 100% | 8 (0) | 1 | 55 | none |
| `application/render-intent-set.ts` | 162 | `application/` | 3 | 5 | 1 | 100% / 100% | 70 (2) | 5 | 17, 30, 55 | 17 |
| `adapters/shared/durations.ts` | 13 | `adapters/` | 3 | 6 | 1 | 100% / 100% | 11 (0) | 2 | none | none |
| `adapters/shared/holders.ts` | 95 | `adapters/` | 3 | 7 | 1 | 100% / 100% | 54 (1) | 5 | 17 | 13, 17 |
| `resolve/database.ts` | 59 | `resolve/` | 3 | 8 | 1 | 100% / 100% | 26 (1) | 1 | 13 | none |
| `model/durations.ts` | 26 | `model/` | 3 | 8 | 1 | 100% / 100% | 14 (0) | 2 | none | none |
| `application/resolve-intent-set.ts` | 259 | `application/` | 3 | 8 | 0 | 100% / 100% | 157 (7) | 7 | 20 | 11 |
| `model/revision.ts` | 40 | `model/` | 3 | 9 † | 0 | 100% / 100% | 11 (0) | 3 | 20, 55 | none |
| `model/cluster-state.ts` | 24 | `model/` | 4 | 4 † | 1 | 100% / 100% | 14 (0) | 1 | 20 | none |
| `model/participants.ts` | 76 | `model/` | 4 | 6 † | 1 | 100% / 100% | 57 (0) | 1 | 40 | none |
| `application/parse-platform-intent.ts` | 23 | `application/` | 4 | 13 | 0 | 100% / 100% | 16 (0) | 2 | none | none |
| `read/schema-diagnostics.ts` | 42 | `read/` | 4 | 13 | 1 | 100% / 100% | 29 (0) | 3 | 10 | none |
| `infrastructure/canonical-json.ts` | 63 | `infrastructure/` | 4 | 16 † | 0 | 100% / 100% | 61 (0) | 2 | none | none |
| `application/parse-project-intent.ts` | 40 | `application/` | 4 | 18 | 1 | 100% / 100% | 20 (0) | 4 | none | none |
| `model/node-contract.ts` | 95 | `model/` | 5 | 4 † | 1 | 100% / 100% | 37 (0) | 3 | 15, 10 | 18 |
| `resolve/policy.ts` | 214 | `resolve/` | 5 | 8 | 0 | 100% / 100% | 112 (4) | 7 | 16 | 12, 13, 16, 19 |
| `model/backup.ts` | 40 | `model/` | 5 | 12 | 1 | 100% / 100% | 14 (1) | 1 | 16 | 13 |
| `model/project-intent-queries.ts` | 100 | `model/` | 5 | 19 | 1 | 100% / 100% | 49 (0) | 1 | 13, 10, 17 | 13 |
| `objects/custom.ts` | 208 | `objects/` | 6 | no mutant | 1 | 100% / 100% | none | 7 | 55 | 17 |
| `model/composition-lock.ts` | 63 | `model/` | 6 | 3 † | 1 | 100% / 100% | 61 (0) | 2 | 40 | none |
| `application/check-intent-set.ts` | 171 | `application/` | 6 | 14 | 0 | 100% / 100% | 106 (0) | 6 | 10 | none |
| `read/yaml.ts` | 39 | `read/` | 6 | 21 | 0 | 100% / 100% | 41 (0) | 3 | 10 | none |
| `model/env.ts` | 22 | `model/` | 7 | no mutant | 0 | 100% / 100% | none | 1 | 11 | none |
| `model/vocabularies.ts` | 76 | `model/` | 7 | no mutant | 1 | 100% / 100% | none | 7 | 10 | 13 |
| `model/migration-proof.ts` | 31 | `model/` | 7 | 9 † | 0 | 100% / 100% | 19 (0) | 1 | 55 | none |
| `objects/kubernetes.ts` | 340 | `objects/` | 10 | no mutant | 0 | 100% / 100% | none | 10 | none | 11, 13, 17 |
| `adapters/shared/paths.ts` | 22 | `adapters/` | 10 | 6 † | 0 | 100% / 100% | 8 (0) | 2 | 30 | none |
| `model/images-lock.ts` | 55 | `model/` | 10 | 7 | 2 | 100% / 100% | 50 (0) | 2 | 20, 40 | none |
| `adapters/shared/labels.ts` | 37 | `adapters/` | 10 | 8 † | 0 | 100% / 100% | 10 (0) | 2 | 10 | none |
| `model/hasher.ts` | 5 | `model/` | 11 | no mutant | 0 | 100% / 100% | none | 2 | none | none |
| `objects/deliverable.ts` | 65 | `objects/` | 12 | no mutant | 0 | 100% / 100% | none | 7 | 30 | 17 |
| `model/internal-failure.ts` | 36 | `model/` | 13 | 9 | 1 | 100% / 100% | 7 (0) | 1 | none | none |
| `model/resolution.ts` | 47 | `model/` | 14 | no mutant | 0 | 100% / 100% | none | 4 | 20 | none |
| `model/runtime-profiles.ts` | 126 | `model/` | 15 | 12 | 0 | 100% / 100% | 39 (0) | 9 | 17, 11, 19, 55 | none |
| `model/project-intent.ts` | 347 | `model/` | 17 | 3 † | 3 | 100% / 100% | 182 (0) | 10 | 10, 11, 13, 17 | 11, 12, 13, 17, 18, 19 |
| `model/effective-intent.ts` | 45 | `model/` | 20 | no mutant | 1 | 100% / 100% | none | 1 | 10 | none |
| `model/platform-intent.ts` | 268 | `model/` | 21 | 5 † | 3 | 100% / 100% | 140 (0) | 14 | 17, 55, 13, 14, 16, 19, 60 | 11, 12, 13, 17, 19 |
| `model/diagnostic.ts` | 131 | `model/` | 23 | no mutant | 1 | 100% / 100% | none | 11 | 10 | 13, 17 |
| `model/resolved-deployment.ts` | 756 | `model/` | 23 | 4 † | 2 | 100% / 100% | 294 (0) | 22 | 17, 55, 20, 13, 11, 16, 30 | 11, 12, 13, 16, 17 |

## Concept chapters

How many modules one concept chapter of the layout in issue #358 is spread
over today, by two proxies. The first counts the modules whose comments cite a
section that moves into the chapter; it under-counts, because citing a section
is a convention and 17 modules cite none. The second counts the modules whose
code names the concept's identifiers; it over-counts, because a word such as
`engine`, `api` or `env` is shared by neighbouring concepts. The threshold of
ten hits is the conservative reading of the second. Sorted by that column.

| concept chapter | modules citing a section that moves into it | modules with 1 or more identifier hits | with 3 or more | with 10 or more | folders holding a module with 10 or more | lines in the modules with 10 or more |
|---|--:|--:|--:|--:|---|--:|
| 13 Data | 8 | 36 | 32 | 21 | 5: `adapters/`, `check/`, `model/`, `objects/`, `resolve/` | 5,722 |
| 17 Secrets and access | 13 | 40 | 34 | 20 | 6: `adapters/`, `application/`, `check/`, `model/`, `objects/`, `resolve/` | 6,151 |
| 11 Processes | 9 | 46 | 29 | 13 | 8: `adapters/`, `application/`, `check/`, `lower/`, `model/`, `objects/`, `read/`, `resolve/` | 4,954 |
| 12 Exposure | 1 | 25 | 17 | 12 | 5: `adapters/`, `application/`, `check/`, `model/`, `resolve/` | 4,129 |
| 16 Dependencies | 8 | 30 | 19 | 7 | 4: `adapters/`, `check/`, `model/`, `resolve/` | 2,688 |
| 18 Placement | 2 | 21 | 17 | 7 | 5: `adapters/`, `check/`, `lower/`, `model/`, `resolve/` | 2,512 |
| 19 Observability | 2 | 17 | 14 | 7 | 4: `adapters/`, `check/`, `model/`, `resolve/` | 2,215 |

The modules with ten or more hits, with the number of hits:

- **13 Data**, 21 modules: `adapters/kubernetes/render.ts` (107), `check/composition.ts` (68), `check/project.ts` (49), `model/project-intent.ts` (46), `resolve/volumes.ts` (41), `model/resolved-deployment.ts` (39), `resolve/migration.ts` (29), `model/platform-intent.ts` (22), `adapters/networking/render.ts` (20), `resolve/policy.ts` (18), `adapters/kubernetes/migration.ts` (16), `adapters/shared/holders.ts` (16), `resolve/application.ts` (16), `check/pinned-inputs.ts` (15), `model/diagnostic.ts` (15), `resolve/process.ts` (13), `model/vocabularies.ts` (12), `check/platform.ts` (11), `model/project-intent-queries.ts` (11), `model/backup.ts` (10), `objects/kubernetes.ts` (10).
- **17 Secrets and access**, 20 modules: `adapters/kubernetes/render.ts` (67), `adapters/vso/render.ts` (59), `check/project.ts` (54), `check/union.ts` (53), `check/composition.ts` (49), `model/project-intent.ts` (38), `resolve/secrets.ts` (35), `adapters/vault-policy/render.ts` (31), `model/resolved-deployment.ts` (30), `adapters/shared/holders.ts` (29), `resolve/process.ts` (20), `objects/deliverable.ts` (18), `model/platform-intent.ts` (17), `objects/custom.ts` (17), `application/render-intent-set.ts` (14), `objects/kubernetes.ts` (14), `adapters/vault-policy/job.ts` (13), `model/diagnostic.ts` (12), `adapters/kubernetes/migration.ts` (11), `application/pin-sources.ts` (10).
- **11 Processes**, 13 modules: `adapters/kubernetes/render.ts` (59), `model/project-intent.ts` (53), `resolve/process.ts` (52), `model/resolved-deployment.ts` (45), `lower/project.ts` (41), `check/project.ts` (38), `check/union.ts` (18), `application/resolve-intent-set.ts` (16), `model/platform-intent.ts` (16), `objects/kubernetes.ts` (13), `read/env.ts` (13), `check/assets.ts` (11), `resolve/secrets.ts` (11).
- **12 Exposure**, 12 modules: `resolve/exposure.ts` (97), `model/resolved-deployment.ts` (45), `check/composition.ts` (38), `check/union.ts` (38), `adapters/traefik/render.ts` (34), `check/project.ts` (28), `resolve/policy.ts` (28), `model/platform-intent.ts` (26), `model/project-intent.ts` (23), `resolve/process.ts` (21), `check/platform.ts` (14), `application/pin-sources.ts` (11).
- **16 Dependencies**, 7 modules: `adapters/networking/render.ts` (81), `check/union.ts` (53), `resolve/policy.ts` (35), `check/composition.ts` (32), `model/resolved-deployment.ts` (21), `resolve/application.ts` (15), `resolve/dependencies.ts` (11).
- **18 Placement**, 7 modules: `model/eligibility.ts` (20), `lower/project.ts` (15), `model/node-contract.ts` (12), `model/project-intent.ts` (12), `resolve/process.ts` (12), `adapters/kubernetes/render.ts` (11), `check/project.ts` (11).
- **19 Observability**, 7 modules: `check/composition.ts` (25), `adapters/prometheus/render.ts` (15), `resolve/application.ts` (14), `model/platform-intent.ts` (12), `model/project-intent.ts` (12), `check/project.ts` (11), `resolve/policy.ts` (10).

The frame chapters, by the first proxy alone: the modules whose comments cite
a section that stays in the chapter. Sorted by modules.

| frame chapter | modules citing it | folders | the modules |
|---|--:|---|---|
| 15 Infrastructure Intent | 1 | `model/` | `model/node-contract.ts`, through the Node facts section of chapter 60 |
| 60 Setup | 3 | `adapters/`, `application/`, `model/` | `adapters/flux/source.ts`, `application/compose-estate.ts`, `model/platform-intent.ts` |
| 14 Platform Intent | 4 | `check/`, `model/`, `read/` | `check/composition.ts`, `check/platform.ts`, `model/platform-intent.ts`, `read/platform-intent.ts` |
| 30 Deliverables | 8 | `adapters/`, `application/`, `model/`, `objects/` | `adapters/kubernetes/render.ts`, `adapters/prometheus/render.ts`, `adapters/registry.ts`, `adapters/shared/paths.ts`, `adapters/traefik/render.ts`, `application/render-intent-set.ts`, `model/resolved-deployment.ts`, `objects/deliverable.ts` |
| 40 Composition | 9 | `application/`, `check/`, `cli/`, `model/`, `read/` | `application/compose-estate.ts`, `application/images-lock-shares.ts`, `check/union.ts`, `cli/main.ts`, `model/composition-lock.ts`, `model/fragment.ts`, `model/images-lock.ts`, `model/participants.ts`, `read/participants.ts` |
| 10 Project Intent | 13 | `adapters/`, `application/`, `check/`, `lower/`, `model/`, `read/` | `adapters/shared/labels.ts`, `application/check-intent-set.ts`, `check/project.ts`, `lower/project.ts`, `model/diagnostic.ts`, `model/effective-intent.ts`, `model/node-contract.ts`, `model/project-intent-queries.ts`, `model/project-intent.ts`, `model/vocabularies.ts`, `read/project-intent.ts`, `read/schema-diagnostics.ts`, `read/yaml.ts` |
| 55 Delivery | 15 | `adapters/`, `application/`, `model/`, `objects/` | `adapters/flux/source.ts`, `adapters/kubernetes/capacity.ts`, `adapters/kubernetes/migration.ts`, `adapters/kubernetes/render.ts`, `adapters/vso/render.ts`, `application/compose-estate.ts`, `application/pin-sources.ts`, `application/render-intent-set.ts`, `model/migration-proof.ts`, `model/pin-annotations.ts`, `model/platform-intent.ts`, `model/resolved-deployment.ts`, `model/revision.ts`, `model/runtime-profiles.ts`, `objects/custom.ts` |
| 20 Resolved Deployment | 17 | `adapters/`, `application/`, `check/`, `model/`, `read/`, `resolve/` | `adapters/kubernetes/render.ts`, `application/pin-sources.ts`, `application/resolve-intent-set.ts`, `check/pinned-inputs.ts`, `model/cluster-state.ts`, `model/images-lock.ts`, `model/reconcile-units.ts`, `model/resolution.ts`, `model/resolved-deployment.ts`, `model/revision.ts`, `read/pinned-inputs.ts`, `resolve/application.ts`, `resolve/process.ts`, `resolve/provenance.ts`, `resolve/secrets.ts`, `resolve/union.ts`, `resolve/volumes.ts` |

Chapter 00 is cited by no module. The Derived mechanics section of chapter 20,
which four modules cite, counts for chapter 20 here, although the layout
leaves chapter 20 with stage-wide rules only and spreads that section's
content over the concept chapters.

## Seams

Every type under `src/` that one module declares for another to supply, with
its implementations. Sorted by the number of implementations.

| seam | declared at | implementations under `src/` | implementations under `test/` | consumers |
|---|---|---|---|---|
| `PinnedInputSet`, `FragmentSource`, `FragmentPublisher`, `DeliverableWriter` | named in the Ports table of [`docs/architecture.md`](../architecture.md#ports); no declaration under `src/` | 0 | 0 | 0. `grep -rnE "PinnedInputSet\|FragmentSource\|FragmentPublisher\|DeliverableWriter" src test scripts` matches nothing |
| `Hasher` | `src/model/hasher.ts:5` | 1: `sha256Hasher`, `src/infrastructure/sha256-hasher.ts:7` | 0: every test that passes a hash passes `sha256Hasher` | 11 modules import the type |
| `Serializer` | `src/application/render-intent-set.ts:28` | 1: `serialize`, `src/infrastructure/serializer.ts` | 2 inline stubs, `test/model/render.test.ts:305` and `:404` | 3 modules in `application/` |
| `World` (the clock and the toolkit's version) | `src/cli/main.ts:49` | 1: an object literal in `src/cli/index.ts` | 1: `test/cli/main.test.ts:31` | `main` in `src/cli/main.ts` |
| the process boundary, `perform` | `src/cli/boundary.ts` | 1 | 0 | `src/cli/index.ts` |
| `Adapter` | `src/adapters/registry.ts:27` | 6, the entries of `ADAPTERS`: `kubernetes`, `networking`, `prometheus`, `traefik`, `vso`, `vault-policy` | probes passed through the `adapters` option of `renderIntentSet`, in `test/model/render.test.ts` | `application/render-intent-set.ts` |
| `Invariant` | `src/check/union.ts:42` | 14, the entries of `INVARIANTS` at `src/check/union.ts:327` | 0 | `unionDiagnostics` in the same module |

Three facts sit beside the table. `src/adapters/flux/source.ts` is a seventh
directory under `adapters/` that is not an entry of `ADAPTERS`:
`application/pin-sources.ts` calls it directly. The adapter names are a closed
list, `ADAPTERS` in `src/model/resolved-deployment.ts:85`, while
[`docs/architecture.md`](../architecture.md#ports) describes the adapter port
as a surface an out-of-tree adapter pins
([0037](../adr/model/0037-six-registered-adapters-satisfy-one-port.md)).
`canonicalJson` in `src/infrastructure/canonical-json.ts` is not behind a
seam: `src/cli/main.ts` and `src/infrastructure/sha256-hasher.ts` import it
directly.

## Gates

The twenty gates of [`docs/architecture.md`](../architecture.md#gates), over
the whole history of the `CI` workflow. Sorted by the number of pull requests
the gate turned red on their own change, then by the job's cost descending. A
job's median and share are over the 30 most recent completed runs. The nine
contract gates share the `Contracts` job, so its 18.0 seconds and 0.3% are
counted once for all nine. A completed run is a step that ended in success or
failure; code scanning counts one per language job.

| gate | command | CI job | job's median seconds per run | job's share of CI minutes | the gate's own step, median seconds in CI | the command, seconds locally | completed runs in CI | red runs | pull requests it turned red on their own change, later turned green by a commit | other red runs |
|---|---|---|--:|--:|--:|--:|--:|--:|---|---|
| lint | `npm run lint` | `Lint` | 26.0 | 0.5% | 14 | 8.61 | 612 | 0 | 0 | none |
| package contents | `node scripts/check-package-contents.ts` | `Package contents` | 18.0 | 0.3% | 1 | 1.78 | 536 | 0 | 0 | none in its own job; its test turned #237 red once in the `Tests` job |
| decisions | `npm run lint:adrs` | `Contracts` | 18.0 | 0.3% | 0 | 0.53 | 612 | 0 | 0 | none |
| links | `npm run lint:links` | `Contracts` | 18.0 | 0.3% | 0 | 1.19 | 586 | 5 | 0 | 1 red push to `main` (2026-09-17, `3902055`), which 4 pull request runs on 3 other branches inherited |
| manifests | `npm run lint:manifests` | `Contracts` | 18.0 | 0.3% | 2 | 2.71 | 581 | 0 | 0 | none |
| requirements | `npm run lint:requirements` | `Contracts` | 18.0 | 0.3% | 0 | 1.42 | 529 | 0 | 0 | none |
| rules | `npm run lint:rules` | `Contracts` | 18.0 | 0.3% | 0 | 1.75 | 512 | 0 | 0 | none |
| docs | `npm run lint:docs` | `Contracts` | 18.0 | 0.3% | 0 | 0.36 | 524 | 0 | 0 | none |
| agents | `npm run lint:agents` | `Contracts` | 18.0 | 0.3% | 0 | 0.64 | 438 | 0 | 0 | none |
| meaning | `npm run lint:meaning` | `Contracts` | 18.0 | 0.3% | 0 | 1.46 | 452 | 0 | 0 | none |
| format | `npm run format:check` | `Format` | 17.0 | 0.3% | 4.5 | 2.23 | 611 | 0 | 0 | none |
| boundaries | `npm run lint:boundaries` | `Architecture` | 14.5 | 0.2% | 1 | 1.62 | 585 | 0 | 0 | none |
| actionlint | a pinned `actionlint` binary | `Actionlint` | 14.0 | 0.2% | 1 | not run | 611 | 2 | 0 | 2 red runs, both a failed download of the binary, green on a rerun of the same commit |
| secret scan | `npm run lint:secrets` | `Secret scan` | 14.0 | 0.2% | 1 | 1.64 | 611 | 6 | 0 | 6 red runs on 2026-09-07, the first day, all for a missing licence of the scanning action; no finding |
| codes | `npm run lint:codes` | `Contracts` | 18.0 | 0.3% | 0 | 2.01 | 487 | 2 | 1 (#211) | none |
| types | `npm run typecheck` | `Typecheck` | 16.0 | 0.3% | 4 | 2.06 | 611 | 1 | 1 (#163) | none |
| code scanning | CodeQL, three languages | `Code scanning`, three jobs | 233.5 | 3.9% | 177 | not run | 1,472 | 9 | 3 (#136 and #220 in Java under `emf/`, #228 in `src/cli/main.ts`) | 6 red jobs on two closed Dependabot pull requests, a CodeQL version mismatch |
| model-driven build | `./mvnw -B -ntp verify` in `emf/` | `Model-driven build` | 695.0 | 11.4% | 682.5 | not run | 480 | 11 | 4 (#135, #173, #211, #227) | 3 red runs: #289 and a Renovate branch with the same parity-output failure in the same minute, and one failed dependency resolution on a Renovate branch |
| tests | `npm run test:coverage` | `Tests` | 70.0 | 1.1% | 58 | 15.8 | 609 | 10 | 4 (#65, #126, #211, #237) | none; the coverage thresholds never failed a run |
| mutation | `npm run test:mutation` | `Mutation`, six shards | 4,797.5 | 79.8% | six steps, 755.5 each | not run | 360 single jobs, 376 shard jobs | 26 | 7 (#135, #143, #163, #227, #250, #278, #279); #319 is open and still red | 12 red jobs on pull request branches that had not changed the file holding the survivor and 2 red pushes to `main`, in two episodes (2026-10-01 and 2026-10-06); 2 of the 12 were green on a rerun of the same commit; 1 sandbox copy failure (#121) |

Three workflows run beside `CI`. `PR Title Validation`, which enforces
RULE-056 and RULE-057, completed 436 runs with no red run; its one run marked
failed was a job cancelled at its timeout. `Repository Hygiene` completed 463
runs with one red run, a `git diff` error on a release-please branch on
2026-09-07. `Claim Issue` does not gate.

### Red runs of the test gate

Every test file that failed in the `Tests` job, or in the `Test` step of the
single job the workflow had before 2026-09-14.

| test file | pull request | red runs | what the failing test holds |
|---|---|--:|---|
| `test/adr-contract.test.ts` | #126 | 3 | no record number is used in both the root register and the register under `emf/` |
| `test/packed-command.test.ts` | #237 | 3 | the packed tarball installs and runs the command ([0089](../adr/architecture/0089-the-package-ships-the-command-built-when-it-is-packed.md)) |
| `test/emdash.test.ts` | #126 | 2 | RULE-058 |
| `test/codes-lint.test.ts` | #211 | 2 | RULE-048: a code was pending while a test already exercised it |
| `test/change-buckets.test.ts` | #237 | 2 | RULE-065: `tsconfig.build.json` fell into no bucket |
| `test/package-contents-contract.test.ts` | #237 | 1 | RULE-055, run over this repository |
| `test/manifest-contract.test.ts` | #65 | 1 | the manifest gate's entry-point test, which expected `kubeconform` to be absent and found it in CI |

No file under `test/model/`, `test/application/`, `test/adapters/` or
`test/cli/` appears. The coverage thresholds never failed a run: no log holds
vitest's threshold error.

### Red runs of the mutation gate

The 26 red mutation jobs, by cause. Survivors are counted from the
`[Survived]` and `[NoCoverage]` entries of each job's log.

| cause | pull request or branch | red jobs | survivors | files holding them, at the path they had then |
|---|---|--:|--:|---|
| the branch's own change, later green | #135 | 2 | 114 | `src/wire/resolved-deployment/schema.ts` (92), `src/wire/node-contract/schema.ts` (22) |
| the branch's own change, later green | #143 | 2 | 98 | `src/wire/project-intent/rules.ts` (32), `env.ts` (24), `map.ts` (20), `src/domain/project-intent/lower.ts` (20), `src/application/parse-project-intent.ts` (2) |
| the branch's own change, later green | #163 | 2 | 11, then 16 | `src/wire/resolved-deployment/schema.ts`, `src/wire/project-intent/rules.ts`, `map.ts` |
| the branch's own change, later green | #278 | 1 | 7 | `src/resolve/dependencies.ts` (6), `src/resolve/policy.ts` (1) |
| the branch's own change, later green | #279 | 1 | 2 | `src/application/resolve-intent-set.ts` |
| the branch's own change, later green | #227 | 1 | 1 | `src/read/yaml.ts` |
| the branch's own change, later green | #250 | 1 | 1 | `src/application/compose-estate.ts` |
| the branch's own change, still red | #319, open | 1 | 3 | `src/check/composition.ts` |
| not the branch's change, 2026-10-01 | `main` once; release-please and Renovate twice each; #207, #208, #210 once each; #213 twice | 10 | 1 | `src/model/resolved-deployment.ts`. #207 and #208 passed on a rerun of the same commit |
| not the branch's change, 2026-10-06 and 2026-10-07 | `main`, release-please, Renovate and #281, once each | 4 | 3 | `src/check/union.ts`. The red push to `main` is the merge of #278, whose own last run was green |
| sandbox | #121 | 1 | none | Stryker could not copy the `.claude/skills` symlink into its sandbox |

### Mutation shards

The six shards over the 30 most recent completed runs, with what each mutated
in run `37927341367`. Sorted by median.

| shard | modules | mutants | median minutes | longest, minutes | three largest modules, by mutants |
|--:|--:|--:|--:|--:|---|
| 5 | 15 | 1,321 | 17.8 | 20.0 | `check/project.ts` (481), `resolve/process.ts` (263), `adapters/networking/render.ts` (185) |
| 4 | 14 | 1,288 | 16.7 | 21.6 | `check/union.ts` (536), `model/project-intent.ts` (182), `application/images-lock-shares.ts` (144) |
| 1 | 14 | 1,110 | 15.7 | 17.9 | `application/compose-estate.ts` (378), `read/env.ts` (194), `application/resolve-intent-set.ts` (157) |
| 2 | 13 | 1,043 | 12.9 | 16.6 | `adapters/kubernetes/render.ts` (539), `lower/project.ts` (125), `application/check-intent-set.ts` (106) |
| 6 | 9 | 1,059 | 9.7 | 12.6 | `check/composition.ts` (381), `cli/main.ts` (353), `model/eligibility.ts` (89) |
| 3 | 13 | 938 | 9.4 | 12.2 | `model/resolved-deployment.ts` (294), `model/platform-intent.ts` (140), `resolve/application.ts` (138) |

By folder, the mutants are `check/` 1,561, `adapters/` 1,288, `model/` 1,281,
`application/` 970, `resolve/` 794, `cli/` 356, `read/` 292, `lower/` 125 and
`infrastructure/` 92.

## Architecture records

The 14 records
[issue #346](https://github.com/JorisJonkers-dev/deploy-kit/issues/346) left
untouched: every record in `docs/adr/architecture/` except
[0068](../adr/architecture/0068-two-implementations-meet-at-the-parity-table.md),
which leaves with `emf/`. Together they are 1,070 lines. Sorted by pull
requests turned red, then by files citing the record. A gate's seconds are the
job's median per run from [Gates](#gates).

| record | claim | lines | files citing it | of which code, tests, scripts or workflows | rule-ledger rows that enforce it | gate and its job's median seconds | red in CI |
|---|---|--:|--:|--:|---|---|---|
| [0059](../adr/architecture/0059-failures-are-a-diagnostic-list.md) a failure is a coded diagnostic in a list | settled | 70 | 0 | 0 | RULE-074; RULE-047 is pending on a closed ticket | lint, 26.0 | never, in 612 runs |
| [0062](../adr/architecture/0062-tests-run-in-process-on-vitest.md) tests run in-process on Vitest | settled | 71 | 1 | 0 | RULE-027 to RULE-033 | lint, 26.0; tests, 70.0 | never, in 612 and 609 runs |
| [0056](../adr/architecture/0056-the-compiler-is-a-chain-of-typed-models.md) the compiler is a chain of typed models | open | 93 | 2 | 1 | RULE-001, RULE-003, RULE-005 to RULE-008 | boundaries, 14.5 | never, in 585 runs |
| [0057](../adr/architecture/0057-the-authored-shape-is-the-source-model.md) the authored shape is the source model | settled | 82 | 2 | 1 | RULE-002, RULE-043, RULE-073, and two entries of RULE-022 | boundaries, 14.5; lint, 26.0; tests, 70.0 | never |
| [0058](../adr/architecture/0058-every-step-links-through-one-trace.md) every step links through one trace | open | 90 | 2 | 0 | RULE-004, RULE-034, RULE-045, and five entries of RULE-022 | boundaries, 14.5; tests, 70.0 | never. `grep -rniE "\btrace" src` matches nothing |
| [0061](../adr/architecture/0061-the-process-lives-in-one-boundary-file.md) the process lives in one boundary file | settled | 49 | 2 | 1 | RULE-010 to RULE-013 | boundaries, 14.5; lint, 26.0 | never |
| [0088](../adr/architecture/0088-the-committed-schemas-and-their-corpus-are-the-contract.md) the committed schemas and their corpus are the contract | settled | 80 | 2 | 1 | none; REQ-041 and REQ-042 of the behaviour ledger | tests, 70.0 | never, in 609 runs |
| [0065](../adr/architecture/0065-a-behaviour-ledger-names-what-a-test-proves.md) a behaviour ledger names what a test proves | settled | 75 | 3 | 1 | RULE-052 | requirements, in `Contracts`, 18.0 | never, in 529 runs |
| [0066](../adr/architecture/0066-every-enforced-rule-has-an-id-a-row-and-a-fixture.md) every enforced rule has an id, a row and a fixture | settled | 98 | 5 | 1 | RULE-054 | rules, in `Contracts`, 18.0 | never, in 512 runs |
| [0060](../adr/architecture/0060-boundaries-enforced-on-the-graph.md) boundaries are enforced on the graph | settled | 77 | 8 | 1 | all 19 `depcruise:` rows, and the `Pipeline Complete` job | boundaries, 14.5 | never, in 585 runs |
| [0064](../adr/architecture/0064-a-gate-is-a-script-or-a-named-job.md) a gate is a script or a named job | open | 69 | 8 | 4 | RULE-059 | tests, 70.0 | never, in 609 runs |
| [0089](../adr/architecture/0089-the-package-ships-the-command-built-when-it-is-packed.md) the package ships the command, built when it is packed | settled | 84 | 1 | 0 | RULE-055; REQ-046 | package contents, 18.0; tests, 70.0 | 1 pull request, #237, which added the record: 4 red runs |
| [0067](../adr/architecture/0067-every-spec-error-code-is-proved-by-a-test.md) every spec error code is proved by a test | settled | 57 | 1 | 0 | RULE-048 | codes, in `Contracts`, 18.0 | 1 pull request, #211: 2 red runs |
| [0063](../adr/architecture/0063-coverage-and-mutation-are-ratchets.md) coverage and mutation are ratchets | settled | 75 | 6 | 1 | RULE-040, RULE-064 | tests, 70.0; mutation, 4,797.5, which is 79.8% of CI minutes | coverage never; mutation on 7 pull requests |

Statements in these records, and in the documents they point at, that no
longer match the tree are listed with their lines under
[Statements that differ from the tree](#statements-that-differ-from-the-tree).

## Rules

Every row of [`docs/architecture-rules.md`](../architecture-rules.md). Sorted
with the two pending rows first, then by the number of pull requests the rule
turned red on their own change, then by the cost of the job that runs it
descending. `Never, in N runs` counts the completed runs of the step that runs
the enforcer. The enforcer's own local time is ESLint's per-rule timing for an
`eslint:` row, the whole cruise for a `depcruise:` row and the script for an
`npm:` row. A fixture's time is shared by every row that names the same file.

| rule | family | enforced by | CI job | job's median seconds per run | the enforcer alone, locally | fixture and its local run time | red in CI |
|---|---|---|---|--:|--:|---|---|
| RULE-046 | registry | pending on #44, which is closed | none | n/a | n/a | n/a | nothing enforces it |
| RULE-047 | diagnostics | pending on #38, which is closed | none | n/a | n/a | n/a | nothing enforces it |
| RULE-062 | gates | `file:.github/codeql/codeql-config.yml` | `Code scanning` | 233.5 | n/a | `test/emf-wiring.test.ts` (0.1 s) | never, in 1,472 runs |
| RULE-032 | tests | `file:test/setup.ts` | `Tests` | 70.0 | n/a | `test/harness.test.ts` (2.2 s) | never, in 609 runs |
| RULE-034 | tests | `file:test/model/render.test.ts` | `Tests` | 70.0 | the fixture is the enforcer | `test/model/render.test.ts` (0.8 s) | never, in 609 runs |
| RULE-040 | toolchain | `file:vitest.config.ts` | `Tests` | 70.0 | n/a | `test/harness.test.ts` (2.2 s) | never, in 609 runs |
| RULE-043 | toolchain | `file:src/model/json-schema.ts` | `Tests` | 70.0 | n/a | `test/model/descriptor.test.ts` (0.0 s) | never, in 609 runs |
| RULE-044 | cli | `file:test/cli/conventions.test.ts` | `Tests` | 70.0 | the fixture is the enforcer | `test/cli/conventions.test.ts` (3.3 s) | never, in 609 runs |
| RULE-045 | registry | `file:test/adapters/contract.test.ts` | `Tests` | 70.0 | the fixture is the enforcer | `test/adapters/contract.test.ts` (0.1 s) | never, in 609 runs |
| RULE-059 | gates | `file:test/pipeline-wiring.test.ts` | `Tests` | 70.0 | the fixture is the enforcer | `test/pipeline-wiring.test.ts` (0.0 s) | never, in 609 runs |
| RULE-061 | gates | `file:test/emf-wiring.test.ts` | `Tests` | 70.0 | the fixture is the enforcer | `test/emf-wiring.test.ts` (0.1 s) | never, in 609 runs |
| RULE-066 | gates | `file:scripts/pr-report.ts` | `Tests` | 70.0 | n/a | `test/pr-report.test.ts` (9.7 s) | never, in 609 runs |
| RULE-067 | gates | `file:scripts/lib/rc-version.ts` | `Tests` | 70.0 | n/a | `test/rc-version.test.ts` (0.0 s) | never, in 609 runs |
| RULE-071 | dependencies | `file:test/supply-chain.test.ts` | `Tests` | 70.0 | the fixture is the enforcer | `test/supply-chain.test.ts` (0.0 s) | never, in 609 runs |
| RULE-072 | dependencies | `file:test/supply-chain.test.ts` | `Tests` | 70.0 | the fixture is the enforcer | `test/supply-chain.test.ts` (0.0 s) | never, in 609 runs |
| RULE-012 | purity | `eslint:no-restricted-syntax` | `Lint` | 26.0 | 0.6 ms | `test/seams.test.ts` (2.5 s) | never, in 612 runs |
| RULE-013 | purity | `eslint:no-restricted-properties` | `Lint` | 26.0 | 1.7 ms | `test/seams.test.ts` (2.5 s) | never, in 612 runs |
| RULE-019 | graph | `eslint:deploy-kit/no-computed-dynamic-import` | `Lint` | 26.0 | 0.0 ms | `test/code-rules.test.ts` (2.4 s) | never, in 612 runs |
| RULE-023 | dependencies | `eslint:deploy-kit/node-builtin-prefix` | `Lint` | 26.0 | 1.0 ms | `test/code-rules.test.ts` (2.4 s) | never, in 612 runs |
| RULE-024 | naming | `eslint:deploy-kit/kebab-case-filename` | `Lint` | 26.0 | 0.6 ms | `test/code-rules.test.ts` (2.4 s) | never, in 612 runs |
| RULE-025 | naming | `eslint:@typescript-eslint/naming-convention` | `Lint` | 26.0 | 95.5 ms | `test/seams.test.ts` (2.5 s) | never, in 612 runs |
| RULE-026 | naming | `eslint:@typescript-eslint/consistent-type-imports` | `Lint` | 26.0 | 4.2 ms | `test/seams.test.ts` (2.5 s) | never, in 612 runs |
| RULE-027 | tests | `eslint:vitest/no-focused-tests` | `Lint` | 26.0 | 25.2 ms | `test/harness.test.ts` (2.2 s) | never, in 612 runs |
| RULE-028 | tests | `eslint:vitest/no-disabled-tests` | `Lint` | 26.0 | 11.0 ms | `test/harness.test.ts` (2.2 s) | never, in 612 runs |
| RULE-029 | tests | `eslint:vitest/expect-expect` | `Lint` | 26.0 | 13.3 ms | `test/harness.test.ts` (2.2 s) | never, in 612 runs |
| RULE-030 | tests | `eslint:no-restricted-globals` | `Lint` | 26.0 | 0.8 ms | `test/harness.test.ts` (2.2 s) | never, in 612 runs |
| RULE-031 | tests | `eslint:no-restricted-imports` | `Lint` | 26.0 | 1.0 ms | `test/harness.test.ts` (2.2 s) | never, in 612 runs |
| RULE-033 | tests | `eslint:deploy-kit/no-test-imports-test` | `Lint` | 26.0 | 0.3 ms | `test/code-rules.test.ts` (2.4 s) | never, in 612 runs |
| RULE-035 | toolchain | `eslint:@typescript-eslint/ban-ts-comment` | `Lint` | 26.0 | 4.4 ms | `test/eslint-rules.test.ts` (1.9 s) | never, in 612 runs |
| RULE-036 | toolchain | `eslint:@typescript-eslint/no-explicit-any` | `Lint` | 26.0 | 0.6 ms | `test/eslint-rules.test.ts` (1.9 s) | never, in 612 runs |
| RULE-037 | toolchain | `eslint:@typescript-eslint/no-unused-vars` | `Lint` | 26.0 | 16.7 ms | `test/eslint-rules.test.ts` (1.9 s) | never, in 612 runs |
| RULE-038 | toolchain | `eslint:@typescript-eslint/restrict-template-expressions` | `Lint` | 26.0 | 4.7 ms | `test/eslint-rules.test.ts` (1.9 s) | never, in 612 runs |
| RULE-039 | toolchain | `file:eslint.config.js` | `Lint` | 26.0 | the two presets | `test/eslint-rules.test.ts` (1.9 s) | never, in 612 runs |
| RULE-041 | toolchain | `eslint:no-restricted-exports` | `Lint` | 26.0 | 0.8 ms | `test/seams.test.ts` (2.5 s) | never, in 612 runs |
| RULE-042 | toolchain | `eslint:deploy-kit/esm-only` | `Lint` | 26.0 | 0.1 ms | `test/code-rules.test.ts` (2.4 s) | never, in 612 runs |
| RULE-073 | toolchain | `eslint:deploy-kit/no-unstated-rule` | `Lint` | 26.0 | 0.5 ms | `test/code-rules.test.ts` (2.4 s) | never, in 612 runs |
| RULE-074 | diagnostics | `eslint:deploy-kit/no-bare-throw` | `Lint` | 26.0 | 0.0 ms | `test/code-rules.test.ts` (2.4 s) | never, in 612 runs |
| RULE-049 | gates | `npm:lint:adrs` | `Contracts` | 18.0 | 0.53 s | `test/adr-lint-negative.test.ts` (3.0 s) | never, in 612 runs |
| RULE-050 | gates | `npm:lint:links` | `Contracts` | 18.0 | 1.19 s | `test/link-contract.test.ts` (2.0 s) | no pull request's own change; 1 red push to `main`, inherited by 4 pull request runs |
| RULE-051 | gates | `npm:lint:manifests` | `Contracts` | 18.0 | 2.71 s | `test/manifest-contract.test.ts` (1.1 s) | never, in 581 runs |
| RULE-052 | gates | `npm:lint:requirements` | `Contracts` | 18.0 | 1.42 s | `test/requirements-lint-negative.test.ts` (2.0 s) | never, in 529 runs |
| RULE-053 | gates | `npm:lint:docs` | `Contracts` | 18.0 | 0.36 s | `test/docs-contract.test.ts` (0.8 s) | never, in 524 runs |
| RULE-054 | gates | `npm:lint:rules` | `Contracts` | 18.0 | 1.75 s | `test/rules-lint-negative.test.ts` (6.8 s) | never, in 512 runs |
| RULE-068 | gates | `npm:lint:meaning` | `Contracts` | 18.0 | 1.46 s | `test/meaning-lint-negative.test.ts` (2.8 s) | never, in 452 runs |
| RULE-069 | gates | `npm:lint:agents` | `Contracts` | 18.0 | 0.64 s | `test/agents-contract.test.ts` (0.3 s) | never, in 438 runs |
| RULE-070 | gates | `npm:lint:adrs` | `Contracts` | 18.0 | 0.53 s | `test/adr-lint-negative.test.ts` (3.0 s) | never, in 612 runs |
| RULE-001 | layering | `depcruise:model-is-pure` | `Architecture` | 14.5 | 1.6 s, all 19 rules together | `test/boundary-contract.test.ts` (14.6 s) | never, in 585 runs |
| RULE-002 | layering | `depcruise:zod-is-the-metamodel-and-the-reader` | `Architecture` | 14.5 | 1.6 s, all 19 rules together | `test/boundary-contract.test.ts` (14.6 s) | never, in 585 runs |
| RULE-003 | layering | `depcruise:no-step-imports-another-step` | `Architecture` | 14.5 | 1.6 s, all 19 rules together | `test/boundary-contract.test.ts` (14.6 s) | never, in 585 runs |
| RULE-004 | layering | `depcruise:objects-are-data` | `Architecture` | 14.5 | 1.6 s, all 19 rules together | `test/boundary-contract.test.ts` (14.6 s) | never, in 585 runs |
| RULE-005 | layering | `depcruise:adapters-do-not-read-each-other` | `Architecture` | 14.5 | 1.6 s, all 19 rules together | `test/boundary-contract.test.ts` (14.6 s) | never, in 585 runs |
| RULE-006 | layering | `depcruise:application-takes-ports-not-adapters` | `Architecture` | 14.5 | 1.6 s, all 19 rules together | `test/boundary-contract.test.ts` (14.6 s) | never, in 585 runs |
| RULE-007 | layering | `depcruise:infrastructure-implements-ports-only` | `Architecture` | 14.5 | 1.6 s, all 19 rules together | `test/boundary-contract.test.ts` (14.6 s) | never, in 585 runs |
| RULE-008 | layering | `depcruise:nothing-depends-on-the-cli` | `Architecture` | 14.5 | 1.6 s, all 19 rules together | `test/boundary-contract.test.ts` (14.6 s) | never, in 585 runs |
| RULE-009 | layering | `depcruise:shipped-code-imports-no-test-or-build-output` | `Architecture` | 14.5 | 1.6 s, all 19 rules together | `test/boundary-contract.test.ts` (14.6 s) | never, in 585 runs |
| RULE-010 | purity | `depcruise:the-chain-reads-nothing-ambient` | `Architecture` | 14.5 | 1.6 s, all 19 rules together | `test/boundary-contract.test.ts` (14.6 s) | never, in 585 runs |
| RULE-011 | purity | `depcruise:adapters-render-only` | `Architecture` | 14.5 | 1.6 s, all 19 rules together | `test/boundary-contract.test.ts` (14.6 s) | never, in 585 runs |
| RULE-014 | graph | `depcruise:no-circular` | `Architecture` | 14.5 | 1.6 s, all 19 rules together | `test/boundary-contract.test.ts` (14.6 s) | never, in 585 runs |
| RULE-015 | graph | `depcruise:no-orphans` | `Architecture` | 14.5 | 1.6 s, all 19 rules together | `test/boundary-contract.test.ts` (14.6 s) | never, in 585 runs |
| RULE-016 | graph | `depcruise:unreachable-from-an-entry-point` | `Architecture` | 14.5 | 1.6 s, all 19 rules together | `test/boundary-contract.test.ts` (14.6 s) | never, in 585 runs |
| RULE-017 | graph | `depcruise:no-unresolvable-import` | `Architecture` | 14.5 | 1.6 s, all 19 rules together | `test/boundary-contract.test.ts` (14.6 s) | never, in 585 runs |
| RULE-018 | graph | `depcruise:no-circular-folders` | `Architecture` | 14.5 | 1.6 s, all 19 rules together | `test/boundary-contract.test.ts` (14.6 s) | never, in 585 runs |
| RULE-020 | dependencies | `depcruise:no-dev-dependency-in-src` | `Architecture` | 14.5 | 1.6 s, all 19 rules together | `test/boundary-contract.test.ts` (14.6 s) | never, in 585 runs |
| RULE-021 | dependencies | `depcruise:not-to-deprecated-core` | `Architecture` | 14.5 | 1.6 s, all 19 rules together | `test/boundary-contract.test.ts` (14.6 s) | never, in 585 runs |
| RULE-022 | dependencies | `depcruise:no-denied-dependency` | `Architecture` | 14.5 | 1.6 s, all 19 rules together | `test/boundary-contract.test.ts` (14.6 s) | never, in 585 runs |
| RULE-056 | gates | `file:scripts/check-pr-title.ts` | `PR Title Validation` workflow | 14.0 | n/a | `test/pr-title-contract.test.ts` (2.0 s) | never, in 436 runs |
| RULE-057 | gates | `file:scripts/check-pr-title.ts` | `PR Title Validation` workflow | 14.0 | n/a | `test/pr-title-contract.test.ts` (2.0 s) | never, in 436 runs |
| RULE-060 | gates | `npm:lint:secrets` | `Secret scan` | 14.0 | 1.64 s | `test/secret-scan-contract.test.ts` (1.1 s) | never, in 611 runs |
| RULE-058 | gates | `file:test/emdash.test.ts` | `Tests` | 70.0 | the fixture is the enforcer | `test/emdash.test.ts` (1.2 s) | 1 pull request (#126), 2 red runs, later green |
| RULE-065 | gates | `file:scripts/lib/change-buckets.ts` | `Tests` | 70.0 | n/a | `test/change-buckets.test.ts` (0.2 s) | 1 pull request (#237), 2 red runs, later green |
| RULE-048 | diagnostics | `npm:lint:codes` | `Contracts` | 18.0 | 2.01 s | `test/codes-lint.test.ts` (4.6 s) | 1 pull request (#211), 2 red runs, later green |
| RULE-055 | gates | `file:scripts/check-package-contents.ts` | `Package contents` | 18.0 | 1.78 s | `test/package-contents-contract.test.ts` (11.5 s) | 1 pull request (#237), 1 red run of its test, later green |
| RULE-063 | gates | `file:.github/workflows/codeql.yml` | `Code scanning` | 233.5 | n/a | `test/pipeline-wiring.test.ts` (0.0 s) | 3 pull requests (#136, #220, #228), later green |
| RULE-064 | gates | `file:stryker.config.json` | `Mutation`, six shards | 4,797.5 | six shards | `test/mutation-contract.test.ts` (0.1 s) | 7 pull requests, 10 red runs, later green; 1 open; 14 red jobs the branch did not cause |

The 29 fixture files, by rows served: `test/boundary-contract.test.ts` serves
19 rows and runs for 14.6 seconds, `test/code-rules.test.ts` 7 rows and 2.4
seconds, `test/harness.test.ts` 7 rows and 2.2 seconds, `test/seams.test.ts`
5 rows and 2.5 seconds, and `test/eslint-rules.test.ts` 5 rows and 1.9
seconds. The slowest fixtures that serve one row are
`test/package-contents-contract.test.ts` (11.5 seconds),
`test/pr-report.test.ts` (9.7) and `test/rules-lint-negative.test.ts` (6.8).

## Residue of the closed architecture rework

[Issue #350](https://github.com/JorisJonkers-dev/deploy-kit/issues/350) closed
the architecture rework (issues #326, #327 and #328) into the map and folded
issue #329. What it left as input, with what the tree holds today.

| residue | from | state at `4c12851` |
|---|---|---|
| an audit of `src/` at the scale of [0001](../adr/model/0001-estate-scale-and-ownership.md), not through the course's transformation lens | #350, replacing step 4 of #327 | this file |
| the 14 architecture records issue #346 left open | #350 | [Architecture records](#architecture-records) |
| the earlier local plan, `docs/specs/transformation-architecture.md` | #326 | not in the tracked tree. Issue #326 says it was written against 3,603 lines of `src/`; the tree is 12,463 |
| where Infrastructure Intent is read, modelled and checked | #328 | no identifier `InfrastructureIntent` under `src/`. The node contract it promotes is `model/node-contract.ts` (95 lines, imported by 5 modules), read by `read/pinned-inputs.ts` and checked in `check/pinned-inputs.ts` |
| which step derives the Stable Address | #328 | no identifier `StableAddress` under `src/`. Addresses are built by `addressOf` and `surfaceAddress` in `model/runtime-profiles.ts`, which 15 modules import |
| which step derives the Move, and which adapter renders it | #328 | no identifier `MovePolicy` or `moveMethod` under `src/`, and no move adapter |
| the oracles the parity table gains | #328 | the table binds two implementations and leaves with `emf/`; issue #346 keeps `resolved.json`, the rendered tree and the diagnostics files |
| the boundary rows of the rule ledger that change | #328 | none has changed: `.dependency-cruiser.cjs` was last changed on 2026-09-30 and `docs/architecture-rules.md` on 2026-10-06, and issue #328 was opened on 2026-10-09 |
| the behaviour-ledger rows that change: REQ-031, REQ-034, REQ-039, REQ-040, REQ-044 | #329, folded | all five rows are in `docs/requirements.md`, which holds 54 rows, unchanged |
| whether the behaviour ledger may hold pending rows | #329, folded | undecided. `scripts/lint-requirements.ts` has no pending form |
| read the composition checks from the Effective Intent | #276, open | `check/composition.ts` (510 lines) imports the authored `ProjectIntentDocument` and does not import `model/effective-intent.ts` |
| `forwardAuth` becomes a reference to a provider | #52, salvage | `forwardAuth` is free text at `src/model/platform-intent.ts:87`, and three modules name it |
| `E_RELEASE_UNIT_NO_READINESS` needs a home | #44, salvage | raised by one entry of `INVARIANTS`, `src/check/union.ts:583` |

**The concepts awaiting placement.** Issue #350 names the placement of the
concepts from issues #351, #355, #356 and #357 beside the Moves as residue.
For each, the number of modules under `src/` whose code, with comments
stripped, names its identifier.

| concept | decided on | identifier searched | modules naming it |
|---|---|---|--:|
| Infrastructure Intent | #323 | `InfrastructureIntent` | 0 |
| Stable Address | #323 | `StableAddress` | 0 |
| Move | #323 | `MovePolicy`, `moveMethod` | 0 |
| admitted capability | #351 | `net-admin`, `NET_ADMIN` | 0 |
| database and RabbitMQ credentials through a `VaultDynamicSecret` | #351 | `VaultDynamicSecret` | 0 |
| node dataset | #351, #355 | `dataset` | 0 |
| L4 exposure | #351 | `LoadBalancer`, `l4` | 0 |
| `lifecycle: scheduled` | #351 | `scheduled` | 0. `LIFECYCLES` is `application`, `job`, `prepare`, and a `CronJob` is rendered for a backup only |
| spawn template | #351 | `spawn` | 0 |
| `egress: internet` | #351 | `internet` | 0 |
| `mongo` and `s3` engines, the bucket catalog | #351 | `mongo`, `s3`, `bucket` | 0 |
| derived priority class | #351 | `priorityClass` | 0 |
| provider as a selectorless Service and an EndpointSlice | #351 | `EndpointSlice` | 0 |
| `gpu` `vendor` and `model` | #355 | `vendor` | 1: `model/node-contract.ts`, the node's side only |
| `parked` | #355 | `parked` | 0 |
| `replicas` with `across: node` | #355 | `across:` | 0 |
| Node Agent catalog | #356 | `NodeAgent`, `DaemonSet` | 0 |
| human grant | #357 | `HumanGrant`, `humanGrant` | 0. `ClusterRoleBinding` is typed in `objects/kubernetes.ts` for a Process's API access |
| Dashboard | #357 | `dashboard` | 0 |
| alert rules | #357 | `alertRules`, `PrometheusRule` | 0 |
| monitoring stack roles and receivers | #357 | `alertmanager`, `receiver` | 0 |

One field moves the other way: `alertClass`, which issue #357 drops, is named
by three modules (`model/project-intent.ts`, `model/resolved-deployment.ts`
and `resolve/application.ts`).

## Statements that differ from the tree

Facts found while measuring, each with its file and line. Nothing here says
which side is right.

| statement | where | what the tree holds |
|---|---|---|
| the ports `PinnedInputSet`, `FragmentSource`, `FragmentPublisher` and `DeliverableWriter` | `docs/architecture.md:79`, `:80`, `:82` | no declaration and no use under `src/`, `test/` or `scripts/` |
| the writer writes into a staging directory that is renamed over the target, after verifying ledger coverage | `docs/architecture.md:82`, `:258` to `:260` | no call to `rename` under `src/`. `src/cli/main.ts:375` and `:376` create the directory and write each file in place |
| `objects/`, `adapters/` and `cli/` land with the slice that first needs them, and their rules wait with them | `docs/architecture.md:42`, `:43` | the three folders hold 3, 15 and 3 modules, and their rules are enforced |
| a volume, a kv grant, an Asset, a managed migration and a placeholder other than `${identity:…}` stop the resolution with an error | `docs/architecture.md:44` to `:47` | `resolve/volumes.ts`, `resolve/secrets.ts` and `resolve/migration.ts` resolve them. The one `notSupported` call under `src/resolve/` is for a placeholder inside an Asset, `src/resolve/secrets.ts:94` |
| the tree runs the chain as far as the Effective Intent today; `resolve/` and the adapters join it in the slices that follow | `docs/adr/architecture/0056-the-compiler-is-a-chain-of-typed-models.md:39`, `:40` | `resolve/` holds 12 modules and `adapters/` 15 |
| every step links through one trace | `docs/adr/architecture/0058-every-step-links-through-one-trace.md`, title and decision | no identifier containing `trace` under `src/` |
| RULE-046 is pending on #44, whose deliverable is the invariant registry | `docs/architecture-rules.md:123` | issue #44 closed on 2026-10-09. `INVARIANTS` in `src/check/union.ts:327` registers 14 codes |
| RULE-047 is pending on #38: the `Diagnostic` type lands with the first parser | `docs/architecture-rules.md:124` | issue #38 closed on 2026-09-15. `src/model/diagnostic.ts` declares the type and `read/` holds 7 modules |
| every module under `src/` is mutated | `docs/architecture-rules.md:141` | `stryker.config.json` excludes `src/cli/boundary.ts`, and 58 `// Stryker disable` comments in 21 modules exclude 76 of the 6,759 mutants |
| the coverage thresholds sit on what the suite reaches | `docs/architecture.md:495` to `:498` | `vitest.config.ts` holds statements 99.51, branches 97.95, functions 100 and lines 99.46; the suite reaches 99.53, 98.28, 100 and 99.48. The comment above the thresholds (`vitest.config.ts:26` to `:31`) records a measurement of 2026-09-15 over 1,664 statements; the tree has 3,863 |
| `read/` may import `model/` and `yaml`; `application/` may import every step and `model/` | `docs/architecture.md:32`, `:38` | `read/` also imports `zod` and `application/` also imports `objects/`, both as types |
| the registered adapters, one directory each | `docs/architecture.md:37` | `adapters/` holds seven adapter directories and `registry.ts`; `flux/` is not registered |

## Not measured

- **What `npm run verify` stopped before a push.** Every gate also runs on the
  author's machine, and nothing records those runs. A gate that never failed
  in CI may have failed locally many times.
- **A mutation score per module below 100%.** The break score is 100, so a
  green run scores every module 100%. The per-module numbers that exist are
  the mutant count, the ignored count and the test files that reach it.
- **Mutation minutes per module.** Only a shard's duration is recorded. A
  shard's minutes do not follow its mutant count: shard 6 holds more mutants
  than shard 2 and takes three minutes less.
- **CI minutes per rule.** The rules of one enforcer run in one process, so CI
  records a time per gate and not per rule. The per-rule times given are
  local.
- **A hand classification of each function by concept.** The spread in
  [Concept chapters](#concept-chapters) is two proxies, one that under-counts
  and one that over-counts.
- **Whether a live Application needs a module.** No module is joined to the
  live-estate inventory, so no table says which adapter or derivation the
  estate's Applications exercise.
- **Review.** Pull request review comments were not read, so a mistake a
  reader caught is not counted for any rule or record.
- **Runs cancelled before a job finished.** 72 of the 618 runs were cancelled.
  A gate that would have failed in one of them left no record.
- **`test/` and `scripts/` per file.** `test/` is 24,034 lines in 81 files and
  `scripts/` 5,219 lines; they appear only as the cost of the rules and gates
  they hold.
- **`emf/`.** The model-driven implementation is out of scope and measures
  itself.
- **History that git's rename detection does not follow.** A module split out
  of another starts its commit count at the split.
