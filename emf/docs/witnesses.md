# Witnesses

A row of the root [behaviour ledger](../../docs/requirements.md) whose
behaviour is the model's own is proved in both implementations. The root row
names the production implementation's test, under `test/model/`; this list
names the JUnit test that proves the same behaviour here
([0114](adr/emf/0114-model-behaviours-have-a-java-witness.md)). A witness is a
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

This list holds **8** witnesses, and **3** pending.

| id | JUnit test |
|---|---|
| REQ-021 | `ParityTest#the parsed intent equals the committed oracle` |
| REQ-023 | `ParityTest#the metamodels structure equals the committed descriptor` |
| REQ-024 | `ParityTest#a refused document equals its committed diagnostics` |
| REQ-029 | `LinkingTest#aRouteAndAScrapeLinkToTheVeryProcessAndSurfaceTheirApplicationHolds` |
| REQ-030 | `PlatformIntentTest#aPlatformDocumentParsesAndATierWithoutItsEndpointIsRefused` |
| REQ-031 | `IntentSetTest#theWorkedEstateIsRefusedExactlyWhereThePlatformDocumentSaysItWillBe` |
| REQ-036 | `LoweringTest#everyProcessHoldsTheGrantsOfEveryLevelAboveItExtendedByItsOwn` |
| REQ-037 | `EnvFilesTest#readsALiteralAPlaceholderCommentsAndBlankLines` |

## Pending

| id | why no witness yet | ticket |
|---|---|---|
| REQ-033 | the target metamodel exists here now (#87), but nothing produces a model to validate: the hand-written `minimal` model is input, and the first model this implementation *derives* comes out of the QVT-Operational tracer | #90 |
| REQ-034 | nothing under `emf/` reads the node contract until placement is resolved against it | #91 |
| REQ-035 | `resolved.json` binds the production implementation only, so the shared claim is the rendered tree, and nothing renders here yet ([the parity contract](../../docs/architecture.md#the-parity-contract)) | #94 |
