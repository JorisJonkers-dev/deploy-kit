# Task 2 hand-in archive

`task-2-transformations.zip` is the archive handed in for Task 2. It holds the
report (`report.pdf`), a `README.md` for the marker (`hand-in-README.md` here),
and two folders:

- `task-2-transformations/`, an Eclipse project holding the three metamodels,
  the two QVT-Operational transformations, and per example the authored files,
  the two extents the resolution read, the resolved model it wrote, and the
  dependency edges exported from it beside the oracle they equal;
- `implementation/`, the tracked `emf/` modules, `spec/v1/examples/` and
  `docs/requirements.md`, so `./mvnw verify` runs there as it does here.

Appendix B of the report describes the layout.

It is built from the repository, never assembled by hand:

```bash
(cd emf && ./mvnw -B -ntp clean verify)   # writes every example's extents and resolved model
python3 docs/mde/task-2-transformations/handin/build.py
```

`build.py --dir [PATH]` writes the same tree as a folder, by default `hand-in/`
beside the script, instead of the zip. Build the report PDF first: the archive
copies `../main.pdf`. `build.py` strips the comments from every XML file, adds
the `xsi:schemaLocation` each model needs to open without a registered package,
and writes the zip with a fixed timestamp, so the same tree builds the same
archive.

This directory is coursework, not repository tooling: the gates under `scripts/`
and `test/` do not read it.
