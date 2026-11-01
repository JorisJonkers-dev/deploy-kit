# Task 3 hand-in archive

`task-3-code-generation.zip` is the archive handed in for Task 3. It holds the
report (`report.pdf`), a `README.md` for the marker (`hand-in-README.md` here),
the `build.sh` and `build.cmd` from `scripts/`, which build and test the
implementation and run the transformation on each example, and two folders:

- `task-3-code-generation/`, an Eclipse project holding the Resolved Deployment
  metamodel and per example (`minimal`, `data`, `edge`) the source model, the
  files `render.mtl` generates from it and the oracles they equal, with a
  Program launch per example that regenerates them and a Maven launch that runs
  the implementation's tests. It holds no copy of `render.mtl`: Acceleo's
  editor resolves a module's metamodel through the classpath of the Java project
  holding it, so outside the render plug-in project every type in it shows as
  unresolved;
- `implementation/`, the tracked `emf/` modules with `spec/v1/examples/` and the
  two intent schemas `FieldCoverageTest` reads, so `./mvnw verify` runs there.
  It leaves out what only governs this repository (`emf/docs/`, `emf/scripts/`,
  `emf/README.md` and the ledger test that reads them). The render plug-in
  project keeps its `render.launch`, a Java application launch of
  `RenderModel` that renders the committed `emf/models/minimal.resolveddeployment`
  under the project's `target/render/`.

`hand-in-README.md`, copied into the archive as `README.md`, says how to import
the projects into Eclipse and how to run the transformation and the tests from
the command line and from Eclipse.

**The oracles come from the checked-out commit.** `build.py` takes `emf/` from
the working tree and `spec/v1/examples/` and the two schemas from `HEAD`, the
commit `emf/` is level with; `--spec-rev REV` takes them from another revision
instead.

It is built from the repository, never assembled by hand:

```bash
# compile emf/ and collect the jars the renderer runs on; its tests run in the archive's build
(cd emf && ./mvnw -B -ntp clean package -DskipTests -DskipPitest=true -Djacoco.skip=true \
  dependency:copy-dependencies -DoutputDirectory="$PWD/target/lib")
python3 docs/mde/task-3-code-generation/handin/build.py
```

`build.py` runs `scripts/Render.java` on each example's model, which fails the
build unless the generated files equal the oracles byte for byte. `build.py
--dir [PATH]` writes the same tree as a folder, by default `hand-in/` beside the
script, instead of the zip, and `--pdf PATH` names the report, by default
`../main.pdf`. It strips the comments from every XML file, adds the
`xsi:schemaLocation` each model needs to open without a registered package, and
writes the zip with a fixed timestamp, so the same tree builds the same archive.

`scripts/eclipse-check.sh HAND_IN WORK` checks the unpacked archive, after its
`build.sh`, in Eclipse on macOS: it installs Eclipse Modeling Tools 2026-06
under `WORK`, provisions it with the p2 director, and starts the workbench with
the plug-in in `scripts/eclipse-check/`, which sets the target platform,
imports and builds the projects, opens the editors, validates the models, runs
the launches, and writes `WORK/report.txt` and screenshots taken from inside the
workbench. Besides the archive's own launches it runs the render plug-in
project's `render.launch` and holds what it writes under `apps/notes/` to the
committed tree.

`scripts/dry-run.sh ROOT [SUBDIR] [LABEL]` produces the report's schema, Pod
Security and server dry-run results. From the unpacked archive, after its
`build.sh`, it runs as `dry-run.sh output "" generated`: per example it runs
`scripts/lint-manifests.ts` (kubeconform 0.6.7 and the `restricted` profile) on the
tree, then starts a disposable k3s v1.36.5 container (`dk-evidence-k3s`, removed on
exit), installs the CRDs it pins, creates the namespaces the tree names, and
applies every Kustomize index and every file no index lists with
`--dry-run=server`. Every kubectl call reads only the kubeconfig the script writes
into its own temporary directory. It is not copied into the archive: the profile
check is this repository's own, so it needs a checkout with `npm ci` run.

This directory is coursework, not repository tooling: the gates under `scripts/`
and `test/` do not read it.
