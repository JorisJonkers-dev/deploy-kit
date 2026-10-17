# Task 2: model transformations

Joris Jonkers (s1829157), Model Driven Engineering, University of Twente.

## Contents

- `report.pdf`: the report.
- `build.sh`, `build.cmd`: build and test everything; see below.
- `task-2-transformations/`: Eclipse project with the metamodels, the
  transformations and the example models, for inspection.
- `implementation/`: the Eclipse/Maven projects that run the
  transformations, with the examples their tests read.

In `task-2-transformations/`:

| Path | Contents |
| --- | --- |
| `model/` | Source, pinned-inputs and target metamodels (`.ecore`). |
| `transforms/` | `lower.qvto` (flattening), `resolution.qvto` (resolution), `estate.qvto` (final pass). |
| `examples/platform/` | Platform Intent and pinned inputs shared by every example. |
| `examples/<example>/authored/` | The authored source documents. |
| `examples/<example>/resolution.intent.xmi`, `resolution.pinned.xmi` | The source models the resolution reads. |
| `examples/<example>/<project>.resolveddeployment` | The target model the resolution writes. |
| `examples/<example>/dependencies.json`, `expected-dependencies.json` | Dependency edges from that model, and the expected edges. |
| `examples/minimal/minimal.hand-written.resolveddeployment` | The Task 1 target model, adapted to Task 2. |
| `examples/secrets/secrets.expected.resolveddeployment` | Expected target model for `secrets`. |

`<project>` equals `<example>`, except in `minimal`, whose Project is
`notes`. Open the models with the Sample Reflective Ecore Model Editor; they
reference their metamodels, so no package registration is needed.

## Run the transformations

With JDK 21 (`JAVA_HOME` set to it), from the archive root:

```sh
./build.sh          # Windows: build.cmd
```

This builds the implementation, runs all three transformations on every
example, and compares the results with the expected outputs. It then copies
each example's models to `output/<example>/`. It takes a few minutes.

## Run one transformation in Eclipse

Use Eclipse Modeling Tools with QVT Operational and JDK 21. Run `build.sh`
first, then import `implementation/emf` with File > Import > Existing
Maven Projects. The transformations must run from these projects: the
resolve project registers the `Hashing` black-box library they use.

1. **Flattening.** Create an Operational QVT Interpreter run configuration
   for `model/lower.qvto` in `dev.jorisjonkers.deploykit.emf.resolve`.
   Input: `dev.jorisjonkers.deploykit.emf.cli/target/parity/minimal/notes.project.xmi`.
   Output: a new XMI file.
2. **Resolution.** Run `resolution.launch` in the resolve project. It
   resolves `minimal` and writes `target/resolution/notes.resolveddeployment`.
3. **Final pass.** Create a run configuration for `model/estate.qvto`. Its
   one parameter is `inout`: give it a copy of a resolved model, such as
   `target/parity/auth/auth.resolveddeployment` in the cli project.
