# Task 3: code generation

Joris Jonkers (s1829157), Model Driven Engineering, University of Twente.

## Contents

- `report.pdf`: the report.
- `build.sh`, `build.cmd`: build and test the implementation and run the
  transformation; see below.
- `task-3-code-generation/`: Eclipse project with the source models, the
  generated code and the expected code.
- `implementation/`: the Eclipse/Maven projects that hold and run the
  transformation, with the example files their tests read. The transformation
  is `implementation/emf/bundles/render/model/render.mtl` (Acceleo 4), in the
  plug-in project `dev.jorisjonkers.deploykit.emf.render`.

In `task-3-code-generation/`:

| Path | Contents |
| --- | --- |
| `model/resolved-deployment.ecore` | The metamodel the transformation reads: the Resolved Deployment, the target metamodel of Task 2. |
| `examples/<example>/<project>.resolveddeployment` | The source model: the Resolved Deployment the Task 2 resolution writes for the example. |
| `examples/<example>/generated/` | The code `render.mtl` generates from it: Kubernetes manifests and Kustomize files under `apps/<project>/`, and the platform-wide files under `estate/`. |
| `examples/<example>/expected/` | The files the generated code must equal byte for byte: those the production implementation commits for this example and for the platform. |
| `scripts/Render.java` | Runs the transformation on one model and compares the result with `expected/`. |
| `render <example>.launch`, `test implementation.launch` | Run configurations; see below. |

The examples are `minimal` (Project `notes`: 15 files, plus 4 under `estate/`),
`data` (76, plus 4) and `edge` (34, plus 4). Open a model with Open With >
Sample Reflective Ecore Model Editor: it references its metamodel, so no
package registration is needed.

To see a change to the transformation take effect, edit `render.mtl` in the
render project and run `build.sh` again.

## Run the transformation from the command line

With JDK 21 (`JAVA_HOME` set to it), from the archive root:

```sh
./build.sh          # Windows: build.cmd
```

This builds the implementation and runs its tests (about 600, including the
stage tests that run the transformation on 18 cases), then runs `render.mtl`
on each example's model, writes the generated files to `output/<example>/`,
and compares them with `examples/<example>/expected/`. It prints one `OK` line
per example and fails on any difference. It takes about four minutes; the first
run also downloads Maven and the Eclipse bundles. `./build.sh --mutation` also
runs the mutation tests, which take much longer.

One example at a time, after `build.sh`:

```sh
java -cp "implementation/emf/target/lib/*" task-3-code-generation/scripts/Render.java \
  task-3-code-generation/examples/edge/edge.resolveddeployment output/edge \
  task-3-code-generation/examples/edge/expected
```

## Run the transformation and the tests in Eclipse

Use Eclipse Modeling Tools 2026-06 with Acceleo 4, QVT Operational and the m2e
PDE integration (M2E - PDE Integration), all from the 2026-06 release site, and
JDK 21.

1. Run `build.sh` once. It generates the metamodel's Java code, which the
   projects need, and collects the jars the launches use.
2. In Window > Preferences > Java > Installed JREs, add the JDK 21, and under
   Execution Environments select it for `JavaSE-21`.
3. Open `implementation/emf/emf.target` (File > Open File) and click **Set as
   Active Target Platform**. Wait until it has resolved; it downloads from the
   2026-06 release site.
4. File > Import > General > Existing Projects into Workspace: select
   `task-3-code-generation/`.
5. File > Import > Maven > Existing Maven Projects: select `implementation/emf`
   and import every module.
6. In Run > Run Configurations:
   - **Program > render minimal** (and `data`, `edge`) runs `render.mtl` on the
     example's model, writes `examples/<example>/generated/` again, and
     compares it with `expected/`; the console ends with `OK`.
   - **Maven Build > test implementation** runs the implementation's tests,
     without the mutation tests and the coverage report.

After the import, the Problems view shows four errors on the `pom.xml` of the
metamodel and syntax projects, `Failed to execute mojo
org.codehaus.mojo:exec-maven-plugin:3.6.4:java`, and no Java errors. They come
from Eclipse trying to run the EMF and Xtext code generators, which need a
classpath Eclipse does not give them. `build.sh` has already run them, so the
errors can be ignored: they disappear with the next build, for instance after
running **test implementation**.

Open `model/render.mtl` in `dev.jorisjonkers.deploykit.emf.render` to read the
transformation in Acceleo's editor. Acceleo 4.2.2's language server can
deadlock when the first module is opened while it is still indexing the
workspace: the editor then shows the module with its syntax colouring but
reports nothing, and the Progress view keeps a "Synchronizing AcceleoWorkspace"
job. This is a fault in Acceleo, not in the module: when the server is running,
it reports no problem in `render.mtl`.
