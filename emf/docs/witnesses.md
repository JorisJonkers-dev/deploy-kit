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

This list holds **6** witnesses, and **3** pending.

| id | JUnit test |
|---|---|
| REQ-021 | `ParityTest#the parsed intent equals the committed oracle` |
| REQ-023 | `ParityTest#the metamodels structure equals the committed descriptor` |
| REQ-024 | `ParityTest#a refused document equals its committed diagnostics` |
| REQ-029 | `LinkingTest#aRouteAndAScrapeLinkToTheVeryProcessAndSurfaceTheirApplicationHolds` |
| REQ-030 | `PlatformIntentTest#aPlatformDocumentParsesAndATierWithoutItsEndpointIsRefused` |
| REQ-031 | `IntentSetTest#theWorkedEstateIsRefusedExactlyWhereThePlatformDocumentSaysItWillBe` |

## Pending

| id | why no witness yet | ticket |
|---|---|---|
| REQ-033 | the Resolved Deployment has no Ecore metamodel here to validate against | #87 |
| REQ-034 | nothing under `emf/` reads the node contract yet | #87 |
| REQ-035 | `resolved.json` binds the production implementation only today, and this implementation's target model is test input rather than an oracle ([the parity contract](../../docs/architecture.md#the-parity-contract)) | #87 |
