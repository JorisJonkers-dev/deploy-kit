# Schema refusals: the files the reader refuses

Every case here is refused before any rule runs, by the YAML subset or by the
schema, with the code `schema`
([chapter 10](../../10-project-intent.md#reading-a-file)). Each carries a
committed `<name>.diagnostics.json` beside it: the set of `(code, document,
path)` triples the reader reports, where the path is the RFC 6901 JSON Pointer
the chapter's table says the refusal lands at.

| fixture | what it breaks | where it is refused |
|---|---|---|
| [`unknown-field.project.yml`](unknown-field.project.yml) | two fields the model does not have, on one Application | each field, once |
| [`missing-field.project.yml`](missing-field.project.yml) | a Process with no `image` | where the field would be |
| [`wrong-type.project.yml`](wrong-type.project.yml) | a port written as a string | the value |
| [`no-shape-matches.project.yml`](no-shape-matches.project.yml) | `probes` that is neither `none` nor a probe block | the value, once, with nothing inside it |
| [`every-offending-value.project.yml`](every-offending-value.project.yml) | three unrelated defects in one file | every one of them |
| [`outside-yaml-subset.project.yml`](outside-yaml-subset.project.yml) | an anchor, an alias and an explicit tag | the root, once |
| [`two-documents.project.yml`](two-documents.project.yml) | two YAML documents in one file | the root, once |
| [`egress-without-reason.project.yml`](egress-without-reason.project.yml) | internet egress with no `reason` | where the field would be |
| [`egress-outside-vocabulary.project.yml`](egress-outside-vocabulary.project.yml) | `egress.to` outside its closed vocabulary | the value |
| [`egress-with-range.project.yml`](egress-with-range.project.yml) | internet egress with an authored range | the field |
| [`schedule-malformed.project.yml`](schedule-malformed.project.yml) | a `schedule` that is not five cron fields | the value |
| [`rate-limit-without-period.project.yml`](rate-limit-without-period.project.yml) | a route's `rateLimit` with no `per` | where the field would be |
| [`rate-limit-of-no-requests.project.yml`](rate-limit-of-no-requests.project.yml) | a route's `rateLimit` allowing `0` requests | the value |
| [`rate-limit-period-in-milliseconds.project.yml`](rate-limit-period-in-milliseconds.project.yml) | a route's `rateLimit` over `500ms` | the value |
| [`credentials-file-without-mount.project.yml`](credentials-file-without-mount.project.yml) | an edge's credential delivered `file` with no `mountAt` or `fileMode` | the edge's `credentials` |
| [`platform-unknown-field/`](platform-unknown-field/) | a Platform document with a field the model does not have | the field |
| [`human-grant-to-a-user/`](human-grant-to-a-user/) | a Human Grant naming a `user` instead of a `group` | the field, and where `group` would be |
| [`human-grant-in-a-namespace/`](human-grant-in-a-namespace/) | a Human Grant scoped to a `namespace` | the field |
| [`human-grant-role-outside-vocabulary/`](human-grant-role-outside-vocabulary/) | a Human Grant of a role outside the built-in four | the value |
| [`human-grant-without-reason/`](human-grant-without-reason/) | a Human Grant with no `reason` | where the field would be |

These oracles bind the production implementation only
([the parity contract](../../../../docs/architecture.md#the-parity-contract)):
the model-driven implementation reads a file through a grammar, which refuses
the token rather than naming the field. `test/schema-refusals.test.ts`
runs each case.
