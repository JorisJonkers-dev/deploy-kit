// A refusal's code is one of a closed set (src/model/diagnostic.ts): the
// specification's codes and `schema`. A code outside it fails the typecheck,
// which the expectation below proves: were the type open, the directive would
// be unused, and an unused directive fails `tsc` too.
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "../../src/model/diagnostic.ts";

describe("a refusal's code", () => {
  it("is refused by the typecheck when no chapter defines it", () => {
    const refusal: Diagnostic = {
      // @ts-expect-error a code no chapter defines is not a RefusalCode
      code: "not-a-code",
      path: "",
      message: "m",
      hint: "h",
    };

    expect(refusal.code).toBe("not-a-code");
  });
});
