// REQ-043 (docs/requirements.md): a file the reader refuses, outside the YAML
// subset or against the schema, is refused with the code `schema` at the JSON
// Pointers its committed diagnostics oracle names
// (spec/v1/10-project-intent.md#reading-a-file).
//
// These oracles bind the production implementation only
// (docs/architecture.md#the-parity-contract): the model-driven implementation's
// front end is a grammar, which refuses a token rather than naming the field.
// So the test sits outside test/model/, whose rows each need a witness there.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  checkIntentSet,
  type AuthoredFile,
} from "../src/index.ts";

const CASES = join(
  import.meta.dirname,
  "..",
  "spec",
  "v1",
  "examples",
  "schema-refusals",
);

const isDirectory = (name: string): boolean =>
  statSync(join(CASES, name), { throwIfNoEntry: false })?.isDirectory() ===
  true;

/** A case is one project file, or a directory of documents read together. */
const cases = readdirSync(CASES)
  .filter((name) => name.endsWith(".project.yml") || isDirectory(name))
  .map((name) => name.replace(".project.yml", ""))
  .sort();

const filesOf = (stem: string): AuthoredFile[] =>
  isDirectory(stem)
    ? readdirSync(join(CASES, stem), { recursive: true, encoding: "utf8" })
        .filter((name) => statSync(join(CASES, stem, name)).isFile())
        .map((name) => ({
          name: name.split(sep).join("/"),
          text: readFileSync(join(CASES, stem, name), "utf8"),
        }))
    : [
        {
          name: `${stem}.project.yml`,
          text: readFileSync(join(CASES, `${stem}.project.yml`), "utf8"),
        },
      ];

describe("the schema refusal fixtures", () => {
  it("cover every kind of refusal the reading chapter names", () => {
    expect(cases).toStrictEqual([
      "alert-class-unknown",
      "every-offending-value",
      "missing-field",
      "no-shape-matches",
      "outside-yaml-subset",
      "platform-unknown-field",
      "two-documents",
      "unknown-field",
      "wrong-type",
    ]);
  });

  it.each(cases)(
    "%s is refused with the code schema at the pointers its oracle names",
    (stem) => {
      const result = checkIntentSet(filesOf(stem));
      const entries = result.ok
        ? []
        : result.diagnostics
            .map(({ code, document, path }) => ({ code, document, path }))
            .sort((a, b) =>
              `${a.code}${String(a.document)}${a.path}` <
              `${b.code}${String(b.document)}${b.path}`
                ? -1
                : 1,
            );

      expect(canonicalJson(entries)).toBe(
        readFileSync(join(CASES, `${stem}.diagnostics.json`), "utf8"),
      );
    },
  );
});
