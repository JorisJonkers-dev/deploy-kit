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

This list holds **11** witnesses, and **3** pending.

| id | JUnit test |
|---|---|
| REQ-021 | `ParityTest#the parsed intent equals the committed oracle` |
| REQ-023 | `ParityTest#the metamodels structure equals the committed descriptor` |
| REQ-024 | `ParityTest#a refused document equals its committed diagnostics` |
| REQ-029 | `LinkingTest#aRouteAndAScrapeLinkToTheVeryProcessAndSurfaceTheirApplicationHolds` |
| REQ-030 | `PlatformIntentTest#aPlatformDocumentParsesAndATierWithoutItsEndpointIsRefused` |
| REQ-031 | `IntentSetTest#everyEnvAndFileGrantIsRefusedWhereSecretsAreNotEncryptedAtRest` |
| REQ-034 | `PinnedInputsTest#theNodeContractPublishesTheSevenNodesTheirCapabilitiesAndAMediumNoProcessMayAskFor` |
| REQ-036 | `LoweringTest#everyProcessHoldsTheGrantsOfEveryLevelAboveItExtendedByItsOwn` |
| REQ-037 | `EnvFilesTest#readsALiteralAPlaceholderCommentsAndBlankLines` |
| REQ-038 | `ResolutionTest#theRevisionIsTheOneEveryCommittedProjectionRecordsAndMovesOnlyWithADecision` |
| REQ-039 | `ParityTest#the resolved dependency edges equal the committed oracle` |

## Pending

| id | why no witness yet | ticket |
|---|---|---|
| REQ-033 | the row holds chapter 20's worked projection, which is the production implementation's shape; this implementation's target metamodel is shaped differently on purpose, so the row's projection has no counterpart here, and what is held instead is each resolved case's dependency edges and minimal's model against the hand-written one | #95 |
| REQ-040 | the rendered tree is shared by both implementations, and the Acceleo templates that write it land with the Task 3 tracer; until then the hand-written `minimal` target model assigns every path the committed trees hold (`ResolvedDeploymentTest`) | #94 |
| REQ-035 | `resolved.json` binds the production implementation only, so the shared claim is the rendered tree, and nothing renders here yet ([the parity contract](../../docs/architecture.md#the-parity-contract)) | #94 |
