# Task 3: code generation

Joris Jonkers (s1829157), Model Driven Engineering, University of Twente.

- `report.pdf`: the report.
- `task-3-code-generation/`: an Eclipse project (File > Import > Existing
  Projects into Workspace) with the target metamodel (`model/`), the Acceleo
  module (`templates/render.mtl`), the resolved models it renders
  (`examples/`), the files it generated (`generated/`), the committed trees
  they equal byte for byte (`expected/`), and the output of `kustomize build`
  and `kubeconform` over the generated files (`evidence/`).
- `implementation/`: the EMF implementation and the examples its tests read.

To build and test everything, with JDK 21:

```bash
cd implementation/emf
./mvnw clean verify
```

The build parses every example, runs the two QVT-Operational transformations
and the Acceleo templates, writes the rendered tree under
`bundles/cli/target/parity/rendered/`, and compares it with the committed
trees. To run the templates in Eclipse Modeling Tools with the Acceleo 4 SDK,
import `implementation/emf` as existing Maven projects after that build, and
run `render.launch` in `dev.jorisjonkers.deploykit.emf.render`.
