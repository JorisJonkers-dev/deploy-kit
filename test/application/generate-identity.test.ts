// REQ-103 (docs/requirements.md), at the use-case seam: what the generator
// answers, by kind, before the CLI renders it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateIdentityFile } from "../../src/application/generate-identity.ts";

const IDENTITY = join(
  import.meta.dirname,
  "..",
  "..",
  "spec",
  "v1",
  "examples",
  "identity",
  "identity.project.yml",
);

describe("generateIdentityFile", () => {
  it("answers unwritable, with why, where nothing can be written", () => {
    expect(
      generateIdentityFile(
        [
          {
            name: "identity.project.yml",
            text: readFileSync(IDENTITY, "utf8"),
          },
        ],
        { language: "go", application: "grafana" },
      ),
    ).toStrictEqual({
      kind: "unwritable",
      message:
        "generate identity needs the Platform document, whose sign-in provider names the Principal contract version",
    });
  });
});
