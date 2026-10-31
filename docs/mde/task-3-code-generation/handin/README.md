# Task 3 hand-in archive

`task-3-code-generation.zip` is the archive handed in for Task 3. It holds the
report (`report.pdf`), a `README.md` for the marker (`hand-in-README.md` here),
the `build.sh` and `build.cmd` from `scripts/`, which build and test the
implementation and run the transformation on each example, and two folders:

- `task-3-code-generation/`, an Eclipse project holding the Acceleo module
  `render.mtl`, the Resolved Deployment metamodel it reads, and per example
  (`minimal`, `data`, `edge`) the source model, the files the module generates
  from it and the oracles they equal, with a Program launch per example that
  regenerates them and a Maven launch that runs the implementation's tests;
- `implementation/`, the tracked `emf/` modules with `spec/v1/examples/` and the
  two intent schemas `FieldCoverageTest` reads, so `./mvnw verify` runs there.
  It leaves out what only governs this repository (`emf/docs/`, `emf/scripts/`,
  `emf/README.md` and the ledger test that reads them) and `render.launch`,
  whose Acceleo launch type resolves the metamodel only through the IDE's
  package registry and so writes nothing from an imported workspace.

`hand-in-README.md`, copied into the archive as `README.md`, says how to import
the projects into Eclipse and how to run the transformation and the tests from
the command line and from Eclipse.

**The oracles come from release 1.4.0.** An oracle moves in the production
implementation first and `emf/` catches up later, so `emf/` as it stands is
level with the oracles of `v1.4.0`, not with `main`'s: against `main`'s
`spec/v1/examples/` its cli module fails 77 of 276 tests. `build.py` therefore takes
`spec/v1/examples/` and the two schemas from `v1.4.0` (`--spec-rev REV` to
change it) and `emf/` from the working tree.

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
workbench.

This directory is coursework, not repository tooling: the gates under `scripts/`
and `test/` do not read it.
