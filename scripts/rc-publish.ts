// Publish a release candidate from every pull request (issue #34): a job
// that gates nothing, wired into `.github/workflows/ci.yml` as
// `release-candidate`, run only on `pull_request`. Opening or updating a
// pull request from a branch of this repository publishes
// `<next patch>-rc.<pull request>.<run>` under the `rc` dist-tag; a pull
// request from a fork, Dependabot or Renovate publishes nothing, decided by
// scripts/lib/rc-version.ts's `eligibility`.
//
// Until the compiler exists the package ships `docs/adr` and `spec` only
// (package.json's `files`, checked by scripts/check-package-contents.ts), so
// a release candidate carries exactly what a real release would.
//
// scripts/lib/rc-version.ts computes the version and the eligibility
// decision, both pure; this file is the collecting (the workflow's own
// event context, passed in as environment variables the way
// scripts/check-pr-title.ts's PR_TITLE and PR_BODY already are) and the
// doing (editing a *copy* of package.json's version field for this run only,
// and shelling out to `npm publish`, injectable the way every other gate
// that starts an external command is).
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.ts";
import { processOutput, type GateOutput } from "./lib/output.ts";
import {
  eligibility,
  rcVersion,
  type EligibilityInput,
} from "./lib/rc-version.ts";

const REPOSITORY = join(import.meta.dirname, "..");

export interface Config {
  readonly root: string;
  readonly packageName: string;
  readonly baseVersion: string;
  readonly pr: number;
  readonly run: number;
  readonly eligibility: EligibilityInput;
  readonly dryRun: boolean;
  readonly npmBin: string;
  readonly summaryPath?: string | undefined;
}

/** `root`'s package.json name and version, the two fields this script reads. */
export function readPackageVersion(root: string): {
  name: string;
  version: string;
} {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    name: string;
    version: string;
  };
  return { name: pkg.name, version: pkg.version };
}

/**
 * Set `root`'s package.json `version` field to `version` in place. Never
 * committed: the workflow's checkout is thrown away at the end of the job,
 * the same way `npm version` would edit it, but without also trying to
 * create a git tag or commit.
 */
export function writePackageVersion(root: string, version: string): void {
  const path = join(root, "package.json");
  const pkg = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  pkg.version = version;
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
}

export interface PublishResult {
  readonly ran: boolean;
  readonly failed: boolean;
  readonly version: string | null;
  readonly reason: string;
  readonly command: readonly string[] | null;
}

/**
 * Compute the version, and either publish it or say why not, for `config`.
 * A skip (ineligible pull request) is success: `ran: false`, exit 0. An
 * attempt that fails is the one case worth failing the job for, since
 * nothing else caught it.
 */
export function publish(
  config: Config,
  output: GateOutput = processOutput,
): PublishResult {
  const decision = eligibility(config.eligibility);
  if (!decision.eligible) {
    output.out(`rc publish: SKIPPED, ${decision.reason}\n`);
    return {
      ran: false,
      failed: false,
      version: null,
      reason: decision.reason,
      command: null,
    };
  }

  const version = rcVersion(config.baseVersion, config.pr, config.run);
  writePackageVersion(config.root, version);

  // --provenance matches the real release publish in
  // .github/workflows/release.yml, so a release candidate carries the same
  // attestation a real release does.
  const args = config.dryRun
    ? ["publish", "--tag", "rc", "--provenance", "--dry-run"]
    : ["publish", "--tag", "rc", "--provenance"];
  const command = [config.npmBin, ...args];
  const installCommand = `npm install ${config.packageName}@rc`;
  const summary =
    `rc publish: version ${version}\n` +
    `command: ${command.join(" ")}\n` +
    `install: ${installCommand}\n`;

  if (config.summaryPath) {
    try {
      appendFileSync(config.summaryPath, summary);
    } catch {
      // The workflow summary is a nicety; its own file being unwritable
      // never stops the publish it is describing.
    }
  }

  const run = spawnSync(config.npmBin, args, {
    cwd: config.root,
    encoding: "utf8",
  });
  if (run.error) {
    output.err(
      `rc publish: could not run ${config.npmBin}: ${run.error.message}\n`,
    );
    return {
      ran: true,
      failed: true,
      version,
      reason: "could not start npm",
      command,
    };
  }
  output.out(summary);
  output.out(run.stdout);
  if (run.status !== 0) {
    output.err(`rc publish: ${command.join(" ")} failed:\n${run.stderr}\n`);
    return {
      ran: true,
      failed: true,
      version,
      reason: "npm publish failed",
      command,
    };
  }
  return {
    ran: true,
    failed: false,
    version,
    reason: decision.reason,
    command,
  };
}

/**
 * Build a {@link Config} from the environment the workflow sets (its own
 * event context, passed as plain strings) and run {@link publish}. `--dry-run`
 * on the command line, or `RC_DRY_RUN=1`, forces a dry run regardless of what
 * the environment otherwise says.
 */
export function main(
  env: NodeJS.ProcessEnv = process.env,
  argv: readonly string[] = process.argv.slice(2),
  output: GateOutput = processOutput,
): number {
  try {
    const root = env.RC_PUBLISH_ROOT ?? REPOSITORY;
    if (!existsSync(join(root, "package.json")))
      throw new Error(`no package.json under ${root}`);
    const pkg = readPackageVersion(root);

    const config: Config = {
      root,
      packageName: pkg.name,
      baseVersion: pkg.version,
      pr: Number(env.RC_PR_NUMBER ?? "0"),
      run: Number(env.GITHUB_RUN_NUMBER ?? "0"),
      eligibility: {
        eventName: env.RC_EVENT_NAME ?? env.GITHUB_EVENT_NAME ?? "",
        isFork: env.RC_IS_FORK === "true",
        actor: env.RC_ACTOR ?? env.GITHUB_ACTOR ?? "",
      },
      dryRun: argv.includes("--dry-run") || env.RC_DRY_RUN === "1",
      npmBin: env.NPM_BIN ?? "npm",
      summaryPath: env.GITHUB_STEP_SUMMARY,
    };

    const result = publish(config, output);
    return result.failed ? 1 : 0;
  } catch (error) {
    output.err(`rc publish: ${(error as Error).message}\n`);
    return 1;
  }
}

if (isEntrypoint(import.meta.url, process.argv[1])) process.exitCode = main();
