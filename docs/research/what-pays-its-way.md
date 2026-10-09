# What pays its way

Which parts of the specification and the decision record are referenced,
implemented and tested, and what each costs to keep. Measured 2026-10-09 at
`origin/main` `4c12851`, for
[issue #342](https://github.com/JorisJonkers-dev/deploy-kit/issues/342) on the
map in [issue #341](https://github.com/JorisJonkers-dev/deploy-kit/issues/341).
See [the index](README.md#method) for the markers used.

This file measures and recommends nothing. Every table is sorted so the
least-referenced, least-used and largest items come first, which is an
ordering, not a verdict: the cut list is a later decision
([issue #346](https://github.com/JorisJonkers-dev/deploy-kit/issues/346)).
Each count is reproducible from the commands in [Method](#method).

## Findings

**A fifth of the specification's sections are linked from nowhere.** The 11
chapters hold 10,489 lines in 261 `##` and `###` sections. 68 of those
sections (35 of the 162 at `##`) have no inbound anchor link from any tracked
file. The ten `Diagram sources` sections alone hold 1,070 lines, 10.2% of the
specification, and none is linked. The open-items sections (`Open items`,
`Still to be graded`, and seven `Open in this chapter`) hold 380 lines. 107
of the 162 `##` sections, 5,846 lines, are linked by no file under `src/`,
`test/` or `emf/`; linking a section from code is a convention, not a rule,
so this is a lower bound on use. See [Sections](#sections).

**Chapters 15 and 50 are the least reached.**
[Chapter 15](../../spec/v1/15-infrastructure-intent.md) (131 lines, one
commit) is linked from 6 files, none of them code, and its three codes are all
pending on [issue #324](https://github.com/JorisJonkers-dev/deploy-kit/issues/324).
[Chapter 50](../../spec/v1/50-lifecycle.md) (315 lines) is linked from 9
files, none of them code, and backticks no field name that no other chapter
also backticks. [Chapter 10](../../spec/v1/10-project-intent.md) is the most
reached: 127 files, 41 of them code or tests. See [Chapters](#chapters).

**Two codes in five are pending.** The chapters define 108 `E_` codes. 42
(39%) are pending in `scripts/lint-codes.ts`, on six tickets: #97 (12), #324
(11), #204 (7), #44 (6), #92 (5) and #148 (1). Of the 66 exercised, 65 are
raised in `src/` and 57 in `emf/`; 8 are raised in `src/` alone
(`E_IMAGE_LOCK_CONFLICT`, `E_LEDGER_REVIEW_OVERDUE`,
`E_NODE_CONTRACT_MISMATCH`, the three `E_PARTICIPANT_*`, `E_PATH_COLLISION`,
`E_PLACEMENT_UNSATISFIABLE`). One, `E_PRIVILEGED_PORT_UNDER_NONROOT`, is
raised by neither: `test/simplification-contract.test.ts` checks it over the
worked examples. 52 have a refusal oracle under `spec/v1/examples/`. 10
pending codes are still named in files under `spec/v1/examples/`, and 3 codes appear
in either ledger. See [Codes](#codes).

**Model ADRs are cited; architecture and EMF ADRs mostly are not.** The four
registers hold 98 records and 8,666 lines (model 67 records and 6,323 lines,
architecture 15 and 1,160, deferred 2 and 174, EMF 14 and 1,009). The median
record is linked from 12 files in the model register, 2 in the architecture
register, 2 in the EMF register and 3.5 in the deferred register. Three
records are linked from nothing but their own register:
[0059](../adr/architecture/0059-failures-are-a-diagnostic-list.md),
[0072](../../emf/docs/adr/emf/0072-maven-and-tycho-against-a-pinned-target-platform.md)
and
[0077](../../emf/docs/adr/emf/0077-acceleo-4-renders-the-deliverable-set.md).
59 records are named by no file under `src/`, `test/`, `emf/`, `scripts/` or
`.github/` (model 43, EMF 8, architecture 6, deferred 2). 31 are `proposed` rather than `accepted`
(model 18, EMF 11, deferred 2). 52 records have one commit since the
register's rebuild. See [ADRs](#adrs).

**Every term is used somewhere; 17 are used by no code.** `CONTEXT.md`
defines 95 terms above its `Words to use carefully` section. Each appears in
at least one chapter, ADR, worked example or implementation. 17 appear in
neither `src/` nor `emf/`, among them Infrastructure Intent, Stable Address,
Fence, Move method, Availability, Bootstrap set, Adapter port and
Bidirectional ledger. 9 appear in `src/` but not in `emf/`, all of them
composition and delivery words (Composition lock, Participants, Pin, Pin
source, Rollback, Pause, Isolated, Estate repository, Rendered artifact).
Three appear in no chapter: Hardening Class, Env Variable and API Holder. See
[Terms](#terms).

**The parity contract touches a third of all merged work.** Since `emf/`
landed on 2026-09-14 (`ab20680`, #104), 121 pull requests merged to `main`,
106 of them not from release-please or Renovate. 38 of the 106 (36%) changed
both `src/` and `emf/` outside `emf/docs/`, 15 changed `src/` alone and 17
`emf/` alone: of the 70 that changed either implementation, 54% changed both.
Over the same range `emf/` took 20,317 changed lines against `src/`'s 17,237.
`emf/` is 17,678 tracked lines. See [The parity contract's cost](#the-parity-contracts-cost).

**Mutation testing, not the model-driven build, dominates CI minutes.** Over
the last 30 completed CI runs, the `Model-driven build` job took a median of
11.6 minutes and 336.6 runner-minutes in all, 11.4% of the 2,962.1
runner-minutes every job took; CodeQL's `java-kotlin` analysis, which exists
for `emf/`, took 58.3 (2.0%). The six mutation shards took a median of 80.0
runner-minutes per run and 2,364.2 in all (79.8%). A pull request waits on the
slowest job: the slowest mutation shard's median, 19.0 minutes, is longer than
the model-driven build's.

**Not measured.** Whether a live Application needs a chapter, term, ADR or
code waits on the live-estate inventory
([issue #343](https://github.com/JorisJonkers-dev/deploy-kit/issues/343)), so
no table has that column yet. Issue and pull request comments were not read,
only titles and bodies. Churn is per file, so a section's churn is its
chapter's.

## Method

Every count was taken at `4c12851` over the tracked tree (`git ls-files`),
excluding `docs/mde/` and `CHANGELOG.md`, the same exclusions the em-dash ban
and `lint:meaning` use. Each file was classified by path: a chapter
(`spec/v1/NN-*.md`), a worked example or oracle (`spec/v1/examples/`), an ADR
(`docs/adr/{model,architecture,deferred}/NNNN-*.md`,
`emf/docs/adr/emf/NNNN-*.md`), a register (the registers' `README.md`),
`CONTEXT.md`, `src/`, `test/`, `emf/` code (everything under `emf/` but
`emf/docs/` and the test tier: `emf/tests/` and any `src/test/`), `emf/`
tests, the two ledgers (`docs/requirements.md`, `docs/architecture-rules.md`),
and everything else.

| measure | how |
|---|---|
| lines | newline count of the file, or of the section from its heading to the next heading of the same or a higher level |
| churn | `git log --since=2026-08-31 --oneline -- <path> \| wc -l`, computed in one pass from `git log --since=2026-08-31 --name-only`. The repository's first commit is 2026-09-07, so this is whole history; the ADR register was rebuilt in #183 (`b8e1a89`), so an ADR's churn starts there |
| inbound links, chapter | files other than the chapter itself that contain the chapter's file name, with or without an anchor |
| inbound links, section | occurrences of `NN-name.md#anchor` anywhere in the tree, plus `](#anchor)` inside the chapter itself; anchors are GitHub slugs, with `-1` for a repeated heading |
| normative pointers | ADRs whose `normative:` frontmatter names the section |
| owned fields | backticked identifiers (lower-case first letter, three characters or more, last dotted segment) that this chapter backticks and no other chapter does; then whether each appears as a YAML or JSON key in `spec/v1/examples/`, and as a word (or its capitalised form inside an identifier) in `src/` and in `emf/` code. A proxy for whether a chapter's own vocabulary reaches the examples and the implementations |
| inbound links, ADR | files containing `NNNN-` followed by a letter (the start of a record's file name), other than the record and the registers; plus records whose `rests-on:` names the number |
| ADR in code | the above, or the bare four-digit number, in a file under `src/`, `test/`, `emf/`, `scripts/` or `.github/`; a four-digit literal in a fixture would over-count |
| term | case-insensitive phrase match, hyphen or space between words, in chapters, ADRs and the ledgers; in examples, `src/` and `emf/`, also its `PascalCase`, `camelCase`, `kebab-case` and `snake_case` forms. A one-word term (marked `*`) is matched case-sensitively in its written form or all lower-case, so a common word such as Process, Pin or Held over-counts in code |
| code | the regular expression `scripts/lint-codes.ts` uses; defined means named in a chapter; `src/` excludes `src/model/diagnostic.ts`, the closed list every code sits in; a refusal oracle is a `*.diagnostics.json` file; pending is the `PENDING` list in `scripts/lint-codes.ts` |
| issues and PRs | titles and bodies from `gh issue list --state all --limit 1000 --json number,title,body` (181 issues) and `gh pr list --state all --limit 1000 --json number,title,body` (169 pull requests), matched with the same pattern as the row; comments not read |
| parity | `git log ab20680^..HEAD --first-parent --name-only`, one squash-merged pull request per commit; a commit whose subject starts `chore(main): release`, `chore(deps)` or `fix(deps)` is counted as automation; changed lines from `--numstat` over the same range |
| CI minutes | the 30 most recent `CI` runs that concluded `success` or `failure` (`gh run list --workflow CI --limit 60`), each job's `completed_at` minus `started_at` from `gh api repos/JorisJonkers-dev/deploy-kit/actions/runs/<id>/jobs`; the runs span 2026-10-08 10:24 to 2026-10-09 12:02 UTC, 21 pull request runs and 9 pushes to `main` |

## The parity contract's cost

The contract is
[`docs/architecture.md`'s](../architecture.md#the-parity-contract): a model
change lands in both implementations and in the oracle files, in one pull
request.

**Merged pull requests since `emf/` landed** (`git log ab20680^..HEAD
--first-parent --name-only`):

| pull requests | count | share of the 106 |
|---|--:|--:|
| merged to `main`, 2026-09-14 to 2026-10-09 | 121 | |
| of which release-please or Renovate | 15 | |
| the rest | 106 | 100% |
| changed `src/` and `emf/` (outside `emf/docs/`) | 38 | 36% |
| changed `emf/` but not `src/` | 17 | 16% |
| changed `src/` but not `emf/` | 15 | 14% |
| changed an oracle file (`spec/v1/examples/**/expected/`, `*.diagnostics.json`) | 39 | 37% |
| changed an oracle file and `emf/` | 37 | 35% |
| changed a chapter | 62 | 58% |
| changed a chapter and `emf/` | 37 | 35% |

Changed lines (added plus deleted, `git log ab20680^..HEAD --first-parent
--numstat`): `emf/` outside `emf/docs/` 20,317, `src/` 17,237, `test/` 22,626.

**CI minutes, last 30 completed runs** (`gh api .../actions/runs/<id>/jobs`):

| job | median minutes per run | runner-minutes over 30 runs | share |
|---|--:|--:|--:|
| Mutation, six shards summed | 80.0 | 2,364.2 | 79.8% |
| Mutation, slowest shard | 19.0 | 563.9 | |
| Model-driven build (`emf`) | 11.6 | 336.6 | 11.4% |
| Code scanning, `java-kotlin` | 2.0 | 58.3 | 2.0% |
| Code scanning, `javascript-typescript` | 1.2 | 35.6 | 1.2% |
| Tests | 1.2 | 33.0 | 1.1% |
| PR Report | 1.1 | 24.9 | 0.8% |
| every other job (12) | 0.0 to 0.7 | 109.3 | 3.7% |
| all jobs | 99.4 | 2,962.1 | 100% |

**Lines under `emf/`** (`git ls-files emf`, newline count per file):

| tier | files | lines |
|---|--:|--:|
| model sources: Ecore, Xtext, MWE2, QVT-Operational, OCL, Acceleo | 25 | 6,254 |
| tests (`emf/tests/`, `src/test/`) | 39 | 5,044 |
| main Java and Kotlin | 42 | 3,026 |
| build and configuration: poms, manifests, Maven wrapper, launch files, target | 30 | 1,722 |
| documents: ADRs, rule ledger, witnesses, architecture | 18 | 1,632 |
| all of `emf/` | 154 | 17,678 |

One tracked file under `emf/` carries an `@generated` marker. For
comparison, `src/` is 12,463 lines and `test/` 24,034.

## Chapters

Sorted by links from code and tests, then by files linking in, then by size
descending. Codes defined counts every `E_` code the chapter names, with the
pending ones in brackets; a code named in several chapters counts in each.

| chapter | lines | commits since 2026-08-31 | files linking in | from chapters | from ADRs | from code and tests (`src/`, `test/`, `emf/`) | from examples | codes defined (pending) | owned fields: in examples / `src/` / `emf/` | issues and PRs naming it |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| [15-infrastructure-intent.md](../../spec/v1/15-infrastructure-intent.md) | 131 | 1 | 6 | 2 | 2 | 0 | 0 | 3 (3) | 14: 5 / 8 / 6 | 5 |
| [50-lifecycle.md](../../spec/v1/50-lifecycle.md) | 315 | 15 | 9 | 4 | 2 | 0 | 2 | 3 (1) | 0: 0 / 0 / 0 | 8 |
| [00-overview.md](../../spec/v1/00-overview.md) | 494 | 25 | 18 | 1 | 5 | 2 | 0 | 4 (0) | 7: 1 / 6 / 3 | 15 |
| [60-setup.md](../../spec/v1/60-setup.md) | 699 | 19 | 30 | 6 | 6 | 8 | 8 | 7 (1) | 5: 0 / 1 / 2 | 19 |
| [14-platform-intent.md](../../spec/v1/14-platform-intent.md) | 899 | 28 | 59 | 8 | 6 | 13 | 30 | 30 (6) | 20: 13 / 15 / 16 | 26 |
| [40-composition.md](../../spec/v1/40-composition.md) | 963 | 18 | 44 | 10 | 12 | 15 | 3 | 36 (16) | 16: 2 / 4 / 1 | 21 |
| [16-dependencies.md](../../spec/v1/16-dependencies.md) | 989 | 24 | 41 | 8 | 9 | 16 | 4 | 12 (2) | 5: 1 / 2 / 2 | 18 |
| [55-delivery.md](../../spec/v1/55-delivery.md) | 722 | 30 | 63 | 9 | 13 | 24 | 10 | 1 (0) | 12: 8 / 11 / 6 | 51 |
| [30-deliverables.md](../../spec/v1/30-deliverables.md) | 581 | 25 | 48 | 7 | 10 | 25 | 2 | 14 (12) | 30: 18 / 27 / 27 | 27 |
| [20-resolved-deployment.md](../../spec/v1/20-resolved-deployment.md) | 1923 | 43 | 65 | 8 | 15 | 30 | 5 | 26 (10) | 33: 13 / 19 / 22 | 43 |
| [10-project-intent.md](../../spec/v1/10-project-intent.md) | 2773 | 30 | 127 | 9 | 27 | 41 | 45 | 53 (14) | 67: 23 / 49 / 49 | 43 |

## ADRs

Sorted by files linking in plus records resting on it, then by mentions in
code, then by size descending. Files linking in excludes the registers.

| ADR | register | tier | status | lines | commits | files linking in | rests on it | from chapters | from `CONTEXT.md` | from code and tests | from ledgers | issues and PRs |
|---|---|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| [0072](../../emf/docs/adr/emf/0072-maven-and-tycho-against-a-pinned-target-platform.md) | emf | decision | accepted | 82 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| [0059](../adr/architecture/0059-failures-are-a-diagnostic-list.md) | architecture | decision | accepted | 70 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| [0077](../../emf/docs/adr/emf/0077-acceleo-4-renders-the-deliverable-set.md) | emf | decision | proposed | 50 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| [0089](../adr/architecture/0089-the-package-ships-the-command-built-when-it-is-packed.md) | architecture | decision | accepted | 84 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 2 |
| [0098](../../emf/docs/adr/emf/0098-cross-file-invariants-navigate-an-estate-root.md) | emf | decision | accepted | 75 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 5 |
| [0062](../adr/architecture/0062-tests-run-in-process-on-vitest.md) | architecture | decision | accepted | 71 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 4 |
| [0074](../../emf/docs/adr/emf/0074-constraints-are-complete-ocl-named-by-code.md) | emf | decision | proposed | 58 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| [0067](../adr/architecture/0067-every-spec-error-code-is-proved-by-a-test.md) | architecture | decision | accepted | 57 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 3 |
| [0076](../../emf/docs/adr/emf/0076-qvto-derives-the-resolved-deployment.md) | emf | decision | proposed | 56 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 3 |
| [0090](../adr/model/0090-composition-unions-each-fragments-share-of-the-images-lock.md) | model | decision | accepted | 102 | 1 | 2 | 0 | 1 | 0 | 0 | 0 | 2 |
| [0054](../adr/model/0054-projects-are-handed-over-one-at-a-time.md) | model | decision | proposed | 100 | 3 | 2 | 0 | 1 | 0 | 0 | 0 | 2 |
| [0056](../adr/architecture/0056-the-compiler-is-a-chain-of-typed-models.md) | architecture | decision | accepted | 93 | 2 | 2 | 0 | 0 | 0 | 0 | 0 | 3 |
| [0058](../adr/architecture/0058-every-step-links-through-one-trace.md) | architecture | decision | accepted | 90 | 1 | 2 | 0 | 1 | 0 | 0 | 0 | 3 |
| [0086](../adr/model/0086-the-collector-runs-in-the-cluster.md) | model | decision | proposed | 87 | 3 | 2 | 0 | 1 | 0 | 0 | 0 | 3 |
| [0053](../adr/model/0053-rotating-a-secret-is-not-a-release.md) | model | decision | proposed | 77 | 1 | 2 | 0 | 2 | 0 | 0 | 0 | 0 |
| [0096](../adr/model/0096-availability-is-declared-on-an-engine.md) | model | decision | accepted | 70 | 1 | 2 | 0 | 1 | 1 | 0 | 0 | 3 |
| [0078](../../emf/docs/adr/emf/0078-model-behaviours-have-a-junit-witness.md) | emf | decision | proposed | 66 | 1 | 2 | 0 | 0 | 0 | 0 | 0 | 1 |
| [0075](../../emf/docs/adr/emf/0075-xtext-parses-the-authored-yaml-into-the-metamodel.md) | emf | decision | proposed | 59 | 3 | 2 | 0 | 0 | 0 | 0 | 0 | 1 |
| [0057](../adr/architecture/0057-the-authored-shape-is-the-source-model.md) | architecture | decision | accepted | 82 | 2 | 2 | 0 | 0 | 0 | 1 | 0 | 2 |
| [0071](../../emf/docs/adr/emf/0071-emf-is-coursework-scoped-and-self-contained.md) | emf | decision | proposed | 57 | 1 | 2 | 0 | 0 | 0 | 1 | 0 | 5 |
| [0061](../adr/architecture/0061-the-process-lives-in-one-boundary-file.md) | architecture | decision | accepted | 49 | 2 | 2 | 0 | 0 | 0 | 1 | 0 | 8 |
| [0088](../adr/architecture/0088-the-committed-schemas-and-their-corpus-are-the-contract.md) | architecture | decision | accepted | 80 | 1 | 2 | 0 | 0 | 0 | 2 | 0 | 1 |
| [0082](../../emf/docs/adr/emf/0082-the-env-files-are-read-not-parsed-by-xtext.md) | emf | decision | accepted | 74 | 2 | 2 | 0 | 0 | 0 | 2 | 0 | 1 |
| [0084](../adr/model/0084-pause-and-rollback.md) | model | decision | proposed | 91 | 2 | 3 | 0 | 1 | 0 | 0 | 0 | 2 |
| [0095](../adr/model/0095-each-engine-states-how-its-data-moves.md) | model | decision | accepted | 88 | 1 | 3 | 0 | 1 | 1 | 0 | 0 | 7 |
| [0069](../adr/deferred/0069-co-testing-is-parked.md) | deferred | decision | proposed | 81 | 1 | 3 | 0 | 0 | 0 | 0 | 0 | 1 |
| [0079](../../emf/docs/adr/emf/0079-the-emf-gates-are-estate-shaped.md) | emf | decision | proposed | 80 | 1 | 3 | 0 | 0 | 0 | 0 | 0 | 3 |
| [0055](../adr/model/0055-the-render-leaves-flaggers-objects-to-flagger.md) | model | decision | proposed | 79 | 1 | 3 | 0 | 2 | 0 | 0 | 0 | 0 |
| [0085](../adr/model/0085-composition-isolates-a-refused-project.md) | model | decision | proposed | 74 | 1 | 3 | 0 | 1 | 0 | 0 | 0 | 6 |
| [0065](../adr/architecture/0065-a-behaviour-ledger-names-what-a-test-proves.md) | architecture | decision | accepted | 75 | 2 | 3 | 0 | 0 | 0 | 1 | 1 | 3 |
| [0073](../../emf/docs/adr/emf/0073-source-and-target-metamodels-are-hand-written.md) | emf | decision | proposed | 75 | 3 | 3 | 0 | 0 | 0 | 1 | 0 | 1 |
| [0091](../adr/model/0091-a-backup-identity-has-a-policy-of-its-own.md) | model | decision | accepted | 102 | 1 | 4 | 0 | 2 | 1 | 0 | 0 | 1 |
| [0097](../adr/deferred/0097-multi-cluster-and-multi-tenancy-are-parked.md) | deferred | decision | proposed | 93 | 1 | 4 | 0 | 2 | 0 | 0 | 0 | 6 |
| [0081](../../emf/docs/adr/emf/0081-bundles-and-tests-are-separate-tiers.md) | emf | decision | proposed | 109 | 1 | 4 | 0 | 0 | 0 | 1 | 0 | 1 |
| [0027](../adr/model/0027-prepare-processes-are-forward-only-setup.md) | model | decision | proposed | 72 | 1 | 4 | 0 | 1 | 0 | 1 | 0 | 0 |
| [0007](../adr/model/0007-schema-version-separable.md) | model | premise | proposed | 85 | 5 | 3 | 2 | 1 | 0 | 0 | 0 | 2 |
| [0039](../adr/model/0039-the-label-set-is-fixed.md) | model | decision | accepted | 75 | 2 | 5 | 0 | 2 | 0 | 0 | 0 | 1 |
| [0093](../adr/model/0093-a-provider-is-reached-through-its-stable-address.md) | model | decision | accepted | 89 | 1 | 5 | 0 | 1 | 1 | 1 | 0 | 7 |
| [0040](../adr/model/0040-vault-policy-is-a-deliverable.md) | model | decision | accepted | 91 | 3 | 6 | 0 | 2 | 0 | 0 | 0 | 1 |
| [0010](../adr/model/0010-flat-application-identity.md) | model | decision | accepted | 90 | 3 | 6 | 0 | 3 | 0 | 0 | 0 | 1 |
| [0015](../adr/model/0015-sidecars-are-process-vocabulary.md) | model | decision | accepted | 74 | 1 | 6 | 0 | 2 | 1 | 0 | 0 | 1 |
| [0063](../adr/architecture/0063-coverage-and-mutation-are-ratchets.md) | architecture | decision | accepted | 75 | 1 | 6 | 0 | 0 | 0 | 2 | 0 | 2 |
| [0080](../../emf/docs/adr/emf/0080-parity-crosses-the-cli-file-interface.md) | emf | decision | proposed | 118 | 1 | 6 | 0 | 0 | 0 | 4 | 0 | 3 |
| [0092](../adr/model/0092-api-access-is-declared-on-the-process-and-admitted-by-the-platform.md) | model | decision | accepted | 117 | 1 | 7 | 0 | 4 | 0 | 0 | 0 | 2 |
| [0036](../adr/model/0036-path-authority-is-layer-2.md) | model | decision | accepted | 91 | 3 | 7 | 0 | 3 | 0 | 0 | 0 | 1 |
| [0083](../adr/model/0083-a-fragment-publishes-on-a-release-tag.md) | model | decision | proposed | 77 | 1 | 7 | 0 | 3 | 0 | 0 | 0 | 3 |
| [0087](../adr/model/0087-in-cluster-consumers-read-the-render.md) | model | decision | proposed | 99 | 3 | 7 | 0 | 4 | 0 | 2 | 0 | 2 |
| [0049](../adr/model/0049-datastore-and-restore.md) | model | decision | proposed | 111 | 1 | 8 | 0 | 2 | 0 | 0 | 0 | 3 |
| [0029](../adr/model/0029-a-grant-is-a-union-on-engine.md) | model | decision | accepted | 94 | 1 | 8 | 0 | 4 | 0 | 0 | 0 | 5 |
| [0041](../adr/model/0041-no-process-rbac-in-v1.md) | model | decision | accepted | 92 | 3 | 8 | 0 | 2 | 0 | 2 | 0 | 3 |
| [0060](../adr/architecture/0060-boundaries-enforced-on-the-graph.md) | architecture | decision | accepted | 77 | 2 | 8 | 0 | 0 | 0 | 2 | 1 | 3 |
| [0064](../adr/architecture/0064-a-gate-is-a-script-or-a-named-job.md) | architecture | decision | accepted | 69 | 1 | 8 | 0 | 0 | 0 | 5 | 0 | 2 |
| [0033](../adr/model/0033-reconcile-unit-derived.md) | model | decision | accepted | 93 | 4 | 9 | 0 | 4 | 1 | 0 | 0 | 2 |
| [0025](../adr/model/0025-observability-is-one-optional-block.md) | model | decision | accepted | 77 | 1 | 9 | 0 | 3 | 1 | 0 | 0 | 0 |
| [0066](../adr/architecture/0066-every-enforced-rule-has-an-id-a-row-and-a-fixture.md) | architecture | decision | accepted | 98 | 2 | 9 | 0 | 0 | 0 | 3 | 0 | 6 |
| [0043](../adr/model/0043-participants-list-staleness.md) | model | decision | accepted | 126 | 4 | 10 | 0 | 3 | 1 | 0 | 0 | 7 |
| [0094](../adr/model/0094-a-move-is-derived-from-one-authored-edit.md) | model | decision | accepted | 121 | 1 | 10 | 0 | 3 | 1 | 0 | 0 | 4 |
| [0068](../adr/architecture/0068-two-implementations-meet-at-the-parity-table.md) | architecture | decision | accepted | 90 | 1 | 10 | 0 | 0 | 0 | 1 | 0 | 4 |
| [0028](../adr/model/0028-grant-unit-is-the-path.md) | model | decision | proposed | 89 | 1 | 11 | 0 | 5 | 1 | 0 | 0 | 0 |
| [0019](../adr/model/0019-engine-is-process-vocabulary.md) | model | decision | accepted | 89 | 3 | 11 | 0 | 3 | 1 | 1 | 0 | 1 |
| [0032](../adr/model/0032-the-resolved-deployment-is-a-versioned-artifact.md) | model | decision | accepted | 84 | 1 | 11 | 0 | 4 | 1 | 1 | 0 | 0 |
| [0051](../adr/model/0051-a-project-is-delivered-as-a-signed-artifact.md) | model | decision | proposed | 113 | 5 | 12 | 0 | 3 | 0 | 0 | 0 | 8 |
| [0044](../adr/model/0044-artifact-schema-versioning.md) | model | decision | accepted | 91 | 3 | 12 | 0 | 4 | 1 | 0 | 0 | 4 |
| [0045](../adr/model/0045-platform-intent-is-the-second-authored-document.md) | model | decision | accepted | 98 | 2 | 12 | 0 | 3 | 1 | 2 | 0 | 0 |
| [0026](../adr/model/0026-migration-is-declared-on-the-application.md) | model | decision | accepted | 137 | 3 | 13 | 0 | 8 | 1 | 0 | 0 | 2 |
| [0046](../adr/model/0046-the-foundation-is-declared.md) | model | decision | accepted | 87 | 1 | 13 | 0 | 4 | 1 | 0 | 0 | 0 |
| [0022](../adr/model/0022-a-derived-value-has-one-declaring-site.md) | model | decision | accepted | 82 | 1 | 13 | 0 | 4 | 1 | 0 | 0 | 3 |
| [0038](../adr/model/0038-bidirectional-ledgers.md) | model | decision | accepted | 82 | 1 | 13 | 0 | 5 | 1 | 0 | 0 | 1 |
| [0021](../adr/model/0021-runtime-mechanics-derive-from-cutover.md) | model | decision | accepted | 111 | 2 | 13 | 0 | 5 | 1 | 1 | 0 | 3 |
| [0013](../adr/model/0013-configuration-is-dotenv-at-three-scopes.md) | model | decision | accepted | 104 | 1 | 14 | 0 | 2 | 1 | 0 | 0 | 2 |
| [0047](../adr/model/0047-one-publication-path.md) | model | decision | accepted | 86 | 1 | 14 | 0 | 5 | 1 | 1 | 0 | 2 |
| [0050](../adr/model/0050-delivery-is-part-of-the-model.md) | model | decision | accepted | 87 | 2 | 15 | 0 | 5 | 1 | 0 | 0 | 1 |
| [0042](../adr/model/0042-declarations-compose-from-intent-fragments.md) | model | decision | accepted | 88 | 2 | 15 | 0 | 4 | 1 | 1 | 0 | 5 |
| [0037](../adr/model/0037-six-registered-adapters-satisfy-one-port.md) | model | decision | accepted | 82 | 1 | 15 | 0 | 3 | 1 | 2 | 0 | 4 |
| [0008](../adr/model/0008-vault-read-is-per-path.md) | model | premise | proposed | 86 | 1 | 11 | 5 | 4 | 0 | 0 | 0 | 3 |
| [0016](../adr/model/0016-probes-are-siblings-and-startup-targets-liveness.md) | model | decision | accepted | 91 | 1 | 16 | 0 | 5 | 0 | 1 | 0 | 6 |
| [0009](../adr/model/0009-intent-is-authored-one-file-per-project.md) | model | decision | accepted | 93 | 1 | 16 | 0 | 5 | 1 | 2 | 0 | 2 |
| [0012](../adr/model/0012-shared-intent-descends-and-is-lowered.md) | model | decision | accepted | 120 | 1 | 16 | 0 | 2 | 1 | 4 | 0 | 2 |
| [0024](../adr/model/0024-dependency-edges-resolve-against-the-union.md) | model | decision | accepted | 98 | 2 | 17 | 0 | 6 | 1 | 0 | 0 | 5 |
| [0034](../adr/model/0034-cluster-state-is-a-pinned-input.md) | model | decision | accepted | 81 | 2 | 17 | 0 | 8 | 1 | 0 | 0 | 3 |
| [0020](../adr/model/0020-hardening-is-one-platform-posture.md) | model | decision | accepted | 112 | 1 | 18 | 0 | 4 | 1 | 0 | 0 | 2 |
| [0023](../adr/model/0023-exposure-is-declared-by-audience.md) | model | decision | accepted | 98 | 1 | 19 | 0 | 7 | 1 | 1 | 0 | 0 |
| [0035](../adr/model/0035-network-policy-is-default-deny-and-render-only.md) | model | decision | accepted | 99 | 1 | 20 | 0 | 8 | 0 | 0 | 0 | 2 |
| [0014](../adr/model/0014-file-shaped-configuration-is-an-asset.md) | model | decision | accepted | 93 | 1 | 20 | 0 | 7 | 1 | 1 | 0 | 0 |
| [0048](../adr/model/0048-node-facts-are-authored-once.md) | model | decision | accepted | 109 | 2 | 20 | 0 | 7 | 1 | 3 | 0 | 7 |
| [0031](../adr/model/0031-identity-per-process.md) | model | decision | accepted | 109 | 3 | 21 | 0 | 6 | 0 | 0 | 0 | 6 |
| [0011](../adr/model/0011-authored-values-name-model-concepts.md) | model | decision | accepted | 81 | 1 | 21 | 0 | 5 | 0 | 4 | 0 | 1 |
| [0002](../adr/model/0002-kubernetes-is-the-substrate-for-one-applier.md) | model | premise | accepted | 90 | 1 | 13 | 9 | 2 | 0 | 1 | 0 | 0 |
| [0030](../adr/model/0030-secret-delivery-is-env-file-or-self.md) | model | decision | accepted | 96 | 1 | 23 | 0 | 6 | 1 | 0 | 0 | 1 |
| [0018](../adr/model/0018-durability-class-derives-a-backup.md) | model | decision | accepted | 142 | 4 | 23 | 0 | 7 | 1 | 1 | 0 | 3 |
| [0052](../adr/model/0052-an-application-is-the-release-unit.md) | model | decision | accepted | 115 | 3 | 26 | 0 | 9 | 1 | 1 | 0 | 6 |
| [0070](../../emf/docs/adr/emf/0070-the-model-is-expressible-in-the-emf-toolchain.md) | emf | premise | proposed | 50 | 1 | 13 | 13 | 0 | 0 | 1 | 0 | 2 |
| [0017](../adr/model/0017-placement-is-hard-dimensions.md) | model | decision | accepted | 105 | 2 | 26 | 0 | 6 | 1 | 3 | 0 | 3 |
| [0004](../adr/model/0004-contention-decides-authority.md) | model | premise | proposed | 100 | 5 | 27 | 12 | 6 | 1 | 0 | 0 | 3 |
| [0003](../adr/model/0003-three-model-pipeline.md) | model | premise | accepted | 84 | 3 | 27 | 14 | 4 | 1 | 4 | 0 | 2 |
| [0006](../adr/model/0006-pinned-inputs.md) | model | premise | proposed | 92 | 6 | 37 | 22 | 8 | 1 | 0 | 0 | 1 |
| [0005](../adr/model/0005-derivation-is-total.md) | model | premise | proposed | 85 | 4 | 30 | 32 | 3 | 0 | 0 | 0 | 3 |
| [0001](../adr/model/0001-estate-scale-and-ownership.md) | model | premise | proposed | 90 | 7 | 33 | 29 | 4 | 0 | 2 | 0 | 9 |

## Codes

Pending codes first, then sorted by the number of test files and oracles,
then by the implementations that raise it. The chapter column is the first
chapter, in file order, that names the code.

| code | defining chapter | chapters | ADRs | `src/` files | `test/` files | `emf/` files | `emf/` test files | refusal oracles | example files | ledgers | pending on | issues and PRs |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|--:|
| `E_AMBIENT_INPUT_FORBIDDEN` | 30 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #97 | 0 |
| `E_FLOATING_IMAGE` | 10 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | #97 | 0 |
| `E_FORBIDDEN_KIND` | 30 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #97 | 0 |
| `E_FOREIGN_NAMESPACE` | 30 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | #97 | 0 |
| `E_IMAGE_USER_NOT_NUMERIC` | 10 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | #92 | 0 |
| `E_INPUT_OUTSIDE_WORKDIR` | 30 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #97 | 0 |
| `E_LEDGER_ENTRY_STALE` | 30 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #97 | 0 |
| `E_RENDER_NONDETERMINISTIC` | 30 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #97 | 0 |
| `E_RENDER_OVERWRITE_REFUSED` | 30 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #97 | 0 |
| `E_STORAGE_UNSATISFIABLE` | 10 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | #92 | 0 |
| `E_SUBTREE_PREFIX_COLLISION` | 20 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #92 | 0 |
| `E_UNACCEPTED_DRIFT` | 30 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #97 | 0 |
| `E_UNATTRIBUTED_OBJECT` | 14 | 3 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #97 | 0 |
| `E_UNREGISTERED_SURFACE` | 30 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #97 | 0 |
| `E_UNSAFE_OUTPUT_PATH` | 30 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #97 | 0 |
| `E_AVAILABILITY_UNSUPPORTED` | 10 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #324 | 1 |
| `E_AVAILABILITY_WITHOUT_ENGINE` | 10 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #324 | 1 |
| `E_CHANGELOG_MISSING` | 10 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #148 | 1 |
| `E_DUPLICATE_APEX` | 20 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #44 | 1 |
| `E_DUPLICATE_NODE` | 15 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #324 | 1 |
| `E_ENGINE_VERSION_MISSING` | 20 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #324 | 1 |
| `E_FORWARD_ONLY_UNUSED` | 10 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #324 | 1 |
| `E_MOVE_UNSUPPORTED` | 14 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #324 | 1 |
| `E_NO_MOVE_POLICY` | 14 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #324 | 1 |
| `E_RAW_SECRET` | 10 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #204 | 1 |
| `E_READER_NOT_DECLARED` | 40 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #204 | 1 |
| `E_RELEASE_UNIT_SINGLETON` | 40 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #204 | 1 |
| `E_RESERVE_EXCEEDS_TOTAL` | 15 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #324 | 1 |
| `E_ROLL_AFFECTS_OTHER_READERS` | 10 | 3 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #204 | 1 |
| `E_ROUTE_AUTH_MODE_NOT_IN_TIER` | 10 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | #44 | 1 |
| `E_SCHEMA_VERSION_MISMATCH` | 40 | 1 | 2 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | #204 | 1 |
| `E_UNDECLARED_SECRET_PATH` | 40 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #204 | 1 |
| `E_UNKNOWN_OVERRIDE` | 14 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #44 | 1 |
| `E_UNKNOWN_SITE` | 15 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #324 | 1 |
| `E_UNMANAGED_SURFACE_WITHOUT_COORDINATES` | 16 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | #44 | 1 |
| `E_CONTRACT_TOO_EARLY` | 40 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #44 | 2 |
| `E_DISK_BINDING_CONFLICT` | 10 | 4 | 1 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | #92 | 2 |
| `E_DUPLICATE_ROUTE` | 10 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | #44 | 2 |
| `E_HARDENING_UNMET` | 10 | 3 | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | #92 | 2 |
| `E_MOVE_IRREVERSIBLE` | 10 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #324 | 2 |
| `E_MOVE_OPEN` | 20 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #324 | 2 |
| `E_PROVIDER_WITHOUT_COORDINATES` | 40 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | #204 | 3 |
| `E_PRIVILEGED_PORT_UNDER_NONROOT` | 10 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 1 | 0 | no | 1 |
| `E_LEDGER_REVIEW_OVERDUE` | 30 | 2 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | no | 1 |
| `E_NODE_CONTRACT_MISMATCH` | 20 | 1 | 0 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | no | 1 |
| `E_PARTICIPANT_UNLISTED` | 40 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | no | 1 |
| `E_PARTICIPANT_STALE` | 14 | 2 | 2 | 1 | 1 | 0 | 0 | 0 | 1 | 0 | no | 4 |
| `E_MIGRATION_OWNER_DUPLICATED` | 10 | 1 | 0 | 1 | 0 | 1 | 0 | 1 | 3 | 0 | no | 1 |
| `E_DUPLICATE_EXPOSURE_NAME` | 00 | 4 | 0 | 1 | 0 | 1 | 0 | 1 | 3 | 0 | no | 2 |
| `E_DUPLICATE_PROJECT` | 40 | 1 | 0 | 1 | 0 | 1 | 0 | 1 | 2 | 0 | no | 2 |
| `E_DUPLICATE_ROUTE_MATCH` | 10 | 3 | 0 | 1 | 0 | 1 | 0 | 1 | 3 | 0 | no | 2 |
| `E_DUPLICATE_HOST` | 00 | 4 | 0 | 1 | 0 | 1 | 0 | 1 | 4 | 0 | no | 3 |
| `E_DUPLICATE_PROCESS_NAME` | 10 | 5 | 0 | 1 | 0 | 1 | 0 | 1 | 4 | 0 | no | 3 |
| `E_DUPLICATE_APPLICATION_ID` | 10 | 3 | 1 | 1 | 0 | 1 | 0 | 1 | 4 | 0 | no | 5 |
| `E_NO_DURABILITY_POLICY` | 14 | 1 | 0 | 2 | 0 | 1 | 0 | 1 | 1 | 0 | no | 1 |
| `E_NO_ENGINE_POLICY` | 14 | 1 | 0 | 2 | 0 | 1 | 0 | 1 | 1 | 0 | no | 1 |
| `E_NO_MIGRATION_POLICY` | 10 | 2 | 0 | 2 | 0 | 1 | 0 | 1 | 2 | 0 | no | 1 |
| `E_PLACEMENT_INCOMPLETE` | 10 | 1 | 0 | 2 | 0 | 1 | 0 | 1 | 2 | 0 | no | 1 |
| `E_DURABILITY_WITHOUT_ENGINE` | 10 | 1 | 1 | 2 | 0 | 2 | 0 | 1 | 2 | 0 | no | 0 |
| `E_IMAGE_LOCK_CONFLICT` | 40 | 1 | 1 | 1 | 2 | 0 | 0 | 0 | 0 | 0 | no | 1 |
| `E_PARTICIPANT_MISSING` | 14 | 2 | 1 | 1 | 2 | 0 | 0 | 0 | 1 | 0 | no | 3 |
| `E_PLACEMENT_UNSATISFIABLE` | 10 | 5 | 3 | 1 | 2 | 0 | 0 | 0 | 2 | 0 | no | 6 |
| `E_ENV_CANNOT_RELOAD` | 10 | 1 | 1 | 1 | 1 | 1 | 0 | 1 | 2 | 0 | no | 0 |
| `E_ILLEGAL_DELIVERY_FOR_ACCESS` | 10 | 1 | 0 | 1 | 1 | 1 | 0 | 1 | 2 | 0 | no | 0 |
| `E_CREDENTIALS_WITHOUT_DATABASE` | 10 | 1 | 0 | 1 | 1 | 1 | 0 | 1 | 2 | 0 | no | 1 |
| `E_MIGRATION_UNDECLARED` | 10 | 1 | 0 | 1 | 1 | 1 | 0 | 1 | 2 | 0 | no | 1 |
| `E_MIGRATION_UNGATED` | 10 | 3 | 0 | 1 | 1 | 1 | 0 | 1 | 1 | 0 | no | 1 |
| `E_OWNER_ROLE_GRANTED` | 10 | 1 | 0 | 1 | 1 | 1 | 0 | 1 | 2 | 0 | no | 1 |
| `E_PREPARE_PROCESS_SERVES` | 10 | 1 | 0 | 1 | 1 | 1 | 0 | 1 | 2 | 0 | no | 1 |
| `E_RELEASE_UNIT_MIXED_CUTOVER` | 10 | 3 | 1 | 1 | 1 | 1 | 0 | 1 | 4 | 0 | no | 1 |
| `E_SHARED_QUANTITY` | 10 | 1 | 0 | 1 | 1 | 1 | 0 | 1 | 2 | 0 | no | 1 |
| `E_UNKNOWN_SECRET_STORE` | 14 | 1 | 0 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | no | 1 |
| `E_HANDOVER_UNLISTED` | 14 | 2 | 0 | 1 | 1 | 1 | 0 | 1 | 2 | 0 | no | 2 |
| `E_UNKNOWN_ENV_SCOPE` | 10 | 1 | 2 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | no | 2 |
| `E_DEPENDENCY_CYCLE` | 16 | 3 | 0 | 1 | 0 | 1 | 1 | 1 | 2 | 0 | no | 3 |
| `E_ENGINE_WITHOUT_DURABILITY` | 10 | 1 | 1 | 2 | 0 | 1 | 1 | 1 | 3 | 0 | no | 0 |
| `E_CUTOVER_MISSING` | 10 | 1 | 0 | 2 | 1 | 1 | 0 | 1 | 2 | 0 | no | 1 |
| `E_DURABILITY_POLICY_INCOMPLETE` | 14 | 1 | 0 | 2 | 1 | 1 | 0 | 1 | 1 | 0 | no | 1 |
| `E_NON_KV_DELIVERY` | 10 | 1 | 1 | 2 | 1 | 1 | 0 | 1 | 2 | 0 | no | 2 |
| `E_BACKUP_SURFACE_NOT_PROVIDED` | 14 | 1 | 0 | 3 | 1 | 1 | 0 | 1 | 1 | 0 | no | 1 |
| `E_UNKNOWN_RELEASE_GATE` | 14 | 1 | 0 | 2 | 1 | 2 | 1 | 0 | 0 | 0 | no | 1 |
| `E_MIGRATION_WITHOUT_DATABASE` | 10 | 1 | 0 | 3 | 1 | 1 | 0 | 1 | 2 | 0 | no | 2 |
| `E_NO_DELIVERY_POLICY` | 14 | 1 | 0 | 2 | 1 | 2 | 0 | 1 | 2 | 0 | no | 2 |
| `E_UNKNOWN_API_HOLDER` | 14 | 1 | 0 | 1 | 0 | 1 | 2 | 1 | 1 | 0 | no | 1 |
| `E_UNKNOWN_MACHINERY` | 14 | 1 | 0 | 1 | 0 | 1 | 2 | 1 | 1 | 0 | no | 1 |
| `E_UNKNOWN_METRICS_STACK` | 14 | 1 | 0 | 1 | 1 | 1 | 2 | 0 | 0 | 0 | no | 1 |
| `E_ALERT_CLASS_WITHOUT_SIGNAL` | 10 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 5 | 0 | no | 2 |
| `E_PATH_COLLISION` | 00 | 5 | 4 | 2 | 3 | 0 | 0 | 0 | 3 | 0 | no | 5 |
| `E_NO_FORWARD_AUTH_ENDPOINT` | 14 | 2 | 1 | 2 | 1 | 1 | 1 | 1 | 1 | 1 | no | 1 |
| `E_PROFILE_KEY_AUTHORED` | 10 | 1 | 0 | 2 | 2 | 1 | 0 | 1 | 1 | 0 | no | 1 |
| `E_UNRESOLVED_PLACEHOLDER` | 10 | 1 | 0 | 2 | 2 | 1 | 0 | 1 | 1 | 0 | no | 1 |
| `E_NO_SECRET_STORE` | 14 | 1 | 0 | 2 | 2 | 1 | 0 | 1 | 1 | 0 | no | 2 |
| `E_PROCESS_RBAC_GRANT` | 10 | 4 | 2 | 2 | 1 | 2 | 1 | 1 | 3 | 0 | no | 1 |
| `E_UNKNOWN_PROCESS` | 10 | 1 | 1 | 3 | 1 | 1 | 1 | 1 | 1 | 1 | no | 3 |
| `E_UNAUTHORISED_SECRET_REFERENCE` | 10 | 3 | 1 | 2 | 2 | 2 | 0 | 1 | 2 | 0 | no | 4 |
| `E_RELEASE_UNIT_NO_READINESS` | 20 | 2 | 0 | 3 | 2 | 2 | 0 | 1 | 1 | 0 | no | 3 |
| `E_HANDOVER_BOTH_PATHS` | 14 | 2 | 0 | 1 | 3 | 1 | 0 | 1 | 2 | 0 | no | 2 |
| `E_SECRETS_AT_REST_REQUIRED` | 00 | 5 | 1 | 1 | 1 | 1 | 1 | 2 | 15 | 0 | no | 2 |
| `E_UNBOUND_SECRET_GRANT` | 10 | 3 | 0 | 1 | 2 | 1 | 1 | 1 | 1 | 0 | no | 3 |
| `E_CUTOVER_UNHONOURABLE` | 10 | 2 | 1 | 1 | 3 | 1 | 0 | 1 | 4 | 0 | no | 5 |
| `E_NO_TIER_FOR_AUDIENCE` | 10 | 4 | 0 | 4 | 1 | 2 | 2 | 1 | 1 | 0 | no | 2 |
| `E_UNKNOWN_TELEMETRY_COLLECTOR` | 14 | 1 | 0 | 1 | 2 | 1 | 2 | 1 | 2 | 0 | no | 1 |
| `E_UNRESOLVED_APPLICATION` | 10 | 3 | 1 | 2 | 4 | 1 | 0 | 1 | 2 | 0 | no | 3 |
| `E_ASSET_NOT_FOUND` | 10 | 1 | 0 | 3 | 2 | 1 | 2 | 1 | 1 | 0 | no | 1 |
| `E_SHARED_DECLARATION_DUPLICATED` | 10 | 1 | 1 | 2 | 2 | 2 | 2 | 1 | 3 | 0 | no | 1 |
| `E_UNKNOWN_TIER_PROXY` | 14 | 1 | 0 | 2 | 3 | 2 | 2 | 1 | 1 | 0 | no | 2 |
| `E_UNLOCKED_IMAGE` | 14 | 3 | 0 | 7 | 6 | 1 | 0 | 0 | 1 | 0 | no | 7 |
| `E_UNKNOWN_SURFACE` | 10 | 4 | 1 | 4 | 5 | 2 | 5 | 2 | 4 | 1 | no | 6 |

## Terms

Sorted by chapters plus ADRs naming the term, then by `src/` plus `emf/`
files, then by example files. A `*` marks a one-word term, whose code counts
are an upper bound.

| term | chapters | ADRs | other `CONTEXT.md` mentions | example files | `src/` files | `emf/` files | ledgers | issues and PRs |
|---|--:|--:|--:|--:|--:|--:|--:|--:|
| API Holder | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| Hardening Class | 0 | 0 | 0 | 3 | 2 | 3 | 0 | 4 |
| Env Variable | 0 | 0 | 1 | 1 | 7 | 5 | 0 | 0 |
| Expand, then contract | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| Rendered artifact | 2 | 0 | 0 | 0 | 3 | 0 | 0 | 4 |
| Handover ledger | 2 | 0 | 0 | 5 | 3 | 3 | 1 | 6 |
| Alert Class | 1 | 1 | 0 | 28 | 4 | 6 | 0 | 5 |
| Shared Intent | 1 | 1 | 4 | 6 | 7 | 4 | 1 | 6 |
| data role | 2 | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| Move method | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 4 |
| Pin source | 2 | 1 | 0 | 1 | 4 | 0 | 1 | 18 |
| Migration policy | 3 | 0 | 1 | 8 | 1 | 3 | 0 | 1 |
| ResolvedApplication * | 1 | 2 | 1 | 12 | 12 | 4 | 0 | 4 |
| Compatibility proof | 2 | 2 | 1 | 1 | 0 | 0 | 0 | 1 |
| Capacity exception | 3 | 1 | 0 | 1 | 0 | 0 | 0 | 2 |
| Three-model pipeline | 1 | 3 | 2 | 1 | 0 | 0 | 0 | 5 |
| Migration plan | 3 | 1 | 0 | 0 | 3 | 1 | 0 | 2 |
| Migration Proof | 2 | 2 | 0 | 2 | 9 | 8 | 0 | 6 |
| Schema version | 1 | 3 | 0 | 125 | 12 | 8 | 0 | 5 |
| Effective Intent | 1 | 3 | 0 | 0 | 21 | 7 | 0 | 12 |
| Adapter port | 2 | 3 | 0 | 0 | 0 | 0 | 1 | 0 |
| Infrastructure Intent | 2 | 3 | 1 | 0 | 0 | 0 | 0 | 9 |
| Availability * | 3 | 2 | 1 | 5 | 0 | 0 | 0 | 6 |
| Prepare Process | 4 | 1 | 0 | 4 | 3 | 3 | 0 | 4 |
| Application revision | 4 | 1 | 0 | 2 | 6 | 2 | 0 | 8 |
| Delivery machinery | 3 | 2 | 1 | 4 | 3 | 6 | 1 | 12 |
| ComposedIntent * | 4 | 2 | 0 | 1 | 0 | 0 | 0 | 0 |
| The foundation | 4 | 2 | 0 | 6 | 0 | 2 | 0 | 10 |
| Owner role | 4 | 2 | 1 | 4 | 3 | 2 | 0 | 2 |
| Durability policy | 5 | 1 | 0 | 4 | 2 | 4 | 0 | 3 |
| Composition lock | 2 | 4 | 1 | 1 | 7 | 0 | 1 | 8 |
| Bootstrap set | 5 | 2 | 2 | 0 | 0 | 0 | 0 | 5 |
| Unmanaged surface | 5 | 2 | 1 | 1 | 0 | 0 | 0 | 1 |
| Pause * | 4 | 3 | 4 | 1 | 3 | 0 | 0 | 14 |
| Backup Identity | 5 | 2 | 0 | 4 | 7 | 3 | 0 | 10 |
| Fence * | 5 | 3 | 2 | 0 | 0 | 0 | 0 | 11 |
| Isolated * | 3 | 5 | 0 | 3 | 3 | 0 | 0 | 9 |
| Participants * | 4 | 4 | 0 | 1 | 6 | 0 | 1 | 6 |
| Runtime Profile | 5 | 3 | 0 | 10 | 5 | 3 | 0 | 6 |
| Dependency edge | 5 | 3 | 1 | 4 | 7 | 7 | 0 | 10 |
| Audience * | 5 | 3 | 2 | 37 | 9 | 8 | 1 | 6 |
| Stable Address | 6 | 3 | 0 | 0 | 0 | 0 | 0 | 13 |
| Pinned input set | 7 | 2 | 1 | 1 | 0 | 0 | 0 | 1 |
| Deliverable Set | 4 | 5 | 1 | 2 | 0 | 2 | 0 | 13 |
| renderHash * | 5 | 4 | 1 | 11 | 2 | 3 | 0 | 4 |
| Sidecar * | 4 | 5 | 0 | 7 | 4 | 4 | 1 | 16 |
| Env File | 4 | 5 | 2 | 18 | 11 | 6 | 0 | 11 |
| Vault policy job | 5 | 4 | 0 | 2 | 10 | 8 | 1 | 17 |
| Release Unit | 6 | 4 | 1 | 10 | 1 | 1 | 0 | 6 |
| Primary * | 6 | 4 | 0 | 7 | 3 | 1 | 0 | 9 |
| API access | 6 | 4 | 1 | 10 | 8 | 9 | 1 | 4 |
| Cutover * | 6 | 4 | 2 | 110 | 10 | 7 | 0 | 24 |
| Collector * | 8 | 3 | 2 | 35 | 6 | 5 | 0 | 19 |
| Bidirectional ledger | 8 | 4 | 0 | 0 | 0 | 0 | 0 | 1 |
| ClusterState snapshot | 6 | 6 | 3 | 4 | 4 | 3 | 1 | 12 |
| Placeholder * | 4 | 8 | 2 | 16 | 6 | 5 | 0 | 23 |
| Exposure * | 9 | 3 | 5 | 47 | 14 | 8 | 1 | 26 |
| Estate repository | 5 | 8 | 2 | 3 | 3 | 0 | 0 | 15 |
| Durability Class | 8 | 5 | 2 | 10 | 5 | 5 | 1 | 7 |
| Platform Intent | 7 | 6 | 3 | 54 | 24 | 12 | 1 | 22 |
| Rollback * | 7 | 7 | 2 | 1 | 3 | 0 | 1 | 22 |
| Switchover * | 6 | 8 | 3 | 16 | 7 | 4 | 0 | 17 |
| Probe * | 6 | 8 | 0 | 10 | 8 | 7 | 0 | 17 |
| Authority * | 7 | 9 | 1 | 6 | 1 | 1 | 1 | 7 |
| Intent Fragment | 9 | 7 | 3 | 22 | 5 | 3 | 1 | 7 |
| Reconcile Unit | 8 | 8 | 1 | 16 | 6 | 3 | 1 | 9 |
| Capability * | 8 | 9 | 0 | 10 | 1 | 2 | 2 | 6 |
| Secret Store | 8 | 9 | 2 | 40 | 14 | 8 | 1 | 22 |
| Asset * | 8 | 9 | 2 | 10 | 15 | 10 | 0 | 20 |
| Instance * | 9 | 10 | 4 | 103 | 5 | 13 | 0 | 30 |
| Route * | 8 | 11 | 2 | 16 | 11 | 11 | 1 | 19 |
| Node contract | 10 | 10 | 2 | 50 | 14 | 12 | 1 | 22 |
| Metamodel * | 4 | 16 | 3 | 0 | 1 | 40 | 2 | 68 |
| Images lock | 9 | 12 | 0 | 23 | 15 | 10 | 1 | 21 |
| Migration * | 9 | 13 | 19 | 46 | 24 | 17 | 2 | 43 |
| Resolved Deployment | 4 | 18 | 6 | 6 | 34 | 23 | 1 | 46 |
| Project Intent | 9 | 13 | 3 | 49 | 33 | 25 | 1 | 43 |
| Release Gate | 8 | 15 | 4 | 34 | 9 | 6 | 1 | 45 |
| Provider * | 9 | 14 | 4 | 15 | 9 | 7 | 0 | 26 |
| Volume * | 9 | 14 | 3 | 40 | 11 | 8 | 1 | 22 |
| Placement * | 10 | 13 | 3 | 115 | 12 | 8 | 0 | 33 |
| Deliverable * | 7 | 17 | 4 | 6 | 14 | 8 | 1 | 24 |
| Pin * | 9 | 16 | 11 | 2 | 10 | 0 | 2 | 54 |
| Engine * | 8 | 18 | 6 | 36 | 18 | 9 | 2 | 37 |
| Down * | 7 | 22 | 2 | 8 | 1 | 3 | 1 | 24 |
| Grant * | 10 | 19 | 3 | 36 | 20 | 10 | 1 | 46 |
| Held * | 9 | 21 | 5 | 11 | 15 | 4 | 1 | 48 |
| Surface * | 8 | 23 | 9 | 68 | 20 | 13 | 1 | 52 |
| Move * | 9 | 23 | 7 | 5 | 6 | 4 | 1 | 66 |
| Adapter * | 8 | 24 | 5 | 6 | 14 | 4 | 2 | 31 |
| Composition * | 9 | 31 | 10 | 14 | 19 | 3 | 1 | 72 |
| Process * | 11 | 55 | 38 | 93 | 44 | 16 | 2 | 109 |
| Application * | 11 | 60 | 35 | 135 | 43 | 21 | 2 | 120 |
| Project * | 11 | 63 | 39 | 206 | 63 | 61 | 1 | 169 |
| Tier * | 8 | 98 | 2 | 23 | 13 | 13 | 1 | 34 |

## Sections

Every `##` and `###` heading in the chapters. Sorted by inbound links, then
by owned fields found in `src/` and `emf/`, then by size descending. A `###`
section's lines are also counted in its `##` section's.

| chapter | section | lvl | lines | links in | from chapters | from ADRs (normative) | from `CONTEXT.md` | from code and tests | codes (pending) | owned fields: in examples / `src/` / `emf/` | issues and PRs |
|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| 20 | Diagram sources (`#diagram-sources`) | 2 | 367 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 16 | Diagram sources (`#diagram-sources`) | 2 | 212 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 16 | The derivation map (`#the-derivation-map-1`) | 3 | 169 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 14 | Diagram sources (`#diagram-sources`) | 2 | 158 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 10 | Diagram sources (`#diagram-sources`) | 2 | 109 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 50 | The lock lifecycle (`#the-lock-lifecycle`) | 2 | 69 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 60 | Onboarding a new Application (`#onboarding-a-new-application`) | 2 | 64 | 0 | 0 | 0 (0) | 0 | 0 | 2 (0) | none | 0 |
| 40 | Placement (`#placement`) | 3 | 62 | 0 | 0 | 0 (0) | 0 | 0 | 2 (1) | none | 0 |
| 16 | Worked trace: one secret grant (`#worked-trace-one-secret-grant`) | 3 | 61 | 0 | 0 | 0 (0) | 0 | 0 | 4 (1) | none | 0 |
| 40 | Diagram sources (`#diagram-sources`) | 2 | 46 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 00 | Diagram sources (`#diagram-sources`) | 2 | 45 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 16 | The three properties (`#the-three-properties`) | 2 | 44 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 10 | Why the host is authored rather than derived (`#why-the-host-is-authored-rather-than-derived`) | 3 | 42 | 0 | 0 | 0 (0) | 0 | 0 | 1 (0) | none | 0 |
| 50 | Diagram sources (`#diagram-sources`) | 2 | 41 | 0 | 0 | 0 (0) | 0 | 0 | 1 (1) | none | 0 |
| 00 | Retired since the rebuild (`#retired-since-the-rebuild`) | 3 | 40 | 0 | 0 | 0 (0) | 0 | 0 | 1 (0) | none | 0 |
| 40 | The composition run (`#the-composition-run-1`) | 3 | 37 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 00 | The three-model pipeline (`#the-three-model-pipeline-1`) | 3 | 36 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 10 | The two shape rules are derived, not authored (`#the-two-shape-rules-are-derived-not-authored`) | 3 | 35 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 10 | Still to be graded (`#still-to-be-graded`) | 2 | 35 | 0 | 0 | 0 (0) | 0 | 0 | 3 (0) | none | 0 |
| 20 | The namespace row was wrong, and this is the correction (`#the-namespace-row-was-wrong-and-this-is-the-correction`) | 3 | 34 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 10 | What the dimensions must discriminate on (`#what-the-dimensions-must-discriminate-on`) | 3 | 33 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 30 | Diagram sources (`#diagram-sources`) | 2 | 33 | 0 | 0 | 0 (0) | 0 | 0 | 1 (0) | none | 0 |
| 10 | What the model derives, and what it does not (`#what-the-model-derives-and-what-it-does-not`) | 3 | 31 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 20 | The hostname changed sides (`#the-hostname-changed-sides`) | 3 | 30 | 0 | 0 | 0 (0) | 0 | 0 | 1 (0) | none | 0 |
| 60 | Diagram sources (`#diagram-sources`) | 2 | 30 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 55 | Diagram sources (`#diagram-sources`) | 2 | 29 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 10 | Worked examples (`#worked-examples`) | 2 | 27 | 0 | 0 | 0 (0) | 0 | 0 | 2 (0) | none | 0 |
| 30 | Determinism and parity (`#determinism-and-parity`) | 2 | 26 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 30 | The estate, by class (`#the-estate-by-class`) | 3 | 25 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 00 | Examples (`#examples`) | 2 | 23 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 10 | Eligibility, not bin-packing (`#eligibility-not-bin-packing`) | 3 | 23 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 16 | What an edge derives, read outbound (`#what-an-edge-derives-read-outbound`) | 3 | 23 | 0 | 0 | 0 (0) | 0 | 0 | 1 (0) | none | 0 |
| 16 | Open in this chapter (`#open-in-this-chapter`) | 2 | 22 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 10 | Why exposure sits on the Application and `provides` stays on the Process (`#why-exposure-sits-on-the-application-and-provides-stays-on-the-process`) | 3 | 21 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 60 | Bootstrap order (`#bootstrap-order-1`) | 3 | 21 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 16 | Worked trace: one exposure declaration (`#worked-trace-one-exposure-declaration-1`) | 3 | 18 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 50 | What a lock guarantees (`#what-a-lock-guarantees`) | 3 | 18 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 30 | Delivery reads this tree (`#delivery-reads-this-tree`) | 2 | 17 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 50 | Delivery is chapter 55's, co-testing stays parked (`#delivery-is-chapter-55s-co-testing-stays-parked`) | 2 | 17 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 50 | Open in this chapter (`#open-in-this-chapter`) | 2 | 17 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 50 | When a new lock exists (`#when-a-new-lock-exists`) | 3 | 16 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 50 | What a lock is not (`#what-a-lock-is-not`) | 3 | 16 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 50 | Release Unit switchover (`#release-unit-switchover-1`) | 3 | 16 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 50 | The change, end to end (`#the-change-end-to-end-1`) | 3 | 16 | 0 | 0 | 0 (0) | 0 | 0 | 1 (1) | none | 0 |
| 10 | A privileged port needs the capability that binds it (`#a-privileged-port-needs-the-capability-that-binds-it`) | 3 | 15 | 0 | 0 | 0 (0) | 0 | 0 | 1 (0) | none | 0 |
| 14 | What it does not contain (`#what-it-does-not-contain`) | 2 | 14 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 16 | What the properties would have caught (`#what-the-properties-would-have-caught`) | 2 | 13 | 0 | 0 | 0 (0) | 0 | 0 | 1 (0) | none | 0 |
| 60 | Blueprint packs (`#blueprint-packs`) | 2 | 13 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 14 | Open in this chapter (`#open-in-this-chapter`) | 2 | 12 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 16 | 1. Provenance: no Deliverable has in-degree zero (`#1-provenance-no-deliverable-has-in-degree-zero`) | 3 | 12 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 16 | 2. Single authority: no field has two declaring sites (`#2-single-authority-no-field-has-two-declaring-sites`) | 3 | 10 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 10 | What does not move (`#what-does-not-move`) | 3 | 9 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 40 | Delivery and co-testing (`#delivery-and-co-testing`) | 2 | 8 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 20 | `namespace` is still not restatable (`#namespace-is-still-not-restatable`) | 3 | 7 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 15 | Open in this chapter (`#open-in-this-chapter`) | 2 | 6 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 60 | Before the first production apply (`#before-the-first-production-apply`) | 2 | 83 | 0 | 0 | 0 (0) | 0 | 0 | 4 (1) | 1: 0 / 0 / 1 | 0 |
| 60 | Restore (`#restore`) | 3 | 33 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | 1: 0 / 0 / 1 | 0 |
| 40 | Cross-application references (`#cross-application-references`) | 2 | 21 | 0 | 0 | 0 (0) | 0 | 0 | 1 (0) | 1: 0 / 1 / 0 | 0 |
| 40 | Version rollout (`#version-rollout`) | 2 | 50 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | 2: 1 / 1 / 1 | 0 |
| 30 | The true gap (`#the-true-gap`) | 3 | 20 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | 1: 1 / 1 / 1 | 0 |
| 10 | The authored proxy vocabulary is two fields (`#the-authored-proxy-vocabulary-is-two-fields`) | 3 | 50 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | 3: 0 / 2 / 2 | 0 |
| 14 | Probe and ephemeral policy (`#probe-and-ephemeral-policy`) | 2 | 23 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | 2: 2 / 2 / 2 | 0 |
| 00 | Decision register (`#decision-register`) | 2 | 19 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | 3: 0 / 3 / 1 | 0 |
| 10 | What layer 1 may never contain (`#what-layer-1-may-never-contain`) | 2 | 35 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | 7: 2 / 3 / 3 | 0 |
| 10 | Audience is the single vocabulary (`#audience-is-the-single-vocabulary`) | 3 | 21 | 0 | 0 | 0 (0) | 0 | 0 | 2 (1) | 6: 0 / 3 / 3 | 0 |
| 15 | What placement reads (`#what-placement-reads`) | 2 | 25 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | 6: 3 / 4 / 3 | 0 |
| 10 | Absent or `none` (`#absent-or-none`) | 3 | 24 | 0 | 0 | 0 (0) | 0 | 0 | 0 (0) | 5: 1 / 4 / 5 | 0 |
| 15 | The model (`#the-model`) | 2 | 29 | 0 | 0 | 0 (0) | 0 | 0 | 3 (3) | 13: 5 / 8 / 6 | 0 |
| 20 | The Resolved Deployment model (`#the-resolved-deployment-model`) | 3 | 313 | 1 | 1 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 14 | The Platform Intent model (`#the-platform-intent-model`) | 3 | 156 | 1 | 1 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 10 | The layer-1 model (`#the-layer-1-model`) | 3 | 100 | 1 | 1 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 20 | The Resolved Deployment (`#the-resolved-deployment`) | 2 | 52 | 1 | 0 | 1 (1) | 0 | 0 | 0 (0) | none | 0 |
| 40 | References (`#references`) | 3 | 52 | 1 | 1 | 0 (0) | 0 | 0 | 7 (3) | 1: 1 / 0 / 0 | 0 |
| 10 | The model (`#the-model`) | 2 | 51 | 1 | 0 | 0 (0) | 0 | 1 | 0 (0) | none | 0 |
| 60 | Adopting a live Application (`#adopting-a-live-application`) | 2 | 41 | 1 | 1 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 14 | Where a vocabulary lives (`#where-a-vocabulary-lives`) | 2 | 38 | 1 | 0 | 1 (0) | 0 | 0 | 0 (0) | none | 0 |
| 40 | Publication, and why the lock is an output (`#publication-and-why-the-lock-is-an-output`) | 3 | 36 | 1 | 0 | 0 (0) | 0 | 0 | 0 (0) | 1: 0 / 0 / 0 | 0 |
| 40 | Open in this chapter (`#open-in-this-chapter`) | 2 | 34 | 1 | 1 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 20 | The Resolved Deployment: pinned inputs and outputs (`#the-resolved-deployment-pinned-inputs-and-outputs`) | 3 | 33 | 1 | 1 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 40 | Secrets (`#secrets`) | 3 | 33 | 1 | 1 | 0 (0) | 0 | 0 | 7 (4) | none | 0 |
| 10 | The UID is a pinned input, and the volume needs a group (`#the-uid-is-a-pinned-input-and-the-volume-needs-a-group`) | 3 | 32 | 1 | 1 | 0 (0) | 0 | 0 | 1 (1) | 1: 0 / 0 / 0 | 0 |
| 15 | The document (`#the-document`) | 2 | 32 | 1 | 0 | 1 (1) | 0 | 0 | 0 (0) | none | 0 |
| 14 | There is nothing to override here (`#there-is-nothing-to-override-here`) | 2 | 31 | 1 | 0 | 1 (1) | 0 | 0 | 1 (1) | none | 0 |
| 60 | Adoption order across the estate (`#adoption-order-across-the-estate`) | 2 | 31 | 1 | 1 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 10 | Dependencies (`#dependencies`) | 3 | 27 | 1 | 1 | 0 (0) | 0 | 0 | 1 (0) | none | 0 |
| 30 | The render, end to end (`#the-render-end-to-end`) | 3 | 24 | 1 | 1 | 0 (0) | 0 | 0 | 1 (0) | none | 0 |
| 10 | Delivery reads these declarations, and co-testing stays parked (`#delivery-reads-these-declarations-and-co-testing-stays-parked`) | 2 | 23 | 1 | 1 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 50 | A provider that moves (`#a-provider-that-moves`) | 2 | 23 | 1 | 0 | 1 (0) | 0 | 0 | 0 (0) | none | 0 |
| 60 | Bootstrap order (`#bootstrap-order`) | 2 | 23 | 1 | 1 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 55 | The release, end to end (`#the-release-end-to-end`) | 3 | 22 | 1 | 1 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 16 | Worked trace: one exposure declaration (`#worked-trace-one-exposure-declaration`) | 3 | 21 | 1 | 1 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 10 | Why the project level exists (`#why-the-project-level-exists`) | 3 | 20 | 1 | 1 | 0 (0) | 0 | 0 | 1 (1) | none | 0 |
| 16 | No Role grants what an absence already denies (`#no-role-grants-what-an-absence-already-denies`) | 3 | 20 | 1 | 0 | 1 (1) | 0 | 0 | 1 (0) | none | 0 |
| 10 | Hardening (`#hardening`) | 3 | 18 | 1 | 0 | 1 (0) | 0 | 0 | 0 (0) | none | 2 |
| 40 | A missed publish is a deletion (`#a-missed-publish-is-a-deletion`) | 3 | 18 | 1 | 0 | 1 (0) | 0 | 0 | 1 (0) | none | 1 |
| 10 | Why `gpu` is structured (`#why-gpu-is-structured`) | 3 | 17 | 1 | 1 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 14 | Handover ledger (`#handover-ledger`) | 2 | 17 | 1 | 1 | 0 (0) | 0 | 0 | 2 (0) | none | 1 |
| 40 | Completeness (`#completeness`) | 3 | 17 | 1 | 1 | 0 (0) | 0 | 0 | 8 (5) | none | 0 |
| 10 | Labels are not the Application's to name (`#labels-are-not-the-applications-to-name`) | 3 | 16 | 1 | 1 | 0 (0) | 0 | 0 | 1 (1) | none | 0 |
| 16 | What a dependency edge derives (`#what-a-dependency-edge-derives`) | 3 | 16 | 1 | 1 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 16 | 3. No dead declarations: no declaration has out-degree zero (`#3-no-dead-declarations-no-declaration-has-out-degree-zero`) | 3 | 14 | 1 | 1 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 15 | What is not built (`#what-is-not-built`) | 2 | 13 | 1 | 1 | 0 (0) | 0 | 0 | 0 (0) | 1: 0 / 0 / 0 | 0 |
| 20 | The Reconcile Unit DAG (`#the-reconcile-unit-dag`) | 3 | 12 | 1 | 1 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 30 | Forbidden in a Deliverable (`#forbidden-in-a-deliverable`) | 2 | 12 | 1 | 1 | 0 (0) | 0 | 0 | 6 (5) | none | 0 |
| 50 | The change, end to end (`#the-change-end-to-end`) | 2 | 10 | 1 | 1 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 55 | A release, end to end (`#a-release-end-to-end`) | 2 | 10 | 1 | 1 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 20 | Hardening has no exception surface either (`#hardening-has-no-exception-surface-either`) | 3 | 9 | 1 | 1 | 0 (0) | 0 | 0 | 1 (1) | none | 0 |
| 16 | Delivery and co-testing (`#delivery-and-co-testing`) | 2 | 8 | 1 | 1 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 30 | The rule (`#the-rule`) | 2 | 22 | 1 | 1 | 0 (0) | 0 | 0 | 0 (0) | 1: 0 / 1 / 0 | 0 |
| 10 | No overrides (`#no-overrides`) | 2 | 17 | 1 | 1 | 0 (0) | 0 | 0 | 0 (0) | 1: 0 / 1 / 0 | 0 |
| 30 | The registered set (`#the-registered-set`) | 3 | 7 | 1 | 1 | 0 (0) | 0 | 0 | 1 (1) | 1: 0 / 1 / 0 | 0 |
| 10 | Pod hardening (`#pod-hardening`) | 2 | 149 | 1 | 1 | 0 (0) | 0 | 0 | 4 (2) | 2: 0 / 1 / 1 | 0 |
| 10 | Access tiers (`#access-tiers`) | 2 | 68 | 1 | 1 | 0 (0) | 0 | 0 | 1 (0) | 1: 1 / 1 / 1 | 0 |
| 10 | Writable paths are declared, not exempted (`#writable-paths-are-declared-not-exempted`) | 3 | 58 | 1 | 1 | 0 (0) | 0 | 0 | 2 (1) | 1: 0 / 1 / 1 | 0 |
| 10 | What the probe derivation completes (`#what-the-probe-derivation-completes`) | 3 | 29 | 1 | 0 | 1 (0) | 0 | 0 | 0 (0) | 1: 1 / 1 / 1 | 0 |
| 30 | Open in this chapter (`#open-in-this-chapter`) | 2 | 21 | 1 | 1 | 0 (0) | 0 | 0 | 1 (0) | 1: 0 / 1 / 1 | 0 |
| 30 | Coverage (`#coverage`) | 2 | 58 | 1 | 1 | 0 (0) | 0 | 0 | 1 (1) | 2: 1 / 2 / 1 | 0 |
| 20 | Worked example: knowledge's projection (`#worked-example-knowledges-projection`) | 2 | 288 | 1 | 0 | 0 (0) | 0 | 0 | 2 (0) | 4: 2 / 2 / 2 | 0 |
| 00 | Chapters (`#chapters`) | 2 | 48 | 1 | 0 | 0 (0) | 0 | 0 | 0 (0) | 3: 1 / 2 / 2 | 0 |
| 10 | Rollout (`#rollout`) | 2 | 109 | 1 | 1 | 0 (0) | 0 | 0 | 7 (4) | 4: 1 / 3 / 3 | 0 |
| 10 | Probes (`#probes`) | 2 | 96 | 1 | 0 | 1 (1) | 0 | 0 | 0 (0) | 3: 3 / 3 / 3 | 0 |
| 20 | Why the hatch closed (`#why-the-hatch-closed`) | 3 | 40 | 1 | 0 | 1 (0) | 0 | 0 | 0 (0) | 9: 0 / 3 / 3 | 0 |
| 10 | Grant unit (`#grant-unit`) | 2 | 44 | 2 | 1 | 1 (1) | 0 | 0 | 1 (1) | none | 0 |
| 30 | Ledgers (`#ledgers`) | 2 | 44 | 2 | 1 | 1 (1) | 0 | 0 | 5 (4) | none | 0 |
| 10 | What is checked (`#what-is-checked`) | 3 | 41 | 2 | 0 | 0 (0) | 0 | 1 | 5 (0) | none | 0 |
| 00 | Substrate (`#substrate`) | 2 | 38 | 2 | 0 | 1 (1) | 0 | 0 | 0 (0) | none | 0 |
| 40 | Why composition exists (`#why-composition-exists`) | 2 | 29 | 2 | 0 | 1 (1) | 0 | 0 | 0 (0) | none | 0 |
| 20 | The forward-auth endpoint (`#the-forward-auth-endpoint`) | 3 | 27 | 2 | 1 | 1 (0) | 0 | 0 | 1 (0) | none | 0 |
| 10 | Which tier may use which delivery (`#which-tier-may-use-which-delivery`) | 3 | 25 | 2 | 0 | 0 (0) | 0 | 1 | 1 (0) | none | 0 |
| 00 | The estate (`#the-estate`) | 2 | 21 | 2 | 0 | 1 (1) | 0 | 0 | 0 (0) | none | 0 |
| 14 | The document (`#the-document`) | 2 | 21 | 2 | 1 | 1 (1) | 0 | 0 | 2 (0) | none | 0 |
| 10 | The YAML subset that is read (`#the-yaml-subset-that-is-read`) | 3 | 14 | 2 | 1 | 0 (0) | 0 | 1 | 0 (0) | none | 0 |
| 00 | Programme scope (`#programme-scope`) | 2 | 49 | 2 | 1 | 0 (0) | 0 | 0 | 0 (0) | 1: 0 / 1 / 0 | 0 |
| 00 | Open items (`#open-items`) | 2 | 174 | 2 | 0 | 1 (0) | 0 | 0 | 4 (0) | 2: 0 / 2 / 0 | 1 |
| 30 | Path allocation (`#path-allocation`) | 3 | 38 | 2 | 1 | 0 (0) | 0 | 1 | 0 (0) | 2: 1 / 2 / 1 | 0 |
| 10 | Three placeholder sources (`#three-placeholder-sources`) | 3 | 56 | 2 | 0 | 0 (0) | 0 | 1 | 2 (0) | 3: 3 / 2 / 2 | 0 |
| 10 | Zero-downtime rotation (`#zero-downtime-rotation`) | 3 | 36 | 2 | 1 | 0 (0) | 0 | 0 | 3 (0) | 2: 1 / 2 / 2 | 0 |
| 10 | Ports and surfaces (`#ports-and-surfaces`) | 2 | 54 | 2 | 2 | 0 (0) | 0 | 0 | 0 (0) | 7: 4 / 3 / 3 | 0 |
| 14 | The model (`#the-model`) | 2 | 50 | 2 | 0 | 0 (0) | 0 | 2 | 22 (3) | 4: 4 / 4 / 4 | 0 |
| 30 | Attribution (`#attribution`) | 2 | 115 | 2 | 0 | 0 (0) | 0 | 2 | 1 (0) | 23: 17 / 22 / 21 | 0 |
| 50 | Release Unit switchover (`#release-unit-switchover`) | 2 | 76 | 3 | 3 | 0 (0) | 0 | 0 | 2 (0) | none | 0 |
| 10 | Sidecars (`#sidecars`) | 3 | 52 | 3 | 1 | 1 (1) | 0 | 0 | 1 (1) | none | 0 |
| 50 | Expand and contract (`#expand-and-contract`) | 2 | 48 | 3 | 1 | 1 (0) | 0 | 0 | 1 (1) | none | 0 |
| 16 | Audit before enforce (`#audit-before-enforce`) | 3 | 47 | 3 | 1 | 1 (0) | 0 | 1 | 3 (1) | none | 0 |
| 14 | The foundation is declared (`#the-foundation-is-declared`) | 2 | 36 | 3 | 1 | 1 (1) | 0 | 0 | 0 (0) | none | 0 |
| 16 | The token is mounted only where the pod authenticates (`#the-token-is-mounted-only-where-the-pod-authenticates`) | 3 | 25 | 3 | 1 | 1 (0) | 0 | 0 | 0 (0) | none | 0 |
| 16 | What a grant confers (`#what-a-grant-confers`) | 3 | 23 | 3 | 0 | 0 (0) | 0 | 3 | 0 (0) | none | 0 |
| 14 | Hardening policy (`#hardening-policy`) | 2 | 22 | 3 | 1 | 1 (1) | 0 | 0 | 1 (1) | none | 0 |
| 16 | What an edge derives, read inbound (`#what-an-edge-derives-read-inbound`) | 3 | 21 | 3 | 3 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 10 | Rollback (`#rollback`) | 3 | 19 | 3 | 3 | 0 (0) | 0 | 0 | 2 (2) | none | 2 |
| 55 | Migrations (`#migrations`) | 2 | 19 | 3 | 2 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 15 | One cluster, written down (`#one-cluster-written-down`) | 2 | 12 | 3 | 0 | 1 (1) | 0 | 0 | 0 (0) | none | 0 |
| 40 | Unmanaged surfaces (`#unmanaged-surfaces`) | 2 | 72 | 3 | 2 | 1 (0) | 0 | 0 | 4 (2) | 3: 0 / 1 / 0 | 0 |
| 40 | The composition lock (`#the-composition-lock`) | 2 | 64 | 3 | 2 | 0 (0) | 0 | 1 | 2 (0) | 1: 0 / 1 / 0 | 0 |
| 10 | Sharing merges, and a duplicate is refused (`#sharing-merges-and-a-duplicate-is-refused`) | 3 | 52 | 3 | 1 | 0 (0) | 0 | 1 | 1 (0) | 1: 0 / 1 / 0 | 0 |
| 16 | The derivation map (`#the-derivation-map`) | 2 | 81 | 3 | 2 | 0 (0) | 0 | 0 | 1 (0) | 1: 0 / 1 / 1 | 0 |
| 10 | Replicas, and the disruption budget (`#replicas-and-the-disruption-budget`) | 3 | 25 | 3 | 1 | 1 (0) | 0 | 1 | 0 (0) | 1: 1 / 1 / 1 | 0 |
| 10 | What a schema refusal reports (`#what-a-schema-refusal-reports`) | 3 | 19 | 3 | 0 | 0 (0) | 0 | 2 | 0 (0) | 1: 1 / 1 / 1 | 0 |
| 10 | Rotation is not a release (`#rotation-is-not-a-release`) | 3 | 24 | 3 | 2 | 1 (0) | 0 | 0 | 0 (0) | 2: 1 / 2 / 2 | 1 |
| 14 | Tiers (`#tiers`) | 2 | 34 | 3 | 1 | 0 (0) | 1 | 0 | 3 (0) | 3: 2 / 2 / 3 | 0 |
| 14 | Substrate facts (`#substrate-facts`) | 2 | 27 | 3 | 2 | 1 (0) | 0 | 0 | 1 (0) | 4: 4 / 4 / 4 | 0 |
| 55 | What a pin source holds (`#what-a-pin-source-holds`) | 3 | 30 | 3 | 2 | 0 (0) | 1 | 0 | 0 (0) | 7: 5 / 7 / 2 | 3 |
| 20 | The model (`#the-model`) | 2 | 70 | 3 | 0 | 0 (0) | 0 | 2 | 0 (0) | 5: 5 / 5 / 5 | 1 |
| 30 | How each adapter spells the projection (`#how-each-adapter-spells-the-projection`) | 3 | 44 | 3 | 1 | 0 (0) | 0 | 2 | 1 (0) | 21: 17 / 21 / 21 | 2 |
| 40 | The composition run (`#the-composition-run`) | 2 | 61 | 4 | 1 | 0 (0) | 0 | 3 | 4 (1) | none | 0 |
| 20 | Open in this chapter (`#open-in-this-chapter`) | 2 | 59 | 4 | 2 | 1 (0) | 0 | 0 | 3 (1) | 1: 0 / 0 / 0 | 0 |
| 00 | The three-model pipeline (`#the-three-model-pipeline`) | 2 | 57 | 4 | 1 | 1 (1) | 1 | 0 | 0 (0) | none | 0 |
| 60 | The Estate repository (`#the-estate-repository`) | 2 | 43 | 4 | 1 | 1 (0) | 0 | 0 | 0 (0) | none | 1 |
| 60 | CNI (`#cni`) | 2 | 40 | 4 | 2 | 1 (0) | 0 | 0 | 0 (0) | none | 0 |
| 10 | Capacity (`#capacity`) | 2 | 32 | 4 | 3 | 0 (0) | 0 | 0 | 0 (0) | none | 0 |
| 10 | Validation (`#validation`) | 3 | 26 | 4 | 1 | 0 (0) | 0 | 1 | 10 (2) | none | 0 |
| 16 | The migration identity's policy (`#the-migration-identitys-policy`) | 3 | 23 | 4 | 2 | 0 (0) | 0 | 2 | 0 (0) | none | 0 |
| 14 | Providers (`#providers`) | 2 | 22 | 4 | 2 | 0 (0) | 1 | 0 | 0 (0) | none | 0 |
| 10 | A quantity is never shared (`#a-quantity-is-never-shared`) | 3 | 17 | 4 | 1 | 0 (0) | 0 | 0 | 3 (0) | none | 0 |
| 14 | Monitor cadence (`#monitor-cadence`) | 2 | 12 | 4 | 3 | 0 (0) | 0 | 0 | 0 (0) | none | 1 |
| 60 | Platform facts and restore (`#platform-facts-and-restore`) | 2 | 55 | 4 | 1 | 1 (1) | 0 | 0 | 0 (0) | 1: 0 / 0 / 1 | 0 |
| 10 | The label set (`#the-label-set`) | 2 | 46 | 4 | 2 | 1 (1) | 0 | 1 | 0 (0) | 1: 1 / 1 / 1 | 0 |
| 10 | Availability (`#availability`) | 3 | 25 | 4 | 1 | 1 (1) | 1 | 0 | 2 (2) | 2: 0 / 1 / 1 | 1 |
| 20 | The Vault policy job (`#the-vault-policy-job`) | 2 | 24 | 4 | 1 | 0 (0) | 0 | 3 | 0 (0) | 1: 1 / 1 / 1 | 0 |
| 16 | The baseline (`#the-baseline`) | 3 | 19 | 4 | 2 | 0 (0) | 0 | 2 | 0 (0) | 3: 1 / 1 / 1 | 0 |
| 10 | The closed vocabularies (`#the-closed-vocabularies`) | 2 | 54 | 4 | 1 | 0 (0) | 0 | 1 | 0 (0) | 23: 3 / 22 / 23 | 0 |
| 16 | Dependency edges (`#dependency-edges`) | 2 | 188 | 5 | 1 | 1 (1) | 0 | 2 | 3 (0) | 1: 0 / 0 / 0 | 0 |
| 10 | Two artefacts (`#two-artefacts`) | 2 | 76 | 5 | 2 | 0 (0) | 0 | 2 | 0 (0) | none | 0 |
| 10 | Kubernetes API access (`#kubernetes-api-access`) | 3 | 41 | 5 | 2 | 0 (0) | 1 | 2 | 1 (0) | none | 0 |
| 14 | Durability policy (`#durability-policy`) | 2 | 32 | 5 | 2 | 0 (0) | 0 | 2 | 2 (0) | none | 0 |
| 14 | The Vault policy job (`#the-vault-policy-job`) | 2 | 31 | 5 | 2 | 0 (0) | 0 | 2 | 1 (0) | none | 0 |
| 55 | Held releases (`#held-releases`) | 2 | 15 | 5 | 1 | 0 (0) | 1 | 0 | 0 (0) | none | 0 |
| 16 | Network policy (`#network-policy`) | 2 | 251 | 5 | 2 | 1 (1) | 0 | 2 | 4 (1) | 3: 1 / 1 / 1 | 0 |
| 10 | The dotenv subset that is read (`#the-dotenv-subset-that-is-read`) | 3 | 32 | 5 | 0 | 1 (0) | 0 | 3 | 0 (0) | 1: 0 / 1 / 1 | 0 |
| 10 | Configuration (`#configuration`) | 2 | 134 | 5 | 1 | 1 (1) | 0 | 2 | 3 (0) | 2: 0 / 2 / 1 | 0 |
| 10 | Secret references (`#secret-references`) | 2 | 126 | 5 | 1 | 0 (0) | 0 | 3 | 11 (2) | 3: 3 / 2 / 2 | 0 |
| 10 | Storage and durability (`#storage-and-durability`) | 2 | 94 | 5 | 2 | 1 (1) | 0 | 0 | 2 (2) | 3: 2 / 2 / 2 | 0 |
| 14 | Move methods (`#move-methods`) | 3 | 46 | 5 | 2 | 1 (1) | 1 | 0 | 1 (1) | 6: 0 / 2 / 2 | 2 |
| 20 | No overrides (`#no-overrides`) | 2 | 77 | 5 | 2 | 1 (1) | 0 | 0 | 2 (2) | 9: 0 / 3 / 3 | 0 |
| 10 | Application identity (`#application-identity`) | 2 | 119 | 6 | 3 | 2 (2) | 0 | 0 | 3 (0) | none | 0 |
| 20 | The images lock (`#the-images-lock`) | 3 | 76 | 6 | 3 | 0 (0) | 1 | 1 | 4 (1) | 1: 0 / 0 / 0 | 2 |
| 60 | Secrets at rest (`#secrets-at-rest`) | 2 | 61 | 6 | 4 | 1 (0) | 0 | 0 | 1 (0) | none | 0 |
| 55 | Scope (`#scope`) | 2 | 42 | 6 | 3 | 2 (2) | 0 | 0 | 0 (0) | none | 0 |
| 55 | Release order (`#release-order`) | 2 | 22 | 6 | 2 | 1 (0) | 0 | 0 | 0 (0) | none | 2 |
| 20 | Publish back (`#publish-back`) | 2 | 51 | 6 | 4 | 1 (0) | 0 | 0 | 0 (0) | 1: 0 / 0 / 1 | 0 |
| 20 | The Collector (`#the-collector`) | 3 | 70 | 6 | 2 | 1 (1) | 1 | 0 | 0 (0) | 1: 1 / 1 / 1 | 1 |
| 10 | Delivery (`#delivery`) | 2 | 94 | 6 | 2 | 2 (1) | 0 | 0 | 3 (0) | 2: 1 / 2 / 2 | 0 |
| 30 | The adapter port (`#the-adapter-port`) | 2 | 50 | 6 | 1 | 2 (0) | 0 | 1 | 5 (4) | 3: 0 / 2 / 2 | 0 |
| 10 | Process (`#process`) | 2 | 166 | 6 | 2 | 1 (1) | 0 | 0 | 5 (1) | 4: 1 / 3 / 3 | 1 |
| 40 | The estate-wide invariants (`#the-estate-wide-invariants`) | 2 | 262 | 7 | 1 | 1 (0) | 0 | 2 | 32 (15) | 1: 1 / 0 / 0 | 0 |
| 40 | Identity (`#identity`) | 3 | 92 | 7 | 4 | 0 (0) | 0 | 0 | 9 (3) | none | 0 |
| 20 | The path plan (`#the-path-plan`) | 2 | 30 | 7 | 3 | 1 (1) | 0 | 0 | 1 (0) | none | 0 |
| 16 | The derived allow set (`#the-derived-allow-set`) | 3 | 21 | 7 | 3 | 0 (0) | 0 | 3 | 0 (0) | none | 1 |
| 55 | Notifications (`#notifications`) | 2 | 18 | 7 | 4 | 1 (0) | 0 | 1 | 0 (0) | none | 1 |
| 14 | Engines (`#engines`) | 2 | 90 | 7 | 4 | 1 (0) | 0 | 0 | 3 (1) | 6: 0 / 2 / 2 | 2 |
| 10 | Placement (`#placement`) | 2 | 184 | 8 | 3 | 1 (1) | 0 | 0 | 5 (1) | none | 0 |
| 40 | Versioning (`#versioning`) | 2 | 64 | 8 | 3 | 2 (2) | 0 | 0 | 1 (1) | 1: 0 / 0 / 0 | 0 |
| 20 | Layer 2 does not assign a node (`#layer-2-does-not-assign-a-node`) | 3 | 35 | 8 | 4 | 0 (0) | 0 | 3 | 2 (1) | none | 0 |
| 16 | The backup identity's policy (`#the-backup-identitys-policy`) | 3 | 26 | 8 | 4 | 1 (1) | 0 | 2 | 0 (0) | none | 0 |
| 10 | Runtime profiles (`#runtime-profiles`) | 3 | 19 | 8 | 1 | 0 (0) | 1 | 4 | 0 (0) | none | 1 |
| 20 | The migration (`#the-migration`) | 2 | 36 | 8 | 3 | 0 (0) | 1 | 4 | 1 (0) | 1: 0 / 1 / 1 | 0 |
| 20 | The Application revision (`#the-application-revision`) | 2 | 25 | 8 | 2 | 1 (0) | 1 | 4 | 0 (0) | 1: 1 / 1 / 1 | 1 |
| 10 | Cutover is declared, not promised (`#cutover-is-declared-not-promised`) | 3 | 45 | 8 | 4 | 0 (0) | 1 | 0 | 3 (0) | 2: 1 / 2 / 2 | 0 |
| 10 | Secrets (`#secrets`) | 2 | 96 | 8 | 2 | 2 (2) | 0 | 2 | 3 (1) | 7: 2 / 6 / 6 | 0 |
| 14 | The Secret Store (`#the-secret-store`) | 2 | 21 | 9 | 1 | 0 (0) | 1 | 3 | 2 (0) | none | 1 |
| 20 | Authority (`#authority`) | 2 | 200 | 9 | 4 | 1 (1) | 0 | 0 | 13 (4) | 2: 0 / 1 / 1 | 0 |
| 14 | The bootstrap set (`#the-bootstrap-set`) | 2 | 38 | 9 | 3 | 1 (0) | 0 | 1 | 1 (1) | 1: 1 / 1 / 1 | 0 |
| 55 | What the render leaves to Flagger (`#what-the-render-leaves-to-flagger`) | 2 | 39 | 9 | 4 | 1 (0) | 1 | 0 | 0 (0) | 2: 1 / 2 / 2 | 1 |
| 10 | Exposure (`#exposure`) | 2 | 255 | 9 | 2 | 1 (1) | 0 | 1 | 8 (2) | 10: 1 / 6 / 6 | 0 |
| 16 | Process identity (`#process-identity`) | 2 | 162 | 10 | 5 | 1 (1) | 0 | 1 | 6 (1) | none | 0 |
| 20 | The Reconcile Unit (`#the-reconcile-unit`) | 2 | 78 | 10 | 3 | 1 (1) | 0 | 4 | 1 (0) | none | 0 |
| 14 | Migration policy (`#migration-policy`) | 2 | 23 | 10 | 2 | 0 (0) | 1 | 2 | 1 (0) | none | 1 |
| 60 | Node facts (`#node-facts`) | 2 | 116 | 10 | 3 | 1 (0) | 0 | 1 | 0 (0) | 3: 0 / 1 / 0 | 0 |
| 10 | Assets (`#assets`) | 2 | 63 | 10 | 1 | 1 (1) | 0 | 5 | 2 (0) | 4: 1 / 1 / 1 | 0 |
| 14 | Telemetry (`#telemetry`) | 2 | 32 | 10 | 1 | 0 (0) | 0 | 4 | 1 (0) | 1: 1 / 1 / 1 | 1 |
| 14 | Kubernetes API access (`#kubernetes-api-access`) | 2 | 41 | 10 | 2 | 0 (0) | 1 | 3 | 2 (0) | 2: 2 / 2 / 2 | 0 |
| 20 | The release gate (`#the-release-gate`) | 2 | 61 | 10 | 4 | 1 (0) | 0 | 3 | 2 (0) | 3: 0 / 3 / 3 | 1 |
| 40 | Participants (`#participants`) | 2 | 96 | 11 | 2 | 1 (1) | 0 | 6 | 5 (0) | 6: 0 / 0 / 0 | 1 |
| 16 | The Stable Address (`#the-stable-address`) | 3 | 57 | 11 | 6 | 1 (1) | 1 | 0 | 0 (0) | 1: 0 / 0 / 0 | 2 |
| 55 | Secret rotation (`#secret-rotation`) | 2 | 32 | 11 | 5 | 1 (1) | 0 | 1 | 0 (0) | none | 2 |
| 10 | The effective intent (`#the-effective-intent`) | 2 | 27 | 11 | 2 | 1 (0) | 0 | 7 | 1 (1) | none | 1 |
| 20 | Derived mechanics (`#derived-mechanics`) | 2 | 162 | 11 | 3 | 2 (2) | 0 | 4 | 5 (2) | 1: 1 / 1 / 1 | 0 |
| 20 | Cluster state (`#cluster-state`) | 2 | 138 | 11 | 4 | 1 (1) | 0 | 3 | 1 (1) | 4: 1 / 1 / 3 | 0 |
| 20 | The move (`#the-move`) | 2 | 58 | 12 | 5 | 1 (0) | 1 | 0 | 3 (3) | none | 2 |
| 16 | The database catalog (`#the-database-catalog`) | 3 | 43 | 12 | 4 | 0 (0) | 1 | 4 | 0 (0) | none | 0 |
| 10 | Shared intent (`#shared-intent`) | 2 | 115 | 12 | 1 | 1 (1) | 0 | 4 | 5 (1) | 1: 0 / 1 / 0 | 1 |
| 10 | Reading a file (`#reading-a-file`) | 2 | 43 | 12 | 2 | 0 (0) | 0 | 2 | 0 (0) | 1: 1 / 1 / 1 | 0 |
| 10 | Prepare Processes (`#prepare-processes`) | 2 | 39 | 13 | 3 | 1 (1) | 1 | 2 | 1 (0) | none | 1 |
| 30 | Adapters (`#adapters`) | 2 | 67 | 14 | 1 | 3 (2) | 0 | 6 | 0 (0) | 5: 2 / 4 / 5 | 0 |
| 55 | Pause and Rollback (`#pause-and-rollback`) | 2 | 66 | 15 | 3 | 1 (1) | 1 | 4 | 0 (0) | none | 1 |
| 40 | A refused Project is isolated (`#a-refused-project-is-isolated`) | 3 | 41 | 15 | 1 | 1 (1) | 1 | 3 | 4 (1) | none | 0 |
| 10 | Observability (`#observability`) | 2 | 87 | 15 | 5 | 1 (1) | 0 | 0 | 3 (0) | 2: 1 / 1 / 1 | 1 |
| 30 | Flagger-ready objects (`#flagger-ready-objects`) | 2 | 21 | 15 | 4 | 2 (1) | 0 | 4 | 0 (0) | 4: 4 / 4 / 4 | 1 |
| 55 | Switchover (`#switchover`) | 2 | 44 | 16 | 4 | 1 (0) | 1 | 4 | 1 (0) | none | 0 |
| 14 | Delivery policy (`#delivery-policy`) | 2 | 57 | 16 | 2 | 0 (0) | 1 | 3 | 4 (1) | 2: 2 / 2 / 2 | 1 |
| 55 | The Release Gate (`#the-release-gate`) | 2 | 63 | 17 | 3 | 2 (1) | 1 | 5 | 0 (0) | none | 1 |
| 16 | Kubernetes API access is declared and admitted (`#kubernetes-api-access-is-declared-and-admitted`) | 3 | 40 | 17 | 7 | 1 (1) | 1 | 4 | 0 (0) | none | 0 |
| 55 | Migration safety (`#migration-safety`) | 2 | 58 | 18 | 4 | 1 (0) | 1 | 2 | 0 (0) | 1: 1 / 1 / 1 | 2 |
| 40 | Fragments (`#fragments`) | 2 | 150 | 19 | 5 | 2 (2) | 1 | 8 | 3 (0) | 1: 0 / 0 / 0 | 2 |
| 20 | Pinned inputs (`#pinned-inputs`) | 2 | 142 | 19 | 3 | 2 (1) | 0 | 10 | 4 (1) | 5: 3 / 4 / 4 | 1 |
| 55 | Moves (`#moves`) | 2 | 76 | 20 | 7 | 1 (1) | 1 | 0 | 0 (0) | none | 3 |
| 60 | Handing over one Project at a time (`#handing-over-one-project-at-a-time`) | 2 | 82 | 26 | 4 | 1 (1) | 1 | 6 | 2 (0) | none | 7 |
| 30 | Vault configuration is rendered, not applied (`#vault-configuration-is-rendered-not-applied`) | 2 | 90 | 27 | 5 | 3 (2) | 1 | 11 | 0 (0) | 1: 1 / 1 / 1 | 0 |
| 55 | Failure and undo (`#failure-and-undo`) | 2 | 62 | 29 | 6 | 1 (0) | 1 | 6 | 0 (0) | 1: 0 / 0 / 0 | 0 |
| 10 | Migration (`#migration`) | 2 | 73 | 31 | 5 | 1 (1) | 1 | 7 | 8 (1) | 3: 2 / 3 / 3 | 1 |
| 55 | Rendered artifacts and pins (`#rendered-artifacts-and-pins`) | 2 | 111 | 34 | 8 | 1 (1) | 1 | 9 | 0 (0) | 8: 6 / 8 / 3 | 6 |
