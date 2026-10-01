// RULE-074 (docs/architecture-rules.md): every failure the compiler throws is
// an InternalFailure of a named kind, never a bare error.
import { describe, expect, it } from "vitest";
import {
  InternalFailure,
  brokenInvariant,
  notChecked,
  notSupported,
} from "../../src/model/internal-failure.ts";
import { canonicalJson } from "../../src/index.ts";

describe("an internal failure", () => {
  it.each([
    [notSupported, "unsupported"],
    [notChecked, "unchecked"],
    [brokenInvariant, "invariant"],
  ] as const)("%o carries the kind %s and its own message", (make, kind) => {
    const failure = make("what went wrong");

    expect(failure).toBeInstanceOf(InternalFailure);
    expect(failure).toBeInstanceOf(Error);
    expect(failure.kind).toBe(kind);
    expect(failure.message).toBe("what went wrong");
  });

  it("is what the compiler throws for a state its invariants rule out", () => {
    expect(() => canonicalJson({ a: null })).toThrow(
      expect.objectContaining({ kind: "invariant" }),
    );
  });
});
