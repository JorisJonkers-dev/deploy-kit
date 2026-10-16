# Task 2: model transformations

Joris Jonkers (s1829157), Model Driven Engineering, University of Twente.

## Archive layout

- `report.pdf`: the report.
- `task-2-transformations/`: an Eclipse project for inspecting the models.
  Import it with File > Import > General > Existing Projects into Workspace.
  It contains no Java; execute the transformations from the implementation
  projects, which register the hashing library.
- `implementation/`: the EMF implementation and the specification examples
  used by its tests.

Within the models project:

| Path | Contents |
| --- | --- |
| `model/` | Source, pinned-inputs and target Ecore metamodels. |
| `transforms/` | The flattening (`lower.qvto`), resolution (`resolution.qvto`) and final pass (`estate.qvto`). |
| `examples/platform/` | Platform Intent and shared pinned inputs. |
| `examples/<example>/authored/` | Project Intent, environment files and configuration files. |
| `examples/<example>/resolution.intent.xmi` | Authored and flattened projects, plus Platform Intent: the resolution's intent extent. |
| `examples/<example>/resolution.pinned.xmi` | The resolution's pinned-input extent. |
| `examples/<example>/<project>.resolveddeployment` | The resolved model written by the transformation. |
| `examples/<example>/dependencies.json` | Dependency edges exported from that model. |
| `examples/<example>/expected-dependencies.json` | Copy of the specification's `expected/dependencies.json` oracle. |
| `examples/minimal/minimal.hand-written.resolveddeployment` | Task 1 model adapted to Task 2; its copied Revision and provenance values are qualified in the report. |
| `examples/secrets/secrets.expected.resolveddeployment` | Reviewed regression snapshot, including transformation-derived provenance. |

`<example>` names a test fixture; `<project>` names its authored Project.
They coincide except for `minimal`, whose Project is `notes`:

| Example | Project |
| --- | --- |
| `minimal` | `notes` |
| `auth` | `auth` |
| `data` | `data` |
| `delivery` | `delivery` |
| `edge` | `edge` |
| `knowledge-platform` | `knowledge-platform` |
| `observability` | `observability` |
| `secrets` | `secrets` |

Every supplied XMI declares its metamodel through `xsi:schemaLocation`, so
it opens in the Sample Reflective Ecore Model Editor without registering a
package manually.

## Run all three transformations from a terminal

With JDK 21, from the archive root:

```sh
cd implementation/emf
./mvnw clean verify
```

The build parses and checks the example documents, runs the flattening,
resolves each selected Project, and tests the final pass over the resolved
outputs before rendering. It then compares dependency lists, resolved
values and generated files with their expected results. The test output
folder is `bundles/cli/target/parity/<example>/`.

The saved `resolution.intent.xmi` and `resolution.pinned.xmi` are the exact
extents supplied to the resolution. The terminal build also produces
`notes.project.xmi` for the flattening example under
`bundles/cli/target/parity/minimal/`.

## Run individual transformations in Eclipse

Use Eclipse Modeling Tools with the QVT-Operational SDK and JDK 21. After
running the terminal build, import `implementation/emf` through File >
Import > Existing Maven Projects. The implementation's resolve plug-in
registers the Java `Hashing` black box needed by the resolution and final
pass.

1. **Flattening.** In `dev.jorisjonkers.deploykit.emf.resolve`, right-click
   `model/lower.qvto`, choose Run As > Run Configurations, and create an
   Operational QVT Interpreter configuration. Set the `source` input to
   `dev.jorisjonkers.deploykit.emf.cli/target/parity/minimal/notes.project.xmi`
   and the `target` output to a new XMI file. Both use
   `https://jorisjonkers.dev/deploy-kit/project-intent/1`. The result should
   contain an `EffectiveProject` named `notes` with shared declarations
   copied onto its Processes.
2. **Resolution.** Run the existing `resolution.launch` in the resolve
   project. Its `intent` and `pinned` inputs refer to the two extents under
   the CLI project's `target/parity/minimal/` folder; its configuration
   property `project` is `notes`. It writes
   `target/resolution/notes.resolveddeployment` in the resolve project.
   The `integrity` property supplies the pinned schema-package digest.
3. **Final pass.** Create an Operational QVT Interpreter configuration for
   `model/estate.qvto`. Its single `rendered` parameter is `inout` and uses
   `https://jorisjonkers.dev/deploy-kit/resolved-deployment/1`. Supply a
   working copy of a resolved model containing Vault policy or role
   Deliverables, such as `auth.resolveddeployment` produced by the build.
   The pass adds the combined policy-job files and the Flux event route to
   that model. A single model demonstrates the pass for that subset; use
   the terminal build's composed-render test to exercise it over several
   Projects together. Do not use an already finalised model as input again,
   because the pass appends Deliverables.

The models-only project is for inspection. Its transformations cannot run
independently of the implementation plug-in's hashing-library registration.
