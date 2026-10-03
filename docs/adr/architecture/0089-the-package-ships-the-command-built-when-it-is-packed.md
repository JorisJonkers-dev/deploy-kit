---
tier: decision
status: accepted
claim: settled
date: 2026-10-03
normative: docs/architecture.md#the-published-package
rests-on: ["0006"]
---

# The package ships the command, built to JavaScript when it is packed, and the repository still runs its TypeScript directly

The published package carries a `deploy-kit` bin. Every pack and publish is
preceded by a build step: `tsc` strips the types from `src/` and writes
JavaScript to `dist/`, which is never committed. Inside the repository nothing changes: the
suite, the gates and a clone run the TypeScript as it is written.

## Rests on

Every assignment is a function of pinned inputs
([0006](../model/0006-pinned-inputs.md)), and the toolkit that composes is one
of them: a workflow must run the command at the version its own lockfile pins,
which it can only do if the pinned package contains the command.

**False if:** a workflow can pin the toolkit some other way that its lockfile
records and Renovate moves, without the package carrying the command.
**Settled by:** the worked workflows calling `npx --no-install deploy-kit`,
which resolves only what the lockfile installed.

## Why

**Node does not strip types under `node_modules`.** A clone runs
`src/cli/index.ts` directly, but the same file installed as a dependency is
refused by Node, by design. So the package has to carry JavaScript, and
something has to produce it.

**The compiler already in the tree produces it.** `tsc` is a development
dependency the type check uses on every commit. With relative import extensions
rewritten on emit, it turns each `.ts` file into the `.js` file beside the same
path, one for one, and adds no dependency.

**Built for the pack, not committed.** A committed `dist/` is a second copy
of the source that a pull request can forget to rebuild, and a generated file a
reviewer has to trust. A workflow checks out a clean tree, builds, and packs, so
the JavaScript in a tarball is the build of the commit that was packed.

**An explicit step, because hooks are off.** This repository runs no lifecycle
script, its own `prepack` included, so a hook would never fire and the package
would ship a `bin` with nothing behind it. Each workflow that packs or
publishes runs `npm run build` first, and the package-contents gate refuses a
pack that holds no file for a `bin` it names, so a forgotten build fails the
release instead of shipping.

**The repository keeps running what is written.** The rule that tooling has no
build step stays whole: no test, gate or script reads `dist/`. The one place
the build is exercised is the test that installs the packed tarball and runs
the installed command.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Bundle the command into one file with esbuild | a new development dependency to pin and update, and a bundle that inlines `zod` and `yaml` | the emitted files map one to one onto the source and the two runtime dependencies stay ordinary dependencies a lockfile records; a bundler buys nothing the tree needs |
| Run the command from a pinned clone in each workflow | a checkout and an install of the whole repository per run, and a pin that lives in a workflow input | the pin leaves the lockfile, so Renovate and the ordering gate no longer see it |
| Commit `dist/` | a generated tree in every diff | it can disagree with `src/`, and the hygiene of the repository would rest on remembering to rebuild |
| Ship the TypeScript and a loader flag | nothing to build | Node refuses to strip types under `node_modules` whatever the flag; it would need a runtime dependency that compiles on start |
| Publish a second package for the command | a second release train | one version already names the model, the specification and the command that implements them |

## Reversibility

Undo cost today: remove the `bin`, the two scripts and one test, an hour.
Becomes costly once application repositories pin the package for its command:
they would each need another way to run it.

## Consequences

- `package.json` gains a `bin`, `dist/` in `files`, and the `build` script.
- The release, the release candidate and the package-contents job each build
  before they pack.
- The package-contents gate allows `dist/`, and only JavaScript under it, and
  refuses a pack that is missing a `bin` it names.
- A test builds and packs the repository, installs the tarball into an empty project
  with npm offline and its cache empty, and runs the installed command.
- The emitted JavaScript targets the Node the package's `engines` field
  names; nothing is down-levelled.
