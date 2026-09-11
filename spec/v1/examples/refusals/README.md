# Refusals: the negative fixtures

The worked examples in the sibling directories are all accepted inputs. They
prove that the model can express the estate; they cannot prove that it refuses
what it says it refuses. These files are the other half. Each names the refusal
it expects in its `expect:` header and in its opening comment, and each isolates
one defect so the refusal has a single cause.

| fixture | expects | why |
|---|---|---|
| [`alert-class-without-signal.domain.yml`](alert-class-without-signal.domain.yml) | `E_ALERT_CLASS_WITHOUT_SIGNAL` | an `observability` block carrying a class and no `scrape`. A class states how loudly to wake someone and means nothing without a signal to wake them about ([chapter 10](../../10-service-intent.md#observability)) |
| [`alert-class-unknown.domain.yml`](alert-class-unknown.domain.yml) | schema validation | a value outside the closed `AlertClass` vocabulary, refused before composition runs, so no new error code carries it |
| [`cutover-rolling-over-rwo.domain.yml`](cutover-rolling-over-rwo.domain.yml) | `E_CUTOVER_UNHONOURABLE` | `cutover: rolling` over an RWO volume, which cannot surge ([chapter 10](../../10-service-intent.md#cutover-is-declared-not-promised)) |
| [`cutover-recreate-over-rwo.domain.yml`](cutover-recreate-over-rwo.domain.yml) | accepted | the same Workload and storage with the cutover it can honour, the pair that makes the refusal above meaningful |

There is no fixture for "no monitoring". A Service that wants none omits the
`observability` block, which is an accepted input and appears in the worked set
as `platform-valkey` rather than here.

These are **fixtures, not proof of rendered behaviour.** The compiler does not
exist yet, so `test/simplification-contract.test.js` asserts them at the layer
that does: the shape of the input.

Two things therefore remain **unproven until a renderer exists**, and are named
as blockers rather than described as verified:

- that `cutover: recreate` over RWO renders `strategy: {type: Recreate}` with no
  surge, and that `cutover: rolling` over RWO reaches `E_CUTOVER_UNHONOURABLE`
  at build rather than at apply; and
- that a declared `observability` block renders a `ServiceMonitor` naming the
  surface it points at, and that a block missing its `scrape` is refused at
  composition rather than merely being absent from the input.

The `expect:` key is fixture metadata. It is not part of the Domain schema, and
no accepted worked example carries it.
