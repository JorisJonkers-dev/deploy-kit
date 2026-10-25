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
| [`scheduled-process-serves.project.yml`](scheduled-process-serves.project.yml) | `E_SCHEDULED_PROCESS_SERVES` | a scheduled Process declaring a port, probes, replicas and a cutover: it runs to completion at each slot and serves nothing ([chapter 10](../../10-project-intent.md#scheduled-processes)) |
| [`schedule-missing.project.yml`](schedule-missing.project.yml) | `E_SCHEDULE_MISSING` | a scheduled Process that names no schedule to run at ([chapter 10](../../10-project-intent.md#scheduled-processes)) |
| [`schedule-unscheduled.project.yml`](schedule-unscheduled.project.yml) | `E_SCHEDULE_UNSCHEDULED` | a schedule on an application Process, which nothing reads ([chapter 10](../../10-project-intent.md#scheduled-processes)) |
| [`migration-undeclared/`](migration-undeclared/) | `E_MIGRATION_UNDECLARED` | an Application whose edge reaches a postgres provider, answering nothing about its schema ([chapter 10](../../10-project-intent.md#migration)) |
| [`migration-without-database/`](migration-without-database/) | `E_MIGRATION_WITHOUT_DATABASE` | a changelog on an Application that derives no database ([chapter 10](../../10-project-intent.md#migration)) |
| [`credentials-without-database/`](credentials-without-database/) | `E_CREDENTIALS_WITHOUT_DATABASE` | `credentials` on an edge to a provider that owns no database ([chapter 10](../../10-project-intent.md#migration)) |
| [`mongo-credentials-without-database/`](mongo-credentials-without-database/) | `E_CREDENTIALS_WITHOUT_DATABASE` | `credentials` on an edge to a `mongo`, which owns no databases, so the edge derives no catalog ([chapter 16](../../16-dependencies.md#the-database-catalog)) |
| [`handover-both-paths/`](handover-both-paths/) | `E_HANDOVER_BOTH_PATHS` | a handover ledger naming one Project on both delivery paths ([chapter 60](../../60-setup.md#handing-over-one-project-at-a-time)) |
| [`handover-serving/`](handover-serving/) | `E_HANDOVER_SERVING` | a handover ledger stating where the old path runs an Application whose Project is on the estate path ([chapter 14](../../14-platform-intent.md#handover-ledger)) |
| [`handover-unlisted/`](handover-unlisted/) | `E_HANDOVER_UNLISTED` | a project file read beside a handover ledger that names it on no path ([chapter 60](../../60-setup.md#handing-over-one-project-at-a-time)) |
| [`no-delivery-policy/`](no-delivery-policy/) | `E_NO_DELIVERY_POLICY` | a continuous Application read beside a Platform document that offers no `delivery` policy ([chapter 14](../../14-platform-intent.md#delivery-policy)) |
| [`no-migration-policy/`](no-migration-policy/) | `E_NO_MIGRATION_POLICY` | a changelog read beside a Platform document that offers no runner ([chapter 14](../../14-platform-intent.md#migration-policy)) |
| [`process-rbac-grant/`](process-rbac-grant/) | `E_PROCESS_RBAC_GRANT` | a Process declaring Kubernetes API access in an Application the Platform document does not admit to hold any ([chapter 16](../../16-dependencies.md#kubernetes-api-access-is-declared-and-admitted)) |
| [`unknown-api-holder/`](unknown-api-holder/) | `E_UNKNOWN_API_HOLDER` | a Platform document admitting an Application to hold Kubernetes API access that no project file declares ([chapter 14](../../14-platform-intent.md#kubernetes-api-access)) |
| [`unknown-machinery/`](unknown-machinery/) | `E_UNKNOWN_MACHINERY` | a Platform document naming delivery machinery no project file declares ([chapter 14](../../14-platform-intent.md#delivery-policy)) |
| [`unknown-enrolled-project/`](unknown-enrolled-project/) | `E_UNKNOWN_ENROLLED_PROJECT` | a Platform document enrolling in the mesh a Project no project file declares ([chapter 14](../../14-platform-intent.md#the-mesh)) |
| [`unknown-telemetry-collector/`](unknown-telemetry-collector/) | `E_UNKNOWN_TELEMETRY_COLLECTOR` | a Platform document naming a telemetry collector that receives on no `otlp` surface ([chapter 14](../../14-platform-intent.md#telemetry)) |
| [`surface-label-invalid.project.yml`](surface-label-invalid.project.yml) | `E_SURFACE_LABEL_INVALID` | an Application whose id and surface, joined by a dot, run past the 63 characters a label's name holds, so no consumer's pods could carry the label its provider admits ([chapter 16](../../16-dependencies.md#the-consumer-label)) |
| [`no-sign-in-provider/`](no-sign-in-provider/) | `E_NO_SIGN_IN_PROVIDER` | an Application declaring a Client beside a Platform document that names no sign-in provider ([chapter 14](../../14-platform-intent.md#sign-in)) |
| [`client-crd-not-bootstrapped/`](client-crd-not-bootstrapped/) | `E_CLIENT_CRD_NOT_BOOTSTRAPPED` | an Application declaring a Client beside a Platform document whose bootstrap set lists no `identity.jorisjonkers.dev/v1`, so no cluster could apply the Client the render writes ([chapter 17](../../17-sign-in.md#the-client)) |
| [`client-placeholder-without-secret/`](client-placeholder-without-secret/) | `E_CLIENT_PLACEHOLDER_WITHOUT_SECRET` | an env file reading `${client:secret}` of a native Client that signs in with PKCE and holds no secret ([chapter 17](../../17-sign-in.md#credentials-and-placeholders)) |
| [`unauthorised-secret-reference/`](unauthorised-secret-reference/) | `E_UNAUTHORISED_SECRET_REFERENCE` | an env file reading a path no grant of the Process delivers to its environment ([chapter 10](../../10-project-intent.md#validation)) |
| [`unbound-secret-grant/`](unbound-secret-grant/) | `E_UNBOUND_SECRET_GRANT` | a grant delivered to the environment that no env file reads: a dead grant ([chapter 10](../../10-project-intent.md#validation)) |
| [`unresolved-placeholder/`](unresolved-placeholder/) | `E_UNRESOLVED_PLACEHOLDER` | a dependency placeholder naming an Application the Process holds no edge to ([chapter 10](../../10-project-intent.md#placeholder-sources)) |
| [`profile-key-authored/`](profile-key-authored/) | `E_PROFILE_KEY_AUTHORED` | an env file writing a key the Runtime Profile already injects ([chapter 10](../../10-project-intent.md#runtime-profiles)) |
| [`release-unit-no-readiness/`](release-unit-no-readiness/) | `E_RELEASE_UNIT_NO_READINESS` | a continuous Application no Process of which publishes readiness, so nothing can gate its switch ([chapter 50](../../50-lifecycle.md)) |
| [`no-secret-store/`](no-secret-store/) | `E_NO_SECRET_STORE` | a grant read beside a Platform document that names no Secret Store ([chapter 14](../../14-platform-intent.md#the-secret-store)) |
| [`asset-not-found/`](asset-not-found/) | `E_ASSET_NOT_FOUND` | an Asset naming a file the set does not hold beside the project file ([chapter 10](../../10-project-intent.md#assets)) |
| [`image-runs-as-root/`](image-runs-as-root/) | `E_IMAGE_RUNS_AS_ROOT` | a Process whose image the images lock holds with uid 0, which the posture would render beside `runAsNonRoot` and the kubelet would refuse ([chapter 10](../../10-project-intent.md#the-uid-is-a-pinned-input-and-the-volume-needs-a-group)) |
| [`unknown-library/`](unknown-library/) | `E_UNKNOWN_LIBRARY` | a Process mounting a library the Platform document does not declare ([chapter 14](../../14-platform-intent.md#libraries)) |
| [`library-not-granted/`](library-not-granted/) | `E_LIBRARY_NOT_GRANTED` | a Process mounting `write` a library that grants its project `read` ([chapter 14](../../14-platform-intent.md#libraries)) |
| [`no-vpn-policy/`](no-vpn-policy/) | `E_NO_VPN_POLICY` | a Process attaching to a VPN the Platform document does not run ([chapter 14](../../14-platform-intent.md#vpn)) |
| [`duplicate-human-grant/`](duplicate-human-grant/) | `E_DUPLICATE_HUMAN_GRANT` | a Platform document granting one group one role twice ([chapter 14](../../14-platform-intent.md#human-grants)) |
| [`durability-policy-incomplete/`](durability-policy-incomplete/) | `E_DURABILITY_POLICY_INCOMPLETE` | a backed-up class whose policy names no retention ([chapter 14](../../14-platform-intent.md#durability-policy)) |
| [`generated-key-outside-project.project.yml`](generated-key-outside-project.project.yml) | `E_GENERATED_KEY_OUTSIDE_PROJECT` | a key generated under a shared platform path rather than its Project's own prefix ([chapter 10](../../10-project-intent.md#generated-keys)) |
| [`generated-key-adopts-ungranted.project.yml`](generated-key-adopts-ungranted.project.yml) | `E_GENERATED_KEY_ADOPTS_UNGRANTED` | a generated key adopting the value of a path no grant of its project file reads ([chapter 10](../../10-project-intent.md#generated-keys)) |
| [`generated-key-adopts-granted.project.yml`](generated-key-adopts-granted.project.yml) | accepted | its counterpart: the same key, with a second grant reading the location it adopts from |
| [`generated-key-twice.project.yml`](generated-key-twice.project.yml) | `E_GENERATED_KEY_TWICE` | two Applications each generating the same key; the second should list it plainly ([chapter 10](../../10-project-intent.md#generated-keys)) |
| [`generated-key-written-elsewhere.project.yml`](generated-key-written-elsewhere.project.yml) | `E_GENERATED_KEY_WRITTEN_ELSEWHERE` | a generated key below a path a `custody` grant writes ([chapter 10](../../10-project-intent.md#generated-keys)) |
| [`engine-without-durability.project.yml`](engine-without-durability.project.yml) | `E_ENGINE_WITHOUT_DURABILITY` | an `engine` that derives neither a backup nor a database catalog: a `valkey` over a volume whose durability derives no backup ([chapter 10](../../10-project-intent.md#process)) |
| [`engine-owns-databases.project.yml`](engine-owns-databases.project.yml) | accepted | its counterpart: a `postgres` on the same kind of volume declares its engine, because its consumers' catalog derives from it |
| [`mongo-without-durability.project.yml`](mongo-without-durability.project.yml) | `E_ENGINE_WITHOUT_DURABILITY` | a `mongo` on the same kind of volume: it owns no databases, so it derives neither a backup nor a catalog ([chapter 16](../../16-dependencies.md#the-database-catalog)) |
| [`durability-without-engine.project.yml`](durability-without-engine.project.yml) | `E_DURABILITY_WITHOUT_ENGINE` | a volume that asks for a backup on a Process that names no engine, so the method would have to be guessed ([chapter 10](../../10-project-intent.md#process)) |
| [`duplicate-backup-claim.project.yml`](duplicate-backup-claim.project.yml) | `E_DUPLICATE_CLAIM` | a volume declaring the backup claim another Process's `recoverable` volume derives, `<claim>-backup`: both would mount one PVC ([chapter 10](../../10-project-intent.md#storage-and-durability)) |
| [`duplicate-claim.project.yml`](duplicate-claim.project.yml) | `E_DUPLICATE_CLAIM` | two Processes of one project declaring `claim: config`, as JorisJonkers-dev/arr 1.0.0 did. A project's Processes share one namespace, so both would mount one PVC ([chapter 10](../../10-project-intent.md#storage-and-durability)) |
| [`env-cannot-reload.project.yml`](env-cannot-reload.project.yml) | `E_ENV_CANNOT_RELOAD` | a grant delivered as an environment variable that tolerates a reload, which the process cannot see ([chapter 10](../../10-project-intent.md#zero-downtime-rotation)) |
| [`illegal-delivery-for-access.project.yml`](illegal-delivery-for-access.project.yml) | `E_ILLEGAL_DELIVERY_FOR_ACCESS` | `custody` asked for as a file: there is nothing to project at render time ([chapter 10](../../10-project-intent.md#which-tier-may-use-which-delivery)) |
| [`non-kv-delivery.project.yml`](non-kv-delivery.project.yml) | `E_NON_KV_DELIVERY` | a transit grant delivered as an environment variable, when a transit key is used rather than read ([chapter 10](../../10-project-intent.md#delivery)) |
| [`duplicate-route-match.project.yml`](duplicate-route-match.project.yml) | `E_DUPLICATE_ROUTE_MATCH` | two routes of one exposure sharing a `path` and a `match`, which derived precedence cannot order ([chapter 10](../../10-project-intent.md#what-is-checked)) |
| [`redirect-loop.project.yml`](redirect-loop.project.yml) | `E_REDIRECT_LOOP` | a route that redirects to a path it matches again ([chapter 10](../../10-project-intent.md#what-is-checked)) |
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

