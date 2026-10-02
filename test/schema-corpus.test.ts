// REQ-042 (docs/requirements.md): the committed JSON Schemas and the model give
// the same verdict on every case of the schema corpus. The committed schema,
// not the generator's byte output, is the contract another implementation is
// held to (docs/adr/architecture/0088-the-committed-schemas-and-their-corpus-are-the-contract.md):
// a different generator never writes the same bytes, but it must accept and
// refuse what this corpus says.
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import type { z } from "zod";
import { PUBLISHED_SCHEMAS } from "../src/index.ts";
import {
  JSON_SCHEMA_PATH,
  PLATFORM_JSON_SCHEMA_PATH,
} from "../src/model/json-schema.ts";
import { platformIntent } from "../src/model/platform-intent.ts";
import { projectIntent } from "../src/model/project-intent.ts";
import { patched, type PatchOperation } from "./support/json-patch.ts";

const SPEC = join(import.meta.dirname, "..", "spec", "v1");
const SCHEMAS = join(SPEC, "schemas");
const CORPUS = join(SCHEMAS, "corpus");

/** What a refused case breaks, so a corpus can be held to cover each kind. */
const BREAKS = [
  "unknown-field",
  "missing-required",
  "wrong-type",
  "enum",
  "union",
  "rule",
] as const;
type Break = (typeof BREAKS)[number];

interface Case {
  readonly name: string;
  readonly verdict: "accept" | "refuse";
  readonly breaks?: Break;
  readonly file?: string;
  readonly instance?: unknown;
  readonly case?: string;
  readonly patch?: readonly PatchOperation[];
}

interface Corpus {
  readonly schema: string;
  readonly cases: readonly Case[];
}

/** Whether a validator accepts a document. */
type Verdict = (document: unknown) => boolean;

/** The model each committed schema is generated from, by its file name. */
const MODELS: Readonly<Record<string, z.ZodType>> = Object.fromEntries(
  [
    { path: JSON_SCHEMA_PATH, document: projectIntent },
    { path: PLATFORM_JSON_SCHEMA_PATH, document: platformIntent },
    ...PUBLISHED_SCHEMAS,
  ].map(({ path, document }): [string, z.ZodType] => [
    basename(path),
    document,
  ]),
);

const corpora = (): Corpus[] =>
  readdirSync(CORPUS)
    .filter((name) => name.endsWith(".corpus.json"))
    .sort()
    .map(
      (name) => JSON.parse(readFileSync(join(CORPUS, name), "utf8")) as Corpus,
    );

/** A file a case reads, relative to spec/v1/: JSON, or the YAML an author writes. */
function readInstance(file: string): unknown {
  const text = readFileSync(join(SPEC, file), "utf8");
  return file.endsWith(".json") ? JSON.parse(text) : parse(text);
}

/** The document a case names: a file, an inline instance, or an earlier case, then its patch. */
function documentOf(corpus: Corpus, which: Case): unknown {
  let base: unknown;
  if (which.file !== undefined) base = readInstance(which.file);
  else if (which.case !== undefined) {
    const earlier = corpus.cases
      .slice(0, corpus.cases.indexOf(which))
      .find(({ name }) => name === which.case);
    if (earlier === undefined)
      throw new Error(`${which.name}: no earlier case named ${which.case}`);
    base = documentOf(corpus, earlier);
  } else base = which.instance;
  return patched(base, which.patch ?? []);
}

/**
 * Every case on which the schema or the model gives a verdict other than the
 * case's: the corpus says what both must do, so either one disagreeing fails.
 */
function disagreements(
  corpus: Corpus,
  schema: Verdict,
  model: Verdict,
): string[] {
  return corpus.cases.flatMap((which) => {
    const document = documentOf(corpus, which);
    const expected = which.verdict === "accept";
    return [
      ["the committed schema", schema(document)],
      ["the model", model(document)],
    ].flatMap(([who, verdict]) =>
      verdict === expected
        ? []
        : [
            `${corpus.schema}: ${String(who)} ${expected ? "refuses" : "accepts"} ${which.name}, which the corpus says to ${which.verdict}`,
          ],
    );
  });
}

/** The kinds of break a schema can express, from the keywords it carries. */
function expressible(schemaText: string): Break[] {
  return BREAKS.filter(
    (kind) =>
      ({
        "unknown-field": true,
        "missing-required": true,
        "wrong-type": true,
        enum: /"(enum|const)"/.test(schemaText),
        union: /"(anyOf|oneOf)"/.test(schemaText),
        rule: /"(if|dependentRequired)"/.test(schemaText),
      })[kind],
  );
}

const committedSchema = (name: string): Verdict => {
  const ajv = new Ajv2020({ strict: true, validateFormats: false });
  // The authored schemas name the model concept a string refers to, and the
  // one a map's keys are, for an editor: annotations a validator never applies.
  for (const keyword of ["reference", "entry"])
    ajv.addKeyword({ keyword, schemaType: "string" });
  const check = ajv.compile(
    JSON.parse(readFileSync(join(SCHEMAS, name), "utf8")) as object,
  );
  return (document) => check(document);
};

const modelOf = (name: string): Verdict => {
  const model = MODELS[name];
  if (model === undefined) throw new Error(`${name}: no model generates it`);
  return (document) => model.safeParse(document).success;
};

describe("the schema corpus", () => {
  it("has one corpus for every committed schema, and none for a schema that is not", () => {
    const schemas = readdirSync(SCHEMAS)
      .filter((name) => name.endsWith(".schema.json"))
      .sort();

    expect(corpora().map(({ schema }) => schema)).toStrictEqual(schemas);
    expect(Object.keys(MODELS).sort()).toStrictEqual(schemas);
  });

  it.each(corpora().map((corpus) => [corpus.schema, corpus]))(
    "%s: the committed schema and the model give every case its verdict",
    (schema, corpus) => {
      expect(
        disagreements(corpus, committedSchema(schema), modelOf(schema)),
      ).toStrictEqual([]);
    },
  );

  it.each(corpora().map((corpus) => [corpus.schema, corpus]))(
    "%s: accepts at least one case, and refuses one of every kind the schema can express",
    (schema, corpus) => {
      const refused = new Set(
        corpus.cases
          .filter(({ verdict }) => verdict === "refuse")
          .map(({ breaks }) => breaks),
      );

      expect(corpus.cases.some(({ verdict }) => verdict === "accept")).toBe(
        true,
      );
      expect(
        expressible(readFileSync(join(SCHEMAS, schema), "utf8")).filter(
          (kind) => !refused.has(kind),
        ),
      ).toStrictEqual([]);
    },
  );

  it("names each side that disagrees with the corpus", () => {
    const corpus: Corpus = {
      schema: "probe.schema.json",
      cases: [
        { name: "an empty object", verdict: "accept", instance: {} },
        {
          name: "a number",
          verdict: "refuse",
          breaks: "wrong-type",
          case: "an empty object",
          patch: [{ op: "add", path: "/n", value: 1 }],
        },
      ],
    };
    const accepts: Verdict = () => true;
    const objectsOnly: Verdict = (document) =>
      Object.keys(document as object).length === 0;

    expect(disagreements(corpus, accepts, objectsOnly)).toStrictEqual([
      "probe.schema.json: the committed schema accepts a number, which the corpus says to refuse",
    ]);
    expect(disagreements(corpus, objectsOnly, () => false)).toStrictEqual([
      "probe.schema.json: the model refuses an empty object, which the corpus says to accept",
    ]);
  });

  it("refuses a case that derives from itself or a later case", () => {
    const later = { name: "later", verdict: "accept", instance: {} } as const;
    const first: Case = { name: "first", verdict: "accept", case: "later" };
    const self: Case = { name: "self", verdict: "accept", case: "self" };
    const corpus: Corpus = {
      schema: "probe.schema.json",
      cases: [first, later, self],
    };

    expect(() => documentOf(corpus, first)).toThrow(
      "first: no earlier case named later",
    );
    expect(() => documentOf(corpus, self)).toThrow(
      "self: no earlier case named self",
    );
  });

  it("refuses a case that derives from no earlier case", () => {
    expect(() =>
      documentOf(
        { schema: "probe.schema.json", cases: [] },
        { name: "orphan", verdict: "accept", case: "missing" },
      ),
    ).toThrow("orphan: no earlier case named missing");
  });
});
