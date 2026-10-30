# Witnesses

A row of the root [behaviour ledger](../../docs/requirements.md) whose
behaviour is the model's own is proved in both implementations. The root row
names the production implementation's test, under `test/model/`; this list
names the JUnit test that proves the same behaviour here
([0078](adr/emf/0078-model-behaviours-have-a-junit-witness.md)). A witness is a
JUnit test in whichever language its module is written, so a row here names a
Kotlin function of the test tier or a Java method of a bundle, and the check
reads both.

`Ledgers.checkWitnesses` in `tests/parity` fails the `emf` build when a model row
has no witness here, when a witness names an id that is not a model row, or
when it names a test method that does not exist.

A model behaviour this implementation cannot prove **yet** is listed as pending
below, with the ticket that lands it. It is the same state the
[rule ledger](rules.md) already carries for a rule not enforced yet: a row that
is visibly owed, rather than one quietly dropped. A pending row still has to
name a real model row, it may not also be witnessed, and its count is stated
beside the witness count, so the gate keeps its teeth while the work is
outstanding.

This list holds **58** witnesses, and **20** pending.

| id | JUnit test |
|---|---|
| REQ-021 | `ParityTest#the parsed intent equals the committed oracle` |
| REQ-023 | `ParityTest#the metamodels structure equals the committed descriptor` |
| REQ-024 | `ParityTest#a refused document equals its committed diagnostics` |
| REQ-029 | `LinkingTest#aRouteAndAScrapeLinkToTheVeryProcessAndSurfaceTheirApplicationHolds` |
| REQ-030 | `PlatformIntentTest#aPlatformDocumentParsesAndATierWithoutItsEndpointIsRefused` |
| REQ-031 | `IntentSetTest#everyEnvAndFileGrantIsRefusedWhereSecretsAreNotEncryptedAtRest` |
| REQ-033 | `ResolvedDeploymentTest#theResolvedModelNamesNoKubernetesOrTraefikField` |
| REQ-034 | `PinnedInputsTest#theNodeContractPublishesTheSevenNodesTheirCapabilitiesAndAMediumNoProcessMayAskFor` |
| REQ-036 | `LoweringTest#everyProcessHoldsTheGrantsOfEveryLevelAboveItExtendedByItsOwn` |
| REQ-037 | `EnvFilesTest#readsALiteralAPlaceholderCommentsAndBlankLines` |
| REQ-038 | `ResolutionTest#theRevisionIsTheOneEveryCommittedProjectionRecordsAndMovesOnlyWithADecision` |
| REQ-039 | `ParityTest#the resolved dependency edges equal the committed oracle` |
| REQ-040 | `RenderedTreeTest#aProjectsShareIsItsCommittedTreeByteForByte` |
| REQ-049 | `RenderedTreeTest#aProjectsShareIsItsCommittedTreeByteForByte` |
| REQ-052 | `RenderedTreeTest#authsShareAndTheEstateShareItDerivesAreItsCommittedTreeByteForByte` |
| REQ-053 | `RenderedTreeTest#theKnowledgePlatformsShareAndTheEstateShareItDerivesAreItsCommittedTreeByteForByte` |
| REQ-054 | `ParityTest#a negative fixture equals its committed diagnostics in either order` |
| REQ-057 | `RenderedTreeTest#authsShareAndTheEstateShareItDerivesAreItsCommittedTreeByteForByte` |
| REQ-058 | `LinkingTest#theReporterLinksOnlyToADeclaredApplicationThatAnswersOnHttp` |
| REQ-061 | `RenderedTreeTest#theKnowledgePlatformsShareAndTheEstateShareItDerivesAreItsCommittedTreeByteForByte` |
| REQ-062 | `RenderedTreeTest#theKnowledgePlatformsShareAndTheEstateShareItDerivesAreItsCommittedTreeByteForByte` |
| REQ-065 | `RenderedTreeTest#aProjectsShareIsItsCommittedTreeByteForByte` |
| REQ-066 | `RenderedTreeTest#theKnowledgePlatformsShareAndTheEstateShareItDerivesAreItsCommittedTreeByteForByte` |
| REQ-067 | `RenderedTreeTest#theKnowledgePlatformsShareAndTheEstateShareItDerivesAreItsCommittedTreeByteForByte` |
| REQ-068 | `RenderedTreeTest#aProjectsShareIsItsCommittedTreeByteForByte` |
| REQ-069 | `RenderedTreeTest#theKnowledgePlatformsShareAndTheEstateShareItDerivesAreItsCommittedTreeByteForByte` |
| REQ-070 | `RenderedTreeTest#aProjectsShareIsItsCommittedTreeByteForByte` |
| REQ-071 | `RenderedTreeTest#theKnowledgePlatformsShareAndTheEstateShareItDerivesAreItsCommittedTreeByteForByte` |
| REQ-072 | `RenderedTreeTest#authsShareAndTheEstateShareItDerivesAreItsCommittedTreeByteForByte` |
| REQ-075 | `ModelWitnessesTest#aLowPortKeepsNetBindServiceAloneAndAHighPortAddsNothing` |
| REQ-076 | `ModelWitnessesTest#aTransitGrantThatReadsCoversTheKeyAndUpdatesEachOtherOperationsOnePath` |
| REQ-077 | `ModelWitnessesTest#aMongoIsDumpedByThePlatformsMethodOwnsNoDatabaseAndIsRefusedWithoutADurableVolume` |
| REQ-078 | `ModelWitnessesTest#aScheduledProcessIsACronJobThatNeverRunsTwiceAndSkipsALateRun` |
| REQ-079 | `PipelineRefusalsTest#anImageTheLockHoldsAsRootIsRefusedAtTheLock` |
| REQ-080 | `ModelWitnessesTest#eachHumanGrantIsOneClusterRoleBindingInEveryCompositionAndADuplicateIsRefused` |
| REQ-084 | `ModelWitnessesTest#theSameHostOnOneTierIsRefusedAndOnTwoTiersRendersOneRoutePerProxy` |
| REQ-085 | `ModelWitnessesTest#everyRouteCarriesItsTiersIngressClassAndATierThatNamesNoneIsRefused` |
| REQ-087 | `ModelWitnessesTest#theProjectThatDeclaresAProxyRendersTheSharedMiddlewaresOncePerNamespace` |
| REQ-090 | `ModelWitnessesTest#aForwardAuthNamesAProviderSurfaceAndPathAndAnUnknownProviderIsRefused` |
| REQ-091 | `ModelWitnessesTest#aTiersProxyIsConfiguredByItsSurfacesAndTheCrdProviderFilteredOnItsClass` |
| REQ-092 | `ModelWitnessesTest#eachDashboardFileIsOneGrafanaDashboardInItsFolderAndAnUnusableOneIsRefused` |
| REQ-094 | `ModelWitnessesTest#aRouteOnATierThatDeclaresDnsCarriesTheExternalDnsAnnotationsAndOneOnATierWithoutCarriesNone` |
| REQ-095 | `ModelWitnessesTest#aParkedProcessKeepsWhatItOwnsRunsNoPodAndAParkedScheduleStartsNoRun` |
| REQ-096 | `ModelWitnessesTest#aDatastoreRunsAtTheDataClassACriticalApplicationAtTheCriticalClassAndAnyOtherAtNone` |
| REQ-097 | `ModelWitnessesTest#aNodeAddressExposureIsAHostPortOnTheProcessHoldsItToTheNodeAndRendersNoLoadBalancer` |
| REQ-099 | `ModelWitnessesTest#aTiersAddressExposesItsProxyOnTheListenersPortsAndAnAcmeTierGetsAResolverWithItsOwnState` |
| REQ-100 | `ModelWitnessesTest#aRoutesTlsFollowsItsTierAnAcmeTierNamesItsResolverAPlainTierRendersNoneAndATlsTierThatIssuesNoneAnEmptyBlock` |
| REQ-102 | `PipelineRefusalsTest#aProcessIsCheckedWithTheEnvFilesBesideItsProjectFile` |
| REQ-105 | `ModelWitnessesTest#aProcessAnsweringOnPort53ResolvesThroughThePlatformsUpstreamNameserversAndIsRefusedWithoutThem` |
| REQ-107 | `ModelWitnessesTest#aProcessThatSpawnsCreatesPodsFromItsTemplateAlone` |
| REQ-108 | `ModelWitnessesTest#anAdmittedApiBlockWithNoRulesRendersNoRoleAndNoBindingBesideItsMountedToken` |
| REQ-109 | `ModelWitnessesTest#anEdgeIntoAnObjectStoreThatNamesBucketsDerivesItsCatalogAndHandsTheConsumerItsKey` |
| REQ-111 | `ModelWitnessesTest#everyStableAddressIsOneExternalNameCreatedOnceAndAConsumersAliasNamesItAlone` |
| REQ-113 | `ModelWitnessesTest#anOpenMoveRendersItsFrozenSourceBesideItsTargetAndOneSuspendedJobPerStep` |
| REQ-117 | `ModelWitnessesTest#everyCanaryAsksTheReleaseGateAFourthQuestionRollback` |
| REQ-125 | `ModelWitnessesTest#aSeededAssetIsTheFirstInitContainerThatWritesItAtMode0600AndTheProcessNeverMountsIt` |
| REQ-152 | `ModelWitnessesTest#aContainerThatMountsAWritableTmpGetsHomeAfterItsOwnVariablesAndOneWithoutGetsNone` |
| REQ-153 | `ModelWitnessesTest#everyNamespaceTheRenderWritesIsNeverPruned` |

## Pending

| id | why no witness yet | ticket |
|---|---|---|
| REQ-035 | `resolved.json` binds the production implementation only, so the shared claim is the rendered tree, which REQ-040's witness holds; the row's own last clause, knowledge's resolved edges, is resolved by neither implementation, and leaves with the example when knowledge-system retires ([the parity contract](../../docs/architecture.md#the-parity-contract)) | #272 |
| REQ-081 | the Service, its pool and its network policy render, but the placement hold to the pool's site and `E_PLACEMENT_UNSATISFIABLE` are not implemented here ([#666](https://github.com/JorisJonkers-dev/deploy-kit/issues/666)) | #666 |
| REQ-082 | a Platform `monitors.labels` key that a monitor already carries renders the key twice, the Platform's value ahead of the monitor's, instead of the monitor's winning; found by the witness, to fix in `render.mtl` ([#666](https://github.com/JorisJonkers-dev/deploy-kit/issues/666)) | #666 |
| REQ-089 | the required anti-affinity renders, but `E_PLACEMENT_UNSATISFIABLE` for fewer eligible nodes than the replica count is not implemented here ([#666](https://github.com/JorisJonkers-dev/deploy-kit/issues/666)) | #666 |
| REQ-093 | proved by the observability example, which another change is rewriting; witnessed once that lands ([#666](https://github.com/JorisJonkers-dev/deploy-kit/issues/666)) | #666 |
| REQ-098 | the derived Node Agents render, but `E_NO_NODE_AGENT_POLICY` is not implemented here ([#666](https://github.com/JorisJonkers-dev/deploy-kit/issues/666)) | #666 |
| REQ-101 | proved by the observability example (the log collector), which another change is rewriting; witnessed once that lands ([#666](https://github.com/JorisJonkers-dev/deploy-kit/issues/666)) | #666 |
| REQ-104 | the backup pod's `BACKUP_OFF_CLUSTER*` variables render, but a recipient that is no age public key is not refused with the Platform document here ([#666](https://github.com/JorisJonkers-dev/deploy-kit/issues/666)) | #666 |
| REQ-110 | a Move is the production implementation's alone (the maintainer, 2026-10-30): this implementation renders a given Move and derives none, so neither the pinned Move facts nor `E_ENGINE_VERSION_MISSING` are asked here, and the Move leaves with the estate path ([#721](https://github.com/JorisJonkers-dev/deploy-kit/issues/721)) | #721 |
| REQ-112 | a Move is the production implementation's alone (the maintainer, 2026-10-30): this implementation derives none, so `E_MOVE_UNSUPPORTED`, `E_NO_MOVE_POLICY` and `E_MOVE_OPEN` are not asked here, and the Move leaves with the estate path ([#721](https://github.com/JorisJonkers-dev/deploy-kit/issues/721)) | #721 |
| REQ-118 | proved by the observability example (the Flux PodMonitor), which another change is rewriting; witnessed once that lands ([#666](https://github.com/JorisJonkers-dev/deploy-kit/issues/666)) | #666 |
| REQ-119 | `command` and `args` parse but resolution carries neither and the Process's container renders neither ([#666](https://github.com/JorisJonkers-dev/deploy-kit/issues/666)) | #666 |
| REQ-120 | a writable path's size is not added to the Process's memory here, and `E_PLACEMENT_UNSATISFIABLE` is not implemented ([#666](https://github.com/JorisJonkers-dev/deploy-kit/issues/666)) | #666 |
| REQ-121 | a description renders nothing, but the schema refusal of one over 160 characters or empty is not implemented here ([#666](https://github.com/JorisJonkers-dev/deploy-kit/issues/666)) | #666 |
| REQ-123 | optional keys render optional, but `optional: false` is not refused by the schema here ([#666](https://github.com/JorisJonkers-dev/deploy-kit/issues/666)) | #666 |
| REQ-124 | `E_NO_SEEDER` and the `seedAt` placement refusals are not implemented here ([#666](https://github.com/JorisJonkers-dev/deploy-kit/issues/666)) | #666 |
| REQ-127 | a rate limit on a route of an exposure with `proxied: false` still counts clients by `CF-Connecting-IP`; found by the witness, to fix in `render.mtl` ([#666](https://github.com/JorisJonkers-dev/deploy-kit/issues/666)) | #666 |
| REQ-130 | `E_NO_NODE_AGENT_POLICY` is not implemented here ([#666](https://github.com/JorisJonkers-dev/deploy-kit/issues/666)) | #666 |
| REQ-140 | `E_UNKNOWN_SIDECAR_ASSET` is not implemented here ([#666](https://github.com/JorisJonkers-dev/deploy-kit/issues/666)) | #666 |
| REQ-151 | belongs to the identity example, which another change is rewriting; `E_CLIENT_FIELD_FOR_MODE` is also not implemented here ([#666](https://github.com/JorisJonkers-dev/deploy-kit/issues/666)) | #666 |
