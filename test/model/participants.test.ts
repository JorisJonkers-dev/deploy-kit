// REQ-050 (docs/requirements.md): the participants list is read into its
// model, and an override that does not say why is refused where it is missing
// (spec/v1/40-composition.md#participants).
import { describe, expect, it } from "vitest";
import { parseParticipants } from "../../src/application/parse-participants.ts";
import { DEFAULT_MAX_AGE } from "../../src/model/participants.ts";

const refusalsOf = (text: string) => {
  const result = parseParticipants(text);
  return result.ok
    ? []
    : result.diagnostics.map(
        ({ code, path, message }) => `${code} ${path} ${message}`,
      );
};

describe("the participants list", () => {
  it("reads an entry that says nothing, one with its own age and one that is dormant", () => {
    const result = parseParticipants(
      [
        "participants:",
        "  notes: {}",
        "  media: { maxAge: 21d, reason: releases batch fortnightly }",
        "  observability: { dormant: true, owner: joris, reason: stable, reviewBy: 2026-11-30 }",
        "",
      ].join("\n"),
    );

    expect(result.ok && result.value.participants).toStrictEqual({
      notes: {},
      media: { maxAge: "21d", reason: "releases batch fortnightly" },
      observability: {
        dormant: true,
        owner: "joris",
        reason: "stable",
        reviewBy: "2026-11-30",
      },
    });
    expect(DEFAULT_MAX_AGE).toBe("7d");
  });

  it("refuses an age other than the default that does not say why", () => {
    expect(
      refusalsOf("participants:\n  media: { maxAge: 21d }\n"),
    ).toStrictEqual([
      "schema /participants/media/reason a maxAge other than the default says why",
    ]);
  });

  it("refuses a dormant participant that names no owner, no reason or no review date, each where it is missing", () => {
    expect(
      refusalsOf("participants:\n  observability: { dormant: true }\n"),
    ).toStrictEqual([
      "schema /participants/observability/owner a dormant participant names its owner",
      "schema /participants/observability/reason a dormant participant names its reason",
      "schema /participants/observability/reviewBy a dormant participant names its reviewBy",
    ]);
  });

  it("refuses an age that is not whole days, a review date that is not a day, and a file that is not YAML", () => {
    expect(
      refusalsOf("participants:\n  media: { maxAge: 3w, reason: slow }\n"),
    ).toHaveLength(1);
    expect(
      refusalsOf(
        "participants:\n  media: { dormant: true, owner: j, reason: r, reviewBy: soon }\n",
      ),
    ).toHaveLength(1);
    expect(refusalsOf("participants: [")).toHaveLength(1);
  });

  it("says which chapter the list is held to", () => {
    const result = parseParticipants(
      "participants:\n  notes: { colour: blue }\n",
    );

    expect(result.ok ? "" : JSON.stringify(result.diagnostics)).toContain(
      "spec/v1/40-composition.md",
    );
  });
});
