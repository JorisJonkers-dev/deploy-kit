# Schema refusals: the files the reader refuses

Every case here is refused before any rule runs, by the YAML subset or by the
schema, with the code `schema`
([chapter 10](../../10-project-intent.md#reading-a-file)). Each carries a
committed `<name>.diagnostics.json` beside it: the set of `(code, document,
path)` triples the reader reports, where the path is the RFC 6901 JSON Pointer
the chapter's table says the refusal lands at.

| fixture | what it breaks | where it is refused |
|---|---|---|
| [`alert-class-unknown.project.yml`](alert-class-unknown.project.yml) | a value outside the closed `AlertClass` vocabulary | the value |
| [`unknown-field.project.yml`](unknown-field.project.yml) | two fields the model does not have, on one Application | each field, once |
| [`missing-field.project.yml`](missing-field.project.yml) | a Process with no `image` | where the field would be |
| [`wrong-type.project.yml`](wrong-type.project.yml) | a port written as a string | the value |
| [`no-shape-matches.project.yml`](no-shape-matches.project.yml) | `probes` that is neither `none` nor a probe block | the value, once, with nothing inside it |
| [`every-offending-value.project.yml`](every-offending-value.project.yml) | three unrelated defects in one file | every one of them |
| [`outside-yaml-subset.project.yml`](outside-yaml-subset.project.yml) | an anchor, an alias and an explicit tag | the root, once |
| [`two-documents.project.yml`](two-documents.project.yml) | two YAML documents in one file | the root, once |
| [`platform-unknown-field/`](platform-unknown-field/) | a Platform document with a field the model does not have | the field |

These oracles bind the production implementation only
([the parity contract](../../../../docs/architecture.md#the-parity-contract)):
the model-driven implementation reads a file through a grammar, which refuses
the token rather than naming the field. `test/model/schema-refusals.test.ts`
runs each case.
