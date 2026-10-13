// What composition keeps of a committed pin source
// (spec/v1/55-delivery.md#what-a-pin-source-holds).
import { describe, expect, it } from "vitest";
import { readPinSource, samePinSource } from "../../src/read/pin-source.ts";

const DIGEST = `sha256:${"a".repeat(64)}`;
const repository = `kind: OCIRepository\nspec:\n  ref:\n    digest: ${DIGEST}\n`;
const unit = (spec: string): string => `kind: Kustomization\nspec:\n${spec}`;

describe("readPinSource", () => {
  it("reads the digest the source pins, and that a unit with no patch recreates nothing", () => {
    expect(
      readPinSource([repository, unit("  path: ./apps/notes\n")].join("---\n")),
    ).toStrictEqual({
      digest: DIGEST,
      recreates: false,
      units: [{ kind: "Kustomization", spec: { path: "./apps/notes" } }],
    });
    expect(readPinSource(repository)).toStrictEqual({
      digest: DIGEST,
      recreates: false,
      units: [],
    });
  });

  it("reads a first delivery's from any unit that carries a patch", () => {
    expect(
      readPinSource(
        [
          repository,
          unit("  path: ./a\n"),
          unit("  path: ./b\n  patches: []\n"),
        ].join("---\n"),
      ),
    ).toStrictEqual({
      digest: DIGEST,
      recreates: true,
      units: [
        { kind: "Kustomization", spec: { path: "./a" } },
        { kind: "Kustomization", spec: { path: "./b", patches: [] } },
      ],
    });
  });

  it("reads no recreation from a patch on anything that is not a unit", () => {
    expect(
      readPinSource(
        `kind: OCIRepository\nspec:\n  patches: []\n  ref:\n    digest: ${DIGEST}\n`,
      ),
    ).toStrictEqual({ digest: DIGEST, recreates: false, units: [] });
  });

  it.each([
    ["an empty file", ""],
    ["a document that is no mapping", "- a\n- b\n"],
    ["a null document", "---\n---\n"],
    ["a source with no reference", "kind: OCIRepository\nspec: {}\n"],
    ["a source with no spec", "kind: OCIRepository\n"],
    [
      "a digest that is no text",
      "kind: OCIRepository\nspec:\n  ref:\n    digest: 12\n",
    ],
    [
      "a digest on another kind",
      `kind: Kustomization\nspec:\n  ref:\n    digest: ${DIGEST}\n`,
    ],
  ])("reads no pin from %s", (_what, text) => {
    expect(readPinSource(text)).toBeUndefined();
  });
});

describe("samePinSource", () => {
  const source = [
    repository,
    unit("  path: ./apps/notes\n  interval: 10m\n"),
  ].join("---\n");

  it.each([
    ["itself", source],
    ["a comment", `# GENERATED. Never hand-edit.\n${source}# a note\n`],
    [
      "a quoted string",
      source
        .replace("interval: 10m", 'interval: "10m"')
        .replace(DIGEST, `'${DIGEST}'`),
    ],
    [
      "its keys in another order",
      source.replace(
        "  path: ./apps/notes\n  interval: 10m\n",
        "  interval: 10m\n  path: ./apps/notes\n",
      ),
    ],
    [
      "a mapping written in flow style",
      source.replace(
        `  ref:\n    digest: ${DIGEST}\n`,
        `  ref: { digest: ${DIGEST} }\n`,
      ),
    ],
    ["a leading document marker", `---\n${source}`],
  ])("holds a source and %s as the same", (_how, written) => {
    expect(written === source).toBe(_how === "itself");
    expect(samePinSource(source, written)).toBe(true);
    expect(samePinSource(written, source)).toBe(true);
  });

  it("reads a time a Pause wrote quoted as the text composition writes bare", () => {
    const paused = (at: string): string =>
      `kind: OCIRepository\nmetadata:\n  annotations:\n    paused-at: ${at}\nspec:\n  ref:\n    digest: ${DIGEST}\n`;

    expect(
      samePinSource(
        paused("2026-10-13T07:34:26Z"),
        paused('"2026-10-13T07:34:26Z"'),
      ),
    ).toBe(true);
    expect(
      samePinSource(
        paused("2026-10-13T07:34:26Z"),
        paused("2026-10-13T07:34:27Z"),
      ),
    ).toBe(false);
  });

  it.each([
    ["another value", source.replace("./apps/notes", "./apps/other")],
    [
      "a value of another type",
      source.replace("interval: 10m", "interval: 10"),
    ],
    ["a field more", `${source}  prune: true\n`],
    ["a field fewer", source.replace("  interval: 10m\n", "")],
    ["a unit more", [source, unit("  path: ./b\n")].join("---\n")],
    ["a unit fewer", repository],
    [
      "its documents in another order",
      [unit("  path: ./apps/notes\n  interval: 10m\n"), repository].join(
        "---\n",
      ),
    ],
    ["nothing", ""],
  ])("holds a source and one with %s as different", (_what, written) => {
    expect(samePinSource(source, written)).toBe(false);
    expect(samePinSource(written, source)).toBe(false);
  });
});
