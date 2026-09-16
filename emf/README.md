# emf: the model-driven implementation

Everything under this directory is the model-driven implementation of the
deploy-kit compiler, the second implementation beside the TypeScript production
implementation, built with the Eclipse Modeling Framework toolchain the
model-driven engineering course at the University of Twente requires: Ecore,
Xtext, OCL, QVT-Operational and Acceleo. It is **deprecated from the day it
lands**: it exists for the length of the course and is deleted when its sunset
condition holds
([0107](docs/adr/emf/0107-emf-is-coursework-scoped-and-self-contained.md)).

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

## Where each artefact lives

This table says which artefact lives where and which course task grades
it, so the split tree
([0121](docs/adr/emf/0121-bundles-and-tests-are-separate-tiers.md))
answers the navigation question without a search.

| artefact | lives in | graded in | how an examiner opens it |
|---|---|---|---|
| the two Ecore metamodels and their OCL | `emf/bundles/metamodel` | Task 1 | imported in step 2; `model/skeleton.ecore` and `model/skeleton.ocl` open and validate as step 3 describes |
| the Xtext grammar and generated editor | `emf/bundles/syntax` | Task 1 | imported in step 2; the generated editor reports OCL constraint violations while a source file is edited in it |
| the QVTo transformation | `emf/bundles/resolve` | Task 2 | imported in step 2; `identity.launch` runs it, as step 4 describes |
| the Acceleo templates | `emf/bundles/render` | Task 3 | imported in step 2; `file.launch` runs them, as step 4 describes |
| the pipeline entry point | `emf/bundles/cli` | Task 1 onward | imported in step 2, alongside the rest |
| the parity suite | `emf/tests/parity` | no task grades it | it is Maven-only; no examiner opens it |

## Building

```sh
cd emf
./mvnw verify
```

JDK 21 is required; the wrapper downloads the pinned Maven, and Tycho the
bundles `emf.target` pins.

## Opening in Eclipse

For examiners, in Eclipse Modeling Tools 2026-06 with the OCL, QVT-Operational
and Acceleo 4 SDKs installed from the same release:

1. Open `emf/emf.target` and choose **Set as Active Target Platform**.
2. **File > Import > Maven > Existing Maven Projects**, with `emf/` as the
   root directory. The importer walks the whole tree, so that one root
   still finds the five bundles nested under `emf/bundles/` and the parity
   suite nested under `emf/tests/parity`; import every module.
3. In `dev.jorisjonkers.deploykit.emf.metamodel`, open `model/skeleton.ecore`.
   Open `model/empty.xmi` with the Sample Reflective Ecore Model Editor, load
   `model/skeleton.ocl` through **OCL > Load Document**, and validate: the
   `skeletonHasAnApplication` invariant is reported. `model/notes.xmi`
   validates clean.
4. Run `identity.launch` in `dev.jorisjonkers.deploykit.emf.resolve` and
   `file.launch` in `dev.jorisjonkers.deploykit.emf.render` from **Run > Run
   Configurations**. They write under each project's `target/`.
