// The release candidate version string and the eligibility rule for issue
// #34: opening or updating a pull request from a branch of this repository
// publishes `<next patch>-rc.<pull request>.<run>` under the `rc` dist-tag.
//
// The version is the next patch release, not the current one, with a
// prerelease identifier appended. A prerelease of X always sorts below X
// itself in semver, and the next patch is always less than or equal to
// whatever release-please chooses next (a patch, a minor or a major bump all
// carry a version at least as high as the next patch): so this one string
// satisfies both halves of the acceptance criterion (above the current
// release, below anything release-please could choose) without knowing
// which kind of bump is coming.

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

/** `version`'s major.minor.(patch + 1), as a plain `X.Y.Z` string. */
export function nextPatch(version: string): string {
  const match = SEMVER.exec(version);
  if (!match)
    throw new Error(`"${version}" is not a plain major.minor.patch version`);
  const [, major, minor, patch] = match;
  return `${major as string}.${minor as string}.${String(Number(patch) + 1)}`;
}

/** The `rc` version to publish for pull request `pr`, run `run`, from release `baseVersion`. */
export function rcVersion(
  baseVersion: string,
  pr: number,
  run: number,
): string {
  return `${nextPatch(baseVersion)}-rc.${String(pr)}.${String(run)}`;
}

interface ParsedVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly string[];
}

function parseVersion(version: string): ParsedVersion {
  const [core, ...preParts] = version.split("-");
  const match = SEMVER.exec(core as string);
  if (!match)
    throw new Error(`"${version}" is not a semver this comparator reads`);
  const [, major, minor, patch] = match;
  const pre = preParts.join("-");
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: pre === "" ? [] : pre.split("."),
  };
}

/**
 * -1, 0 or 1 as `a` sorts below, level with, or above `b`, by semver
 * precedence: major, minor, patch, then prerelease (a version with no
 * prerelease outranks the same core version with one, per the semver spec's
 * own rule, which is what makes a release candidate sort below the release
 * it previews).
 */
export function compareSemver(a: string, b: string): number {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (const field of ["major", "minor", "patch"] as const) {
    if (left[field] !== right[field]) return left[field] - right[field];
  }
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;

  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    const leftNumber = Number(leftPart);
    const rightNumber = Number(rightPart);
    const leftIsNumeric = leftPart !== "" && !Number.isNaN(leftNumber);
    const rightIsNumeric = rightPart !== "" && !Number.isNaN(rightNumber);
    if (leftIsNumeric && rightIsNumeric) {
      if (leftNumber !== rightNumber) return leftNumber - rightNumber;
    } else if (leftIsNumeric !== rightIsNumeric) {
      return leftIsNumeric ? -1 : 1;
    } else if (leftPart !== rightPart) {
      return leftPart < rightPart ? -1 : 1;
    }
  }
  return 0;
}

export interface EligibilityInput {
  readonly eventName: string;
  readonly isFork: boolean;
  readonly actor: string;
}

export interface Eligibility {
  readonly eligible: boolean;
  readonly reason: string;
}

const BOT_ACTORS = /dependabot|renovate/i;

/**
 * Whether `input` describes a pull request this repository should publish a
 * release candidate for. A fork's `GITHUB_TOKEN` cannot publish for real
 * even when this says yes (GitHub downgrades it to read-only), so the
 * workflow's own `if:` also checks the fork condition; this is the one place
 * the *reason* for each answer is spelled out, for the workflow summary and
 * for the tests.
 */
export function eligibility(input: EligibilityInput): Eligibility {
  if (input.eventName !== "pull_request")
    return {
      eligible: false,
      reason: `not a pull request event ("${input.eventName}")`,
    };
  if (input.isFork)
    return {
      eligible: false,
      reason:
        "the pull request's head repository is a fork; secrets are unavailable there",
    };
  if (BOT_ACTORS.test(input.actor))
    return {
      eligible: false,
      reason: `opened by ${input.actor}, which publishes nothing by design`,
    };
  return {
    eligible: true,
    reason: "a pull request from a branch of this repository",
  };
}
