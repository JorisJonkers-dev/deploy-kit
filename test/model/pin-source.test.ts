// What composition keeps of a committed pin source
// (spec/v1/55-delivery.md#what-a-pin-source-holds).
import { describe, expect, it } from "vitest";
import { readPinSource } from "../../src/read/pin-source.ts";

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
