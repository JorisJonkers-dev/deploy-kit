# Task 2: model transformation, hand-in

Joris Jonkers (s1829157), Model Driven Engineering, University of Twente.

- `report.pdf`: the report.
- `task-2-transformations/`: an Eclipse project holding the three metamodels
  (`model/`), the two QVT-Operational transformations (`transforms/`), and per
  example (`examples/<example>/`):
  - `authored/`: the project document and its env and configuration files;
  - `resolution.intent.xmi` and `resolution.pinned.xmi`: the two model extents
    the resolution read;
  - `<project>.resolveddeployment`: the resolved model it wrote;
  - `dependencies.json`: the dependency edges exported from that model, and
    `expected-dependencies.json`, the committed oracle they equal.
  `examples/platform/` holds the platform document and the pinned inputs every
  example reads. `examples/minimal/minimal.hand-written.resolveddeployment` is
  the hand-written target model the resolution of `minimal` equals.
  Import it with File > Import > General > Existing Projects into Workspace.
  Every XMI declares its metamodel in `xsi:schemaLocation`, so it opens in the
  Sample Reflective Ecore Model Editor without a registered package.
- `implementation/`: the EMF implementation and the examples its tests read.

## Running the transformation

From a terminal, with JDK 21:

```sh
cd implementation/emf
./mvnw clean verify
```

This parses every example, runs both transformations, and runs every test,
including the parity test that compares each example's `dependencies.json`
with its oracle. The outputs are written under
`bundles/cli/target/parity/<example>/`.

In Eclipse Modeling Tools with the QVT-Operational SDK: import
`implementation/emf` as existing Maven projects after the terminal build, and
run `resolution.launch` in `dev.jorisjonkers.deploykit.emf.resolve`. The
resolution calls one Java black-box library for hashing, which that plug-in
registers, so it runs from the implementation's projects rather than from the
models project.
