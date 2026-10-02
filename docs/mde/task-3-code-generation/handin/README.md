# Task 3 hand-in archive

`task-3-code-generation.zip` is the archive handed in for Task 3. It holds the
report (`report.pdf`), a `README.md` for the marker (`hand-in-README.md` here),
and two folders:

- `task-3-code-generation/`, an Eclipse project holding the target metamodel,
  the Acceleo module, the resolved models of `minimal` and `data` it renders,
  the tree it wrote, the committed trees that tree equals, and the output of
  kustomize and kubeconform over it;
- `implementation/`, the tracked `emf/` modules, `spec/v1/examples/` and
  `docs/requirements.md`, so `./mvnw verify` runs there as it does here.

Appendix B of the report describes the layout.

It is built from the repository, never assembled by hand:

```bash
(cd emf && ./mvnw -B -ntp clean verify)   # writes the resolved models and the rendered tree
python3 docs/mde/task-3-code-generation/handin/build.py
```

`build.py --dir [PATH]` writes the same tree as a folder, by default `hand-in/`
beside the script, instead of the zip. Build the report PDF first: the archive
copies `../main.pdf`. The evidence needs `kustomize` and `kubeconform` on the
PATH, and kubeconform fetches its schemas from the network. The zip is written
with a fixed timestamp, so the same tree builds the same archive.

This directory is coursework, not repository tooling: the gates under `scripts/`
do not read it.
