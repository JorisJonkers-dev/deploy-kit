# Refusals: the negative fixtures

The worked examples in the sibling directories are all accepted inputs. They
prove that the model can express the estate; they cannot prove that it refuses
what it says it refuses. These files are the other half. Each names the refusal
it expects in its `expect:` header and in its opening comment, and each isolates
one defect so the refusal has a single cause.

| fixture | expects | why |
|---|---|---|
| [`alert-class-without-signal.project.yml`](alert-class-without-signal.project.yml) | `E_ALERT_CLASS_WITHOUT_SIGNAL` | an `observability` block carrying a class and no `scrape`. A class states how loudly to wake someone and means nothing without a signal to wake them about ([chapter 10](../../10-project-intent.md#observability)) |
| [`cutover-continuous-over-rwo.project.yml`](cutover-continuous-over-rwo.project.yml) | `E_CUTOVER_UNHONOURABLE` | `cutover: continuous` over an RWO volume, which cannot hold the second copy a continuous cutover starts ([chapter 10](../../10-project-intent.md#cutover-is-declared-not-promised)) |
| [`cutover-interrupted-over-rwo.project.yml`](cutover-interrupted-over-rwo.project.yml) | accepted | the same Process and storage with the cutover it can honour, the pair that makes the refusal above meaningful |
| [`cutover-mixed.project.yml`](cutover-mixed.project.yml) | `E_RELEASE_UNIT_MIXED_CUTOVER` | one Application whose Processes answer the cutover question differently: a continuous API beside an interrupted store. An Application switches as one, so the part that cannot keep serving is an Application of its own ([chapter 10](../../10-project-intent.md#cutover-is-declared-not-promised)) |
| [`migration-owner-duplicated.project.yml`](migration-owner-duplicated.project.yml) | `E_MIGRATION_OWNER_DUPLICATED` | two Applications of one project each declaring a changelog: one Application moves a project's database ([chapter 10](../../10-project-intent.md#migration)) |
| [`owner-role-granted.project.yml`](owner-role-granted.project.yml) | `E_OWNER_ROLE_GRANTED` | an application Process granted the owner role by hand; it is derived for the migration alone ([chapter 10](../../10-project-intent.md#migration)) |
| [`prepare-process-serves.project.yml`](prepare-process-serves.project.yml) | `E_PREPARE_PROCESS_SERVES` | a prepare Process declaring a port, probes, replicas and a cutover: it runs to completion and serves nothing ([chapter 10](../../10-project-intent.md#prepare-processes)) |
| [`prepare-forward-only.project.yml`](prepare-forward-only.project.yml) | accepted | the counterpart: a prepare Process declaring an image, resources and a run deadline, beside a continuous Process whose shared cutover does not reach it ([chapter 10](../../10-project-intent.md#prepare-processes)) |
| [`migration-undeclared/`](migration-undeclared/) | `E_MIGRATION_UNDECLARED` | an Application whose edge reaches a postgres provider, answering nothing about its schema ([chapter 10](../../10-project-intent.md#migration)) |
| [`migration-without-database/`](migration-without-database/) | `E_MIGRATION_WITHOUT_DATABASE` | a changelog on an Application that derives no database ([chapter 10](../../10-project-intent.md#migration)) |
| [`credentials-without-database/`](credentials-without-database/) | `E_CREDENTIALS_WITHOUT_DATABASE` | `credentials` on an edge to a provider that owns no database ([chapter 10](../../10-project-intent.md#migration)) |
| [`handover-both-paths/`](handover-both-paths/) | `E_HANDOVER_BOTH_PATHS` | a handover ledger naming one Project on both delivery paths ([chapter 60](../../60-setup.md#handing-over-one-project-at-a-time)) |
| [`handover-unlisted/`](handover-unlisted/) | `E_HANDOVER_UNLISTED` | a project file read beside a handover ledger that names it on no path ([chapter 60](../../60-setup.md#handing-over-one-project-at-a-time)) |
| [`no-delivery-policy/`](no-delivery-policy/) | `E_NO_DELIVERY_POLICY` | a continuous Application read beside a Platform document that offers no `delivery` policy ([chapter 14](../../14-platform-intent.md#delivery-policy)) |
| [`no-migration-policy/`](no-migration-policy/) | `E_NO_MIGRATION_POLICY` | a changelog read beside a Platform document that offers no runner ([chapter 14](../../14-platform-intent.md#migration-policy)) |
| [`process-rbac-grant/`](process-rbac-grant/) | `E_PROCESS_RBAC_GRANT` | a Process declaring Kubernetes API access in an Application the Platform document does not admit to hold any ([chapter 16](../../16-dependencies.md#kubernetes-api-access-is-declared-and-admitted)) |
| [`unknown-api-holder/`](unknown-api-holder/) | `E_UNKNOWN_API_HOLDER` | a Platform document admitting an Application to hold Kubernetes API access that no project file declares ([chapter 14](../../14-platform-intent.md#kubernetes-api-access)) |
| [`unknown-machinery/`](unknown-machinery/) | `E_UNKNOWN_MACHINERY` | a Platform document naming delivery machinery no project file declares ([chapter 14](../../14-platform-intent.md#delivery-policy)) |
| [`unknown-telemetry-collector/`](unknown-telemetry-collector/) | `E_UNKNOWN_TELEMETRY_COLLECTOR` | a Platform document naming a telemetry collector that receives on no `otlp` surface ([chapter 14](../../14-platform-intent.md#telemetry)) |
| [`unauthorised-secret-reference/`](unauthorised-secret-reference/) | `E_UNAUTHORISED_SECRET_REFERENCE` | an env file reading a path no grant of the Process delivers to its environment ([chapter 10](../../10-project-intent.md#validation)) |
| [`unbound-secret-grant/`](unbound-secret-grant/) | `E_UNBOUND_SECRET_GRANT` | a grant delivered to the environment that no env file reads: a dead grant ([chapter 10](../../10-project-intent.md#validation)) |
| [`unresolved-placeholder/`](unresolved-placeholder/) | `E_UNRESOLVED_PLACEHOLDER` | a dependency placeholder naming an Application the Process holds no edge to ([chapter 10](../../10-project-intent.md#three-placeholder-sources)) |
| [`profile-key-authored/`](profile-key-authored/) | `E_PROFILE_KEY_AUTHORED` | an env file writing a key the Runtime Profile already injects ([chapter 10](../../10-project-intent.md#runtime-profiles)) |
| [`release-unit-no-readiness/`](release-unit-no-readiness/) | `E_RELEASE_UNIT_NO_READINESS` | a continuous Application no Process of which publishes readiness, so nothing can gate its switch ([chapter 50](../../50-lifecycle.md)) |
| [`no-secret-store/`](no-secret-store/) | `E_NO_SECRET_STORE` | a grant read beside a Platform document that names no Secret Store ([chapter 14](../../14-platform-intent.md#the-secret-store)) |
| [`asset-not-found/`](asset-not-found/) | `E_ASSET_NOT_FOUND` | an Asset naming a file the set does not hold beside the project file ([chapter 10](../../10-project-intent.md#assets)) |
| [`durability-policy-incomplete/`](durability-policy-incomplete/) | `E_DURABILITY_POLICY_INCOMPLETE` | a backed-up class whose policy names no retention ([chapter 14](../../14-platform-intent.md#durability-policy)) |
| [`engine-without-durability.project.yml`](engine-without-durability.project.yml) | `E_ENGINE_WITHOUT_DURABILITY` | an `engine` that derives neither a backup nor a database catalog: a `valkey` over a volume whose durability derives no backup ([chapter 10](../../10-project-intent.md#process)) |
| [`engine-owns-databases.project.yml`](engine-owns-databases.project.yml) | accepted | its counterpart: a `postgres` on the same kind of volume declares its engine, because its consumers' catalog derives from it |
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

A value outside a closed vocabulary, and every other defect the schema or the
YAML subset refuses before a rule runs, is a schema refusal rather than a coded
one. Those cases live in [`../schema-refusals/`](../schema-refusals/README.md),
held to the same kind of oracle by the production implementation only.

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

