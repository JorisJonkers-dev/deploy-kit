# Witnesses

A row of the root [behaviour ledger](../../docs/requirements.md) whose
behaviour is the model's own is proved in both implementations. The root row
names the production implementation's test, under `test/model/`; this list
names the JUnit test that proves the same behaviour here
([0114](adr/emf/0114-model-behaviours-have-a-java-witness.md)).

`Ledgers.checkWitnesses` in `parity/` fails the `emf` build when a model row
has no witness here, when a witness names an id that is not a model row, or
when it names a test method that does not exist.

This list holds **3** witnesses.

| id | JUnit test |
|---|---|
| REQ-021 | `ParityTest#theParsedIntentEqualsTheCommittedOracle` |
| REQ-023 | `ParityTest#theMetamodelsStructureEqualsTheCommittedDescriptor` |
| REQ-024 | `ParityTest#aRefusedDocumentEqualsItsCommittedDiagnostics` |
