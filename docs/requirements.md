# Behaviour ledger

This is not [`docs/architecture-rules.md`](architecture-rules.md). That ledger
lists the rules a tool enforces: a dependency-cruiser check, an ESLint rule, a
gate script, each keyed to its enforcer and to the fixture that proves it
fires. This one lists the behaviours a person depends on: a sentence a
contributor or a consumer can rely on, keyed to the test that fails the moment
it stops being true. A behaviour can rest on several rules, and one rule can
serve several behaviours, so the two ledgers stay separate on purpose.

A behaviour can lose its proof without anything saying so: the coverage
ratchet notices a line that stops running, but not a test file that was
renamed, emptied or deleted while the code it covered stayed in place. Every
id is greppable, and a comment naming one resolves to a row rather than to
nothing.
[`scripts/lint-requirements.ts`](../scripts/lint-requirements.ts) is what
holds the ledger honest: every row parses; every named file exists, is a test
file and holds at least one test; ids are unique across every area file; every
area file holds at least one row and this page holds none; and every id cited
anywhere in the tracked tree resolves to a row.

## The areas

The rows live in [`docs/requirements/`](requirements/), one file per area of
the model, so pull requests working on different areas add rows to different
files. Each file holds the same three-column table.

| file | what goes there |
|---|---|
| [`repository.md`](requirements/repository.md) | this repository's own tree: decision records, links, documents, module boundaries, the test harness, coverage, the ledgers, specification codes, the `emf/` wiring |
| [`pipeline.md`](requirements/pipeline.md) | a pull request, a push to `main` or a release: titles and commits, the pull request report, release candidates, the published package, mutation testing |
| [`intent.md`](requirements/intent.md) | the authored documents before resolution: parsing, the metamodel and its JSON Schemas, refusals, env files, Shared Intent, canonical oracle JSON |
| [`resolution.md`](requirements/resolution.md) | layer 2 as a whole: the Resolved Deployment, Application revisions, Aliases and Stable Addresses, the foundation, the render of the composed union |
| [`processes.md`](requirements/processes.md) | one Process's pod: containers, sidecars, Assets, placement, GPU, VPN, Spread, priority, lifecycle, API access, egress, the Hardening Class |
| [`volumes-and-engines.md`](requirements/volumes-and-engines.md) | state: Volumes and Durability Classes, backups, Engines and catalog methods, Edge credentials, Migrations, Moves, Seeded Assets |
| [`exposures-and-tiers.md`](requirements/exposures-and-tiers.md) | the edge: Exposures, Routes, Tiers and Edge proxies, L4 Addresses, Tier DNS, TLS, rate limits, Shared Middlewares, Upstream nameservers |
| [`sign-in.md`](requirements/sign-in.md) | sign-in: forward-auth, Clients and Sign-in Modes, Identity files |
| [`grants-and-secrets.md`](requirements/grants-and-secrets.md) | secrets: Grants and their delivery, Static secrets, Generated and Optional keys, the Vault Secrets Operator, the Vault policy job |
| [`node-agents.md`](requirements/node-agents.md) | the nodes: the node contract and the Node Agents derived from it |
| [`monitoring.md`](requirements/monitoring.md) | observability: monitors, Dashboards, rule groups, Receivers, external checks |
| [`composition-and-delivery.md`](requirements/composition-and-delivery.md) | composing and delivering the estate: Intent Fragments, Participants, the Images lock, pin sources, Rollouts, Canaries, Pause, Rollback, Retry, pruning |

## Adding a row

Put the row in the file of its area, in id order, never on this page. Take
the next free id across every area file: one above the highest `REQ-NNN` in
`docs/requirements/`, skipping any an open pull request already takes. The
link text is the test's path from the repository root (`test/x.test.ts`) and
its target is that path from the area file (`../../test/x.test.ts`). A row
whose area is not listed above goes in a new file, with its heading, one
sentence saying what belongs there, and a line in the table above. A
citation of a row names this page, `docs/requirements.md`, not its area file,
so a row can move between areas without breaking anything that cites it.
