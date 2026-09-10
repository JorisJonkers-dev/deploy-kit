# Refusals — the negative fixtures

The worked examples in the sibling directories are all accepted inputs. They
prove that the model can express the estate; they cannot prove that it refuses
what it says it refuses. These files are the other half. Each names the refusal
it expects in its `expect:` header and in its opening comment, and each isolates
one defect so the refusal has a single cause.

| fixture | expects | why |
|---|---|---|
| [`alert-class-without-signal.domain.yml`](alert-class-without-signal.domain.yml) | `E_ALERT_CLASS_WITHOUT_SIGNAL` | a class above `none` with no `scrape` on any Workload and no external health surface — the model's one observability guarantee ([chapter 10](../../10-service-intent.md#the-observability-boundary)) |
| [`alert-class-unknown.domain.yml`](alert-class-unknown.domain.yml) | schema validation | a value outside the closed `AlertClass` vocabulary, refused before composition runs — no new error code carries it |
| [`unroutable-runner.config.yml`](unroutable-runner.config.yml) | the runner's build fails | a valid class the runner's receiver table does not map; the runner must fail, not warn |
| [`cutover-rolling-over-rwo.domain.yml`](cutover-rolling-over-rwo.domain.yml) | `E_CUTOVER_UNHONOURABLE` | `cutover: rolling` over an RWO volume, which cannot surge ([chapter 10](../../10-service-intent.md#cutover-is-declared-not-promised)) |
| [`cutover-recreate-over-rwo.domain.yml`](cutover-recreate-over-rwo.domain.yml) | accepted | the same Workload and storage with the cutover it can honour — the pair is what makes the refusal above meaningful |

These are **fixtures, not proof of rendered behaviour.** The compiler does not
exist yet, so `test/simplification-contract.test.js` asserts them at the layer
that does: the shape of the input, and the runner configuration parsed from
[`../observability/runner.config.yml`](../observability/runner.config.yml)
rather than restated in a test.

Two things therefore remain **unproven until a renderer exists**, and are named
as blockers rather than described as verified:

- that `cutover: recreate` over RWO renders `strategy: {type: Recreate}` with no
  surge, and that `cutover: rolling` over RWO reaches
  `E_CUTOVER_UNHONOURABLE` at build rather than at apply; and
- that the observability runner's build actually fails on
  `unroutable-runner.config.yml`, rather than the configuration merely lacking
  the key.

The `expect:` key is fixture metadata. It is not part of the Domain schema, and
no accepted worked example carries it.
