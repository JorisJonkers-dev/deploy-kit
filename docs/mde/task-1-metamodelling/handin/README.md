# Task 1 hand-in archive

`task-1-metamodelling.zip` is the archive handed in with the report: the report
PDF, the two metamodels and their constraints, and every example model as input,
resolved model and output, each XMI or JSON file beside a readable YAML view. Its
own README says what each directory holds.

It is built from the repository, never assembled by hand:

```bash
(cd emf && ./mvnw -B -ntp clean verify)   # writes each example's XMI
python3 docs/mde/task-1-metamodelling/handin/build.py
```

- `build.py` copies the files into the archive layout and writes the zip with a
  fixed timestamp, so the same tree builds the same archive.
- `toyaml.py` renders an XMI instance or a JSON document as YAML, mechanically:
  the rules are the report's Appendix A. It needs PyYAML.

This directory is coursework, not repository tooling: the gates under `scripts/`
and `test/` do not read it.
