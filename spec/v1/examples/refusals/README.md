# Refusals: the negative fixtures

The worked examples in the sibling directories are all accepted inputs. They
prove that the model can express the estate; they cannot prove that it refuses
what it says it refuses. These files are the other half. Each names the refusal
it expects in its `expect:` header and in its opening comment, and each isolates
one defect so the refusal has a single cause.

| fixture | expects | why |
|---|---|---|
| [`alert-class-without-signal.project.yml`](alert-class-without-signal.project.yml) | `E_ALERT_CLASS_WITHOUT_SIGNAL` | an `observability` block carrying a class and no `scrape`. A class states how loudly to wake someone and means nothing without a signal to wake them about ([chapter 10](../../10-project-intent.md#observability)) |
| [`alert-class-unknown.project.yml`](alert-class-unknown.project.yml) | schema validation | a value outside the closed `AlertClass` vocabulary, refused before any rule runs, so no error code carries it |
| [`cutover-continuous-over-rwo.project.yml`](cutover-continuous-over-rwo.project.yml) | `E_CUTOVER_UNHONOURABLE` | `cutover: continuous` over an RWO volume, which cannot hold the second copy a continuous cutover starts ([chapter 10](../../10-project-intent.md#cutover-is-declared-not-promised)) |
| [`cutover-interrupted-over-rwo.project.yml`](cutover-interrupted-over-rwo.project.yml) | accepted | the same Process and storage with the cutover it can honour, the pair that makes the refusal above meaningful |
| [`cutover-mixed.project.yml`](cutover-mixed.project.yml) | `E_RELEASE_UNIT_MIXED_CUTOVER` | one Application whose Processes answer the cutover question differently: a continuous API beside an interrupted store. An Application switches as one, so the part that cannot keep serving is an Application of its own ([chapter 10](../../10-project-intent.md#cutover-is-declared-not-promised)) |
| [`engine-without-durability.project.yml`](engine-without-durability.project.yml) | `E_ENGINE_WITHOUT_DURABILITY` | an `engine` over a volume whose durability derives no backup, so it names a method nothing asks for ([chapter 10](../../10-project-intent.md#process)) |
| [`durability-without-engine.project.yml`](durability-without-engine.project.yml) | `E_DURABILITY_WITHOUT_ENGINE` | a volume that asks for a backup on a Process that names no engine, so the method would have to be guessed ([chapter 10](../../10-project-intent.md#process)) |
| [`env-cannot-reload.project.yml`](env-cannot-reload.project.yml) | `E_ENV_CANNOT_RELOAD` | a grant delivered as an environment variable that tolerates a reload, which the process cannot see ([chapter 10](../../10-project-intent.md#zero-downtime-rotation)) |
| [`illegal-delivery-for-access.project.yml`](illegal-delivery-for-access.project.yml) | `E_ILLEGAL_DELIVERY_FOR_ACCESS` | `custody` asked for as a file: there is nothing to project at render time ([chapter 10](../../10-project-intent.md#which-tier-may-use-which-delivery)) |
| [`non-kv-delivery.project.yml`](non-kv-delivery.project.yml) | `E_NON_KV_DELIVERY` | a transit grant delivered as an environment variable, when a transit key is used rather than read ([chapter 10](../../10-project-intent.md#delivery)) |
| [`duplicate-route-match.project.yml`](duplicate-route-match.project.yml) | `E_DUPLICATE_ROUTE_MATCH` | two routes of one exposure sharing a `path` and a `match`, which derived precedence cannot order ([chapter 10](../../10-project-intent.md#what-is-checked)) |
| [`shared-declaration-duplicated.project.yml`](shared-declaration-duplicated.project.yml) | `E_SHARED_DECLARATION_DUPLICATED` | an Application restating, unchanged, a grant the project header already declares. A lower declaration replaces the one above it, so one that changes nothing is the single case a reader cannot tell apart by looking ([chapter 10](../../10-project-intent.md#sharing-merges-and-a-duplicate-is-refused)) |
| [`shared-quantity.project.yml`](shared-quantity.project.yml) | `E_SHARED_QUANTITY` | `memory` and `cpu` in a `placement` block above a Process. Eligibility sums every container's quantity, so a shared one means something different per Process ([chapter 10](../../10-project-intent.md#a-quantity-is-never-shared)) |
| [`placement-incomplete.project.yml`](placement-incomplete.project.yml) | `E_PLACEMENT_INCOMPLETE` | a Process with no quantity of its own under an Application that shares the node dimensions: nothing above it could have supplied one ([chapter 10](../../10-project-intent.md#a-quantity-is-never-shared)) |
| [`cutover-missing.project.yml`](cutover-missing.project.yml) | `E_CUTOVER_MISSING` | a Process no level answers the cutover question for, which is what `cutover` being required means once it may be answered above one ([chapter 10](../../10-project-intent.md#cutover-is-declared-not-promised)) |
| [`shared-intent-merged.project.yml`](shared-intent-merged.project.yml) | accepted | the counterpart of the four above: one declaration of each shape the merge has to get right, so that a refusal is a refusal rather than the only thing the rules can see ([chapter 10](../../10-project-intent.md#shared-intent)) |

Every refused fixture carries a committed `<name>.diagnostics.json` beside it:
the set of `(code, path)` pairs the model emits, where the path is the RFC 6901
JSON Pointer of the object refused. Both implementations are held to that file
([the parity contract](../../../../docs/architecture.md#the-parity-contract)),
and it replaces the `expect:` header these fixtures used to carry.

`alert-class-unknown.project.yml` carries no diagnostics oracle. A value outside
a closed vocabulary is refused by each implementation's own front end, before a
rule runs: the production parser can point at the field, and the model-driven
parser refuses the token. The code is the same and the place it can name is not,
so the case is not a parity oracle.

There is no fixture for "no monitoring". An Application that wants none omits the
`observability` block, which is an accepted input and appears in the worked set
as `platform-valkey` rather than here.

These are **fixtures, not proof of rendered behaviour.** No renderer exists yet,
so what is proven is the refusal itself: `test/model/refusals.test.ts` runs each
through the production parser, and `emf/tests/parity`'s `ParityTest` runs each through
the model-driven one, both against the committed diagnostics.

Two things therefore remain **unproven until a renderer exists**, and are named
as blockers rather than described as verified:

- that `cutover: interrupted` over RWO renders `strategy: {type: Recreate}` with no
  surge, and that `cutover: continuous` over RWO reaches `E_CUTOVER_UNHONOURABLE`
  at build rather than at apply; and
- that a declared `observability` block renders a `ServiceMonitor` naming the
  surface it points at, and that a block missing its `scrape` is refused at
  composition rather than merely being absent from the input.

