// REQ-023 (docs/requirements.md): the metamodel's structure is committed, and
// both implementations are held to it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { typesOf } from "../../src/wire/project-intent/descriptor.ts";
import { DRAFT } from "../../src/wire/project-intent/json-schema.ts";
import {
  JSON_SCHEMA_PATH,
  canonicalJson,
  descriptor,
  projectIntentJsonSchema,
} from "../../src/index.ts";

const REPOSITORY = join(import.meta.dirname, "..", "..");
const read = (path: string): string =>
  readFileSync(join(REPOSITORY, path), "utf8");

describe("the descriptor", () => {
  it("equals the committed file, so a schema change without one fails", () => {
    expect(canonicalJson(descriptor())).toBe(
      read("spec/v1/examples/expected/descriptor.json"),
    );
  });

  it("names every class and vocabulary once, sorted", () => {
    const { classes, vocabularies } = descriptor();
    const names = classes.map(({ name }) => name);
    const literals = vocabularies.map(({ name }) => name);

    expect(names).toStrictEqual([...names].sort());
    expect(literals).toStrictEqual([...literals].sort());
    expect(new Set([...names, ...literals]).size).toBe(
      names.length + literals.length,
    );
  });

  it("carries a union as the classes it stands for, and a map as a map", () => {
    const { classes } = descriptor();
    const process = classes.find(({ name }) => name === "Process");
    const feature = (name: string) =>
      process?.features.find((candidate) => candidate.name === name);

    expect(feature("probes")?.types).toStrictEqual(["NoProbes", "Probes"]);
    expect(feature("provides")).toStrictEqual({
      name: "provides",
      types: ["int"],
      required: false,
      many: false,
      map: true,
      reference: false,
      entry: "Surface",
    });
    expect(feature("secrets")).toStrictEqual({
      name: "secrets",
      types: ["DatabaseGrant", "KvGrant", "TransitGrant"],
      required: false,
      many: true,
      map: false,
      reference: false,
    });
  });

  it("records a name the model links as a reference to its target", () => {
    const { classes } = descriptor();
    const features = (owner: string) =>
      classes
        .find(({ name }) => name === owner)
        ?.features.filter(({ reference }) => reference)
        .map(({ name, types }) => [name, types]);

    expect(features("Route")).toStrictEqual([
      ["process", ["Process"]],
      ["surface", ["Surface"]],
    ]);
    expect(features("Scrape")).toStrictEqual([
      ["process", ["Process"]],
      ["surface", ["Surface"]],
    ]);
    expect(features("DependencyEdge")).toStrictEqual([]);
  });

  it("carries a class written as one word as that word", () => {
    expect(
      descriptor().classes.find(({ name }) => name === "NoProbes"),
    ).toStrictEqual({
      name: "NoProbes",
      features: [],
      scalar: "none",
    });
  });

  it("lists every closed vocabulary the chapter names", () => {
    expect(
      descriptor().vocabularies.find(({ name }) => name === "AlertClass"),
    ).toStrictEqual({
      name: "AlertClass",
      literals: ["business-hours", "urgent", "page"],
    });
    expect(descriptor().vocabularies).toHaveLength(22);
  });
});

describe("a property's types", () => {
  it("reads a reference, a union and a primitive", () => {
    expect(typesOf({ $ref: "#/$defs/Exposure" })).toStrictEqual(["Exposure"]);
    expect(
      typesOf({ anyOf: [{ $ref: "#/$defs/B" }, { $ref: "#/$defs/A" }] }),
    ).toStrictEqual(["A", "B"]);
    expect(typesOf({ type: "integer" })).toStrictEqual(["int"]);
    expect(typesOf({ type: "boolean" })).toStrictEqual(["boolean"]);
  });

  it("refuses a type the descriptor has no name for", () => {
    expect(() => typesOf({ type: "null" })).toThrow(
      "null is not a type the descriptor names",
    );
  });
});

describe("the generated JSON Schema", () => {
  it("regenerates without a diff", () => {
    expect(projectIntentJsonSchema()).toBe(read(JSON_SCHEMA_PATH));
  });

  it("declares the draft it is written against, and is committed at that path", () => {
    expect(JSON_SCHEMA_PATH).toBe("spec/v1/schemas/project-intent.schema.json");
    expect(projectIntentJsonSchema().split("\n").slice(0, 2)).toStrictEqual([
      "{",
      `  "$schema": "${DRAFT}",`,
    ]);
  });

  it("is the input variant, so a document validates against what a human writes", () => {
    const schema = JSON.parse(projectIntentJsonSchema()) as {
      $defs: Record<string, { required?: string[] }>;
    };

    expect(schema.$defs["Process"]?.required).toStrictEqual([
      "name",
      "lifecycle",
      "image",
      "runtime",
      "placement",
      "cutover",
    ]);
  });
});
