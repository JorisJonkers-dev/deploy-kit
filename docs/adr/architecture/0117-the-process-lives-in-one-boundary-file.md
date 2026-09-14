---
tier: decision
status: proposed
claim: settled
date: 2026-09-14
normative: docs/architecture.md#the-process-boundary
rests-on: ["0006"]
---

# Ambient reads live in the outer rings, and the process is touched in one boundary file

## Rests on
[0006](../model/0006-pinned-inputs.md) makes every assignment a function of
pinned inputs, so nothing inside the compiler may read the environment, the
clock, randomness, a child process or the filesystem on its own. False if: a
domain or application module can read one of them and pass lint. Settled by:
`test/seams.test.ts` refusing each ambient read on a probe in the domain and the
application, and each process touch outside `src/cli/boundary.ts`.

## Why
A render that reads the clock or the environment is not a function of its
pinned inputs, and the double render (chapter 20) would only catch it by luck.
The boundary gate already stops the domain importing `node:fs` or
`node:crypto`; it cannot see `process.env`, `Date.now()` or `Math.random()`,
which need no import at all. A lint rule over the syntax sees them.

Exiting and writing output are a narrower concern. A use-case that exits cannot
be called by a test, and output written from deep inside mixes data with
diagnostics. One file performs both, holds no decision, and is the only file
coverage excludes, so the exclusion hides nothing that decides.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Review only | Nothing to configure | One maintainer reviewing their own change is not a second pair of eyes, as [0069](0069-boundaries-enforced-on-the-graph.md) records |
| Ban ambient reads everywhere under `src/` | Simplest rule | Infrastructure implements the ports that read the world, and the CLI parses the environment it is started in |
| Allow output anywhere in the CLI ring | Fewer files | Every CLI module would hold lines coverage cannot observe, instead of one file with no decision in it |

## Reversibility
Undo cost today: deleting two ESLint blocks. Becomes irreversible once: never;
the rule constrains this repository only.

## Consequences
- A domain rule that needs the time receives it as a value from a port. Paid by
  its author, in one parameter.
- `src/cli/boundary.ts` is excluded from coverage by name. Paid by nobody while
  it stays free of decisions; the rule is the reason to keep it so.
- Tests may read ambient state; the rules skip `*.test.ts`. Paid in trust that
  tests stay deterministic, which the harness rules already guard.
