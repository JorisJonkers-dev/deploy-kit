// What a schema refusal reports (spec/v1/10-project-intent.md#what-a-schema-refusal-reports),
// on the issues zod raises for one value: a value that breaks more than one
// constraint is reported once, at its own pointer.
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { schemaDiagnostics } from "../../src/read/schema-diagnostics.ts";

describe("schemaDiagnostics", () => {
  it("reports a value that breaks two constraints once, with the first thing it breaks", () => {
    const parsed = z
      .strictObject({ name: z.string().min(3).regex(/^a/) })
      .safeParse({ name: "b" });
    if (parsed.success) throw new Error("expected a refusal");

    expect(parsed.error.issues).toHaveLength(2);
    expect(schemaDiagnostics(parsed.error, "chapter.md")).toStrictEqual([
      {
        code: "schema",
        path: "/name",
        message: parsed.error.issues[0]?.message,
        hint: "Correct the field against chapter.md.",
      },
    ]);
  });

  it("escapes an unknown field's name into its pointer", () => {
    const parsed = z.strictObject({}).safeParse({ "a/b~c": 1 });
    if (parsed.success) throw new Error("expected a refusal");

    expect(
      schemaDiagnostics(parsed.error, "chapter.md").map(({ path }) => path),
    ).toStrictEqual(["/a~1b~0c"]);
  });
});
