# The pipeline

A behaviour of a pull request, a push to `main` or a release: commit and title conventions, the pull request report, release candidates, the published package and mutation testing.

| id | a contributor or a consumer can rely on | proved by |
|---|---|---|
| REQ-005 | A pull request title and its commits use a conventional-commit type release-please reads | [test/pr-title-contract.test.ts](../../test/pr-title-contract.test.ts) |
| REQ-009 | The npm package ships nothing outside `docs/adr/`, `spec/` and the JavaScript under `dist/`, checked against what npm would really pack rather than the advisory `files` field | [test/package-contents-contract.test.ts](../../test/package-contents-contract.test.ts) |
| REQ-012 | A pull request's title, body and every commit in it carry no agent attribution: no Co-Authored-By trailer naming a coding agent, no "generated with" banner naming one, no link back to an agent session | [test/pr-title-contract.test.ts](../../test/pr-title-contract.test.ts) |
| REQ-022 | A push to `main` re-tests every mutant under `src/` that its change reaches, and one that survives takes the score below the measured threshold and fails the build; a pull request runs no mutation | [test/mutation-contract.test.ts](../../test/mutation-contract.test.ts) |
| REQ-025 | Every file a pull request changes falls into a named shape bucket (production code, tests, specification, decision records, documentation, examples, tooling, CI, generated), and a file no rule claims fails the bucket test rather than silently joining one | [test/change-buckets.test.ts](../../test/change-buckets.test.ts) |
| REQ-026 | A pull request's shape-and-coverage comment is updated in place on a second push, rather than posted again | [test/pr-report.test.ts](../../test/pr-report.test.ts) |
| REQ-027 | A pull request's release candidate version sorts above the current release and below any version release-please could choose next | [test/rc-version.test.ts](../../test/rc-version.test.ts) |
| REQ-046 | The published package runs the command: the tarball `npm pack` builds, installed into an empty project, puts `deploy-kit` on the path, and it accepts a worked example, refuses a broken one with its code, and exits 2 on a wrong call | [test/packed-command.test.ts](../../test/packed-command.test.ts) |
| REQ-055 | The weekly full mutation run names every mutant under `src/` that no test detected, in an issue, and gates nothing | [test/mutation-survivors.test.ts](../../test/mutation-survivors.test.ts) |
| REQ-063 | A run's mutation shards merge into one report holding every mutant once, which decides the score, names every survivor whichever shard found it, and is the baseline a push to `main` uploads | [test/mutation-merge.test.ts](../../test/mutation-merge.test.ts) |
| REQ-064 | A push to `main` that changes no module, no test, nothing the mutation gate runs under and no dependency runs no mutation shard, and the last report stands; a pull request never runs one | [test/mutation-scope.test.ts](../../test/mutation-scope.test.ts) |
