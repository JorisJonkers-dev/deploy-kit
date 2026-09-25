# Task 1 hand-in archive

`task-1-metamodelling.zip` is the archive handed in beside the report: an
Eclipse project holding the two metamodels with their constraints and genmodels,
and every example and every refused model twice, as the authored YAML with its
env files and as the XMI the pipeline parsed it to (`notes.project.yml` and
`notes.project.xmi`). Appendix A.4 of the report describes the layout.

It is built from the repository, never assembled by hand:

```bash
(cd emf && ./mvnw -B -ntp clean verify)   # writes every model's XMI
python3 docs/mde/task-1-metamodelling/handin/build.py
```

`build.py --dir` writes the same tree as a folder, `task-1-metamodelling/`
beside the script, instead of the zip. It imports with File > Import > General >
Existing Projects into Workspace.

`build.py` writes the project as Eclipse configures it (OCL and Xtext natures and
builders, UTF-8), strips the comments from every XML file, adds the
`xsi:schemaLocation` each model needs to open without a registered package, and
writes the zip with a fixed timestamp, so the same tree builds the same archive.
`oclinecore.py` embeds every invariant and helper of `project-intent.ocl` in the
archive's copy of `project-intent.ecore`, so Validate reports the single-document
codes directly; the cross-document ones need `model/project-intent.ocl` loaded
(OCL > Load Document) into an editor holding both XMI files. The archive project
is the model plug-in, holding `model/` as EMF expects, and the genmodels generate
the edit, editor and tests code into plug-in projects of their own, for Java 21.

This directory is coursework, not repository tooling: the gates under `scripts/`
and `test/` do not read it.
