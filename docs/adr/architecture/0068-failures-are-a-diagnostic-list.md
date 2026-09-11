---
tier: decision
status: proposed
claim: settled
date: 2026-09-07
normative: docs/architecture.md#error-model
rests-on: ["0005"]
---

# A failure is a coded diagnostic in a list, not a thrown error

## Rests on
Every rule the compiler enforces can be evaluated independently of the others,
so one run can report all violations rather than the first. False if: a later
rule cannot run until an earlier one passes (a derivation that needs a valid
input set to be meaningful) in which case the run has phases and each phase
reports its own complete list. Settled by: a fixture domain with one violation
per invariant group producing one diagnostic per violation in a single run.

## Why
The estate has one maintainer, and the loop that matters is edit, run, read.
A first-error-only compiler makes that loop as long as the number of mistakes;
a diagnostic list makes it one pass. That is the whole argument for the shape,
and it is enough on its own.

Two properties make the list worth more than better formatting. Each diagnostic
carries a **code**, which is what a test asserts on: `E_PATH_COLLISION` firing
is checkable, "the build failed" is not, and [chapter
30](../../../spec/v1/30-deliverables.md#the-adapter-port) names codes precisely
so that the invariants are testable rather than merely stated. And each carries
the **document path** it occurred at, which is what makes a violation navigable
in a file a human wrote rather than in a stack the human did not.

Derivation is total ([0005](../model/0005-derivation-is-total.md)), which means
a value that cannot be derived is a defect in the declaration or in a pinned
input, something the author can act on. That is a diagnostic. A thrown error
is the right shape for the other case only: a broken invariant inside the
compiler, where the author cannot help and a stack trace is what is wanted.

`Result` rather than exceptions at the use-case boundary keeps the two apart in
the type system. A use-case that returns `Result` cannot forget that failure is
possible, and a `throw` escaping one is a bug report rather than a validation
message.

## Alternatives
| option | cost if taken | why rejected |
|---|---|---|
| Typed exception classes per code | Idiomatic TypeScript; stack traces free; nothing to thread through call sites | Aborts at the first violation, so an author fixes one mistake per run, and a code carried by an exception type is invisible to a test that only sees a non-zero exit |
| Rely on `ZodError` for schema failures and throw for the rest | Least code; the wire layer's errors are already collected | Estate-wide invariants and adapter-port failures then have no code, so nothing in CI can assert that a specific rule fired |
| Collect diagnostics but throw on the first invariant group | Simple control flow; still reports schema errors in bulk | Splits the contract into two error models, and the author cannot tell which half of their mistakes they have seen |

## Reversibility
Undo cost today: replacing `Result` with exceptions is mechanical but touches
every use-case and every rule. Becomes irreversible once: CI jobs and other
repositories assert on the `--json` diagnostic array, because the array shape is
then a published interface and changing it breaks their pipelines.

## Consequences
- Every rule must be written to return rather than throw, so a rule that needs
  to stop the run has to say so explicitly by ending a phase, paid by the
  author of that rule, in one extra concept.
- The diagnostic array under `--json` becomes an interface with consumers, so
  adding a field is safe and renaming one is not, paid at the moment a second
  consumer appears.
- Codes have to exist before the rule that raises them, and a code with no spec
  section is a rule with no justification, paid by whoever adds a rule, and it
  is the point.
- A run that reports fifty diagnostics is harder to read than one that reports
  one, so grouping and ordering in the human renderer are load-bearing rather
  than cosmetic, paid by the CLI, once.
