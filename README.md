# deploy-kit

Everything needed to get a service deployed: the **model** a service author
writes, the **decision record** that justifies every rule in it, and — as it
lands — the **compiler** that turns that model into deployable artifacts.

> **Status: pre-implementation.** The model and its decision surface are here
> and enforced by CI. The compiler is being brought over from
> [`deploy-config-schema`](https://github.com/JorisJonkers-dev/deploy-config-schema),
> which stays alive and authoritative until this repository can render the
> estate. Nothing here deploys anything yet.

## What is in here

| Path | What it holds |
| --- | --- |
| [`CONTEXT.md`](CONTEXT.md) | The vocabulary. One term, one meaning; also the naming authority for code. |
| [`docs/architecture.md`](docs/architecture.md) | Normative for code structure, the way `spec/v1` is normative for the model. |
| [`docs/adr/`](docs/adr/README.md) | The decision surface, one directory per domain. Machine-checked. |
| [`docs/adr/model/`](docs/adr/model/) | The v1 model: 8 premises carrying falsifiable claims, 43 decisions resting on them. |
| [`docs/adr/architecture/`](docs/adr/architecture/README.md) | The compiler's own structure. Pointers resolve against `docs/architecture.md`, not `spec/v1`. |
| [`docs/adr/deferred/`](docs/adr/deferred/README.md) | Delivery and co-testing decisions, defined separately from the model. Direction work, not v1. |
| [`spec/v1/`](spec/v1/00-overview.md) | The normative specification. Chapters 00–60, including the two authored documents: Service Intent (10) and Platform Intent (14). |
| [`spec/v1/examples/`](spec/v1/examples) | Worked examples: real Services from this estate, written in the model. |
| `scripts/lint-adrs.mjs` | Enforces the decision-record contract. Runs in CI. |

## The shape of the model

Three layers, and the middle one is a contract
([0003](docs/adr/model/0003-three-layer-meta-model.md)):

1. **Service Intent** — hand-authored, requirements only. What a service owner
   knows and nobody else does: its cold-start budget, what its data is worth,
   which paths answer readiness.
2. **Resolved Deployment** — derived. Every platform decision, assigned from
   pinned, digested inputs ([0006](docs/adr/model/0006-pinned-inputs.md)) and
   reviewable as a diff.
3. **Deliverable Set** — serialization only. No decisions.

Two rules do most of the work. **Contention decides authority**
([0004](docs/adr/model/0004-contention-decides-authority.md)): a value is
platform-assigned exactly when it must be unique estate-wide or draws on a
shared finite resource; everything else belongs to the Service. And
**derivation is total** ([0005](docs/adr/model/0005-derivation-is-total.md)): every
hand-tuned value in the live estate must be reachable from something only the
Service could have declared.

## Reading it

Start at [`spec/v1/00-overview.md`](spec/v1/00-overview.md) for the model, or
[`docs/adr/README.md`](docs/adr/README.md) for why each rule is what it is.

**ADRs justify; the spec is normative.** Where an ADR and its `normative:`
pointer disagree, the spec wins and the ADR is what gets fixed — CI resolves
every pointer against a real heading, so the two cannot drift silently.

A premise carrying `claim: open` is decided in direction but **not yet tested**.
It names its owner and the exact command or measurement that would settle it.
Three of the eight are currently false as built, and say so.

## What is deliberately not here

How the estate deploys, and how one unit's tests gate another's deploy, are
**defined separately** from the model. The model makes exactly three demands on
whatever delivery mechanism is eventually chosen:

| Demand | Decided in |
| --- | --- |
| Release Unit atomicity — no member switches until every member is healthy | [0060](docs/adr/model/0060-release-unit.md) |
| Destructive operations gated by Durability Class | [0015](docs/adr/model/0015-durability-class-per-volume.md) |
| Rendering only from pinned, digested inputs | [0006](docs/adr/model/0006-pinned-inputs.md), [0034](docs/adr/model/0034-cluster-state-pinned-input.md) |

Everything else — push or pull, who applies, what prunes — is that definition's
business. The parked direction work is in
[`docs/adr/deferred/`](docs/adr/deferred/README.md).

## Local checks

```bash
npm ci
npm run verify      # lint, format, typecheck, ADR contract, tests + coverage
```

`npm run lint:adrs` alone runs the decision-record contract.

## Conventions

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — Conventional Commits, PR flow
- [`VERSIONING.md`](VERSIONING.md) — the versioning contract
- [`SECURITY.md`](SECURITY.md) — reporting
- [`CLAUDE.md`](CLAUDE.md) — agent contract
