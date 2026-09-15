// The release candidate version string and eligibility rule (issue #34).
//
// REQ-027 (docs/requirements.md): a pull request's release candidate
// version sorts above the current release and below any version
// release-please could choose next.
import { describe, expect, it } from "vitest";
import {
  compareSemver,
  eligibility,
  nextPatch,
  rcVersion,
} from "../scripts/lib/rc-version.ts";

describe("nextPatch", () => {
  it("increments the patch component", () => {
    expect(nextPatch("0.2.0")).toBe("0.2.1");
    expect(nextPatch("1.9.9")).toBe("1.9.10");
  });

  it("throws for anything that is not a plain major.minor.patch", () => {
    expect(() => nextPatch("0.2.0-rc.1")).toThrow(/is not a plain/);
    expect(() => nextPatch("v1.0.0")).toThrow(/is not a plain/);
    expect(() => nextPatch("")).toThrow(/is not a plain/);
  });
});

describe("rcVersion", () => {
  it("is the next patch, prerelease-tagged with the pull request and run", () => {
    expect(rcVersion("0.2.0", 34, 17)).toBe("0.2.1-rc.34.17");
  });

  it("sorts above the current release, whatever the next real bump turns out to be", () => {
    // Semver compares major.minor.patch before any prerelease tag, so a
    // higher patch always outranks the same-or-lower release regardless of
    // the suffix.
    const candidate = rcVersion("0.2.0", 1, 1);
    expect(compareSemver(candidate, "0.2.0")).toBeGreaterThan(0);
  });

  it("sorts below the next patch release itself: a prerelease of X is always < X", () => {
    expect(compareSemver("0.2.1-rc.34.17", "0.2.1")).toBeLessThan(0);
  });

  it("sorts below a minor or major bump too, since those are >= the next patch", () => {
    expect(compareSemver("0.2.1-rc.34.17", "0.3.0")).toBeLessThan(0);
    expect(compareSemver("0.2.1-rc.34.17", "1.0.0")).toBeLessThan(0);
  });
});

describe("compareSemver", () => {
  it("compares major, minor and patch numerically, not lexicographically", () => {
    expect(compareSemver("0.2.9", "0.2.10")).toBeLessThan(0);
    expect(compareSemver("0.10.0", "0.9.0")).toBeGreaterThan(0);
  });

  it("is zero for two identical versions", () => {
    expect(compareSemver("0.2.1-rc.34.17", "0.2.1-rc.34.17")).toBe(0);
  });

  it("orders two prereleases of the same core version by their numeric identifiers", () => {
    expect(compareSemver("0.2.1-rc.34.2", "0.2.1-rc.34.10")).toBeLessThan(0);
  });

  it("treats a numeric identifier as lower than an alphanumeric one at the same position", () => {
    expect(compareSemver("0.2.1-rc.1", "0.2.1-rc.a")).toBeLessThan(0);
    expect(compareSemver("0.2.1-rc.a", "0.2.1-rc.1")).toBeGreaterThan(0);
  });

  it("orders two alphanumeric identifiers lexicographically", () => {
    expect(compareSemver("0.2.1-alpha", "0.2.1-beta")).toBeLessThan(0);
    expect(compareSemver("0.2.1-beta", "0.2.1-alpha")).toBeGreaterThan(0);
  });

  it("orders same-numbered prereleases with a shorter identifier list first", () => {
    expect(compareSemver("0.2.1-rc.34", "0.2.1-rc.34.1")).toBeLessThan(0);
    expect(compareSemver("0.2.1-rc.34.1", "0.2.1-rc.34")).toBeGreaterThan(0);
  });

  it("is zero for two identical plain releases with no prerelease at all", () => {
    expect(compareSemver("0.2.0", "0.2.0")).toBe(0);
  });

  it("ranks a plain release above its own prerelease, in either position", () => {
    expect(compareSemver("0.2.1-rc.1", "0.2.1")).toBeLessThan(0);
    expect(compareSemver("0.2.1", "0.2.1-rc.1")).toBeGreaterThan(0);
  });

  it("throws for a version outside major.minor.patch(-prerelease)", () => {
    expect(() => compareSemver("not-a-version", "0.2.0")).toThrow(
      /is not a semver/,
    );
  });
});

describe("eligibility", () => {
  it("is eligible for a pull request from a branch of this repository", () => {
    const result = eligibility({
      eventName: "pull_request",
      isFork: false,
      actor: "a-teammate",
    });
    expect(result.eligible).toBe(true);
  });

  it("is ineligible for anything but a pull_request event", () => {
    const result = eligibility({
      eventName: "push",
      isFork: false,
      actor: "a-teammate",
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/not a pull request event/);
  });

  it("is ineligible for a fork, since its token cannot publish for real", () => {
    const result = eligibility({
      eventName: "pull_request",
      isFork: true,
      actor: "a-teammate",
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/fork/);
  });

  it("is ineligible for Dependabot", () => {
    const result = eligibility({
      eventName: "pull_request",
      isFork: false,
      actor: "dependabot[bot]",
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/dependabot\[bot\]/);
  });

  it("is ineligible for Renovate", () => {
    const result = eligibility({
      eventName: "pull_request",
      isFork: false,
      actor: "renovate[bot]",
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/renovate\[bot\]/);
  });

  it("checks the fork condition before the actor, so a bot's own fork PR reads as a fork", () => {
    const result = eligibility({
      eventName: "pull_request",
      isFork: true,
      actor: "dependabot[bot]",
    });
    expect(result.reason).toMatch(/fork/);
  });
});
