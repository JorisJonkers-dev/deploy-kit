# The `cli` family

Rules on the outermost ring's own conventions.

| id | family | the rule | enforced by | proved by |
|---|---|---|---|---|
| RULE-044 | cli | The CLI prints help on `--help` and `-h`, data on stdout and diagnostics on stderr, emits only data under `--json`, maps failures through one exit-code enum, honours `NO_COLOR`, and never prompts | `file:test/cli/conventions.test.ts` | [test/cli/conventions.test.ts](../../test/cli/conventions.test.ts) `RULE-044 refuses a CLI that breaks its conventions` |
