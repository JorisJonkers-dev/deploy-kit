# MDE Task 1: Project Intent and Resolved Deployment metamodels

| Path | What it is |
|---|---|
| `report.pdf` | The report. |
| `task-1-metamodelling/` | Eclipse project with both metamodels, their OCL constraints and every model. |
| `implementation/emf/` | The EMF implementation the models come from: the metamodel, Xtext and command-line Eclipse plug-in projects, built with Maven and Tycho. |
| `implementation/spec/v1/examples/` | The authored example and rejected models, with their expected results, which the implementation's tests read. |

## Inspecting the metamodels and models

Needs Eclipse Modeling Tools with the OCL feature.

1. File > Import > General > Existing Projects into Workspace, and select
   `task-1-metamodelling/`.
2. `model/` holds `project-intent.ecore` (the source metamodel, with its OCL
   invariants embedded), `project-intent.ocl`, `resolved-deployment.ecore` (the
   target metamodel) and a genmodel for each.
3. Open any `.xmi` in `examples/` or `refusals/` with Open With > Sample
   Reflective Ecore Model Editor, select the root object and choose Validate.
   The examples validate clean. `refusals/README.md` gives, for each rejected
   model, the code it reports and how to reproduce it; a rejected pair of a
   platform document and a project file needs both XMI files loaded and
   `model/project-intent.ocl` loaded with OCL > Load Document.

## Building and testing the implementation

Needs JDK 21; the Maven wrapper downloads Maven, and Tycho the Eclipse bundles.

```sh
cd implementation/emf
./mvnw verify
```

The build generates the metamodel code, parses every example and every rejected
model with the Xtext grammars, validates it against the OCL constraints, and
compares the result with the committed expected result. For each case it writes
`bundles/cli/target/parity/<case>/`: `intent.json` for an accepted model or
`diagnostics.json` (code, document, object path) for a rejected one, the exit
code, and the model as XMI.

To open the implementation in Eclipse, run the build once, then follow
"Opening in Eclipse" in `implementation/emf/README.md`: set `emf.target` as the
target platform and import `implementation/emf` with File > Import > Maven >
Existing Maven Projects.
