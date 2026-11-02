# emf: the model-driven implementation

Everything under this directory is the model-driven implementation of the
deploy-kit compiler, the second implementation beside the TypeScript production
implementation, built with the Eclipse Modeling Framework toolchain the
model-driven engineering course at the University of Twente requires: Ecore,
Xtext, OCL, QVT-Operational and Acceleo. It is **deprecated from the day it
lands**: it exists for the length of the course and is deleted when its sunset
condition holds
([0071](docs/adr/emf/0071-emf-is-coursework-scoped-and-self-contained.md)).

The repository root stays TypeScript. Nothing outside `emf/` builds, imports or
depends on anything inside it. The Maven build, its modules, its checks, its
ledgers and its decisions all live here, so the sunset is deleting this
directory and the few root lines that name it, listed in
[the architecture](docs/architecture.md#scope-and-sunset).

The one thing this implementation shares with the production implementation is the
[parity contract](../docs/architecture.md#the-parity-contract): the committed
oracle files under `spec/v1/examples/` that both are tested against, separately.

| read | for |
|---|---|
| [docs/architecture.md](docs/architecture.md) | the structure: toolchain, modules, how each stage meets the contract |
| [docs/adr/README.md](docs/adr/README.md) | the decisions that shaped it, and the register |
| [docs/benchmarks.md](docs/benchmarks.md) | how long each stage takes, and the lowering in QVTo against an ATL port of it |

## Where each artefact lives

This table says which artefact lives where and which course task grades
it, so the split tree
([0081](docs/adr/emf/0081-bundles-and-tests-are-separate-tiers.md))
answers the navigation question without a search.

| artefact | lives in | graded in | how an examiner opens it |
|---|---|---|---|
| the Ecore metamodels (source, target and pinned inputs) and their OCL | `emf/bundles/metamodel` | Task 1 | imported in step 2; `model/project-intent.ocl` validates `model/cache.xmi` clean and refuses `model/cache-continuous.xmi`, as step 3 describes |
| the Xtext grammars and generated editor | `emf/bundles/syntax` | Task 1 | imported in step 2; the generated editor reports OCL constraint violations while a source file is edited in it |
| the QVTo transformations | `emf/bundles/resolve` | Task 2 | imported in step 2; `resolution.launch` runs the resolution on `minimal`, as step 4 describes |
| the Acceleo templates | `emf/bundles/render` | Task 3 | imported in step 2; `render.launch` runs them, as step 4 describes |
| the pipeline entry point | `emf/bundles/cli` | Task 1 onward | imported in step 2, alongside the rest |
| the parity suite | `emf/tests/parity` | no task grades it | it is Maven-only; no examiner opens it |

## Building

```sh
cd emf
./mvnw verify
```

JDK 21 is required; the wrapper downloads the pinned Maven, and Tycho the
bundles `emf.target` pins.

## A fast local loop

The full build runs every gate, so a one-line change to a transformation
waits minutes. While editing, build the bundles without the parity tier,
offline, run only the test that covers the change, and skip the gates. This
takes about half a minute:

```sh
cd emf
./mvnw -o -Pquick verify -pl '!tests/parity' -Dtest=StageTest -Dsurefire.failIfNoSpecifiedTests=false
```

- `-Pquick` skips the JaCoCo agent and its coverage floor, PIT and the
  Spotless check. It runs the tests. CI never passes it, so every gate still
  runs on the pull request.
- `-pl '!tests/parity'` builds every bundle and leaves out the parity tier;
  the full build runs it. `bundles/cli` holds the pipeline tests, including
  the stage cases. Maven's `-am` cannot stand in here: a bundle names the bundles
  it needs in its `META-INF/MANIFEST.MF`, not its POM, so `-pl bundles/cli -am`
  builds `cli` alone and Tycho cannot resolve the bundles it requires.
- `-o` works offline once one full build has filled the local repository.
- `-Dtest=<class>` runs one test class, or `<class>#<method>` one method.
  `-Dsurefire.failIfNoSpecifiedTests=false` lets the modules that have no
  such test pass.
- `-Dgolden.update=true` rewrites the stage goldens from what the stages now
  write, for review in `git diff`.

[`mvnd`](https://github.com/apache/maven-mvnd), the Maven daemon, keeps a warm
JVM between builds and takes the same arguments. It is optional: nothing here
needs it.

On a managed machine an antivirus scanner can slow every file Maven and Tycho
read and write. Excluding the local Maven repository and the `target/`
directories from scanning is a request to the machine's IT department, not a
setting in this repository.

## Opening in Eclipse

For examiners, in Eclipse Modeling Tools 2026-06 with the OCL, QVT-Operational
and Acceleo 4 SDKs installed from the same release:

0. Run `./mvnw verify` once, from `emf/`, before importing anything. Each
   metamodel's typed Java is generated into `target/generated-sources/emf/`,
   which `build.properties` names as a source folder, and on a clean clone that
   directory does not exist yet: import first and the workspace opens with
   every reference to a generated package unresolved. One terminal build is
   what makes the import land clean.
1. Open `emf/emf.target` and choose **Set as Active Target Platform**.
2. **File > Import > Maven > Existing Maven Projects**, with `emf/` as the
   root directory. The importer walks the whole tree, so that one root
   still finds the five bundles nested under `emf/bundles/` and the parity
   suite nested under `emf/tests/parity`; import every module. Five of the six
   are `eclipse-plugin` packaging, which m2e maps through the Tycho
   configurator: accept the connector if the importer offers to install one,
   and restart when it asks.
3. In `dev.jorisjonkers.deploykit.emf.metamodel`, open
   `model/project-intent.ecore`, the Project Intent metamodel. Open
   `model/cache.xmi` with the Sample Reflective Ecore Model Editor. It holds a
   small Project, as the parser reads it from YAML. `model/cache-continuous.xmi`
   is the same Project with one edit: its Process asks for a `continuous`
   cutover over a ReadWriteOnce volume. Load `model/project-intent.ocl` into
   each model's editor through **OCL > Load Document** (from the OCL Examples
   and Editors SDK), one editor at a time. An invariant across documents ranges
   over its editor's resources, so two Projects in one editor would each refuse
   the other's name. Validated against the document, `cache.xmi` breaks
   nothing, and `cache-continuous.xmi` breaks `E_CUTOVER_UNHONOURABLE` on its
   Process and nothing else. `ProjectIntentOclTest`, which step 0's build runs,
   holds both results. In Eclipse 2026-06 with OCL 6.24, the editor's
   **Validate** after the load reports neither. The command's job disposes the
   document it loaded before **Validate** runs, while the same loader kept open
   over the editor's resources reports exactly that one invariant.
4. Run `resolution.launch` in `dev.jorisjonkers.deploykit.emf.resolve` and
   `render.launch` in `dev.jorisjonkers.deploykit.emf.render` from **Run > Run
   Configurations**. They write under each project's `target/`. The resolution
   reads the two extents step 0's build left under
   `dev.jorisjonkers.deploykit.emf.cli/target/parity/minimal/`, and its output
   equals `models/minimal.resolveddeployment`. `render.launch` is a Java
   application launch of `RenderModel`, which reads that committed model with
   its package registered in its own resource set and renders it through
   `Rendering.render`, the entry the pipeline uses: the files it writes under
   `target/render/apps/notes/` equal
   `spec/v1/examples/minimal/rendered/apps/notes/`, as `RenderModelTest` holds.
