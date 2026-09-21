// The descriptor the parity contract fixes: every class of the source
// metamodel with its features, and every closed vocabulary with its literals
// (docs/architecture.md#the-parity-contract). It is built from the Zod schemas
// through Zod's own JSON Schema, and normalised into the contract's shape,
// which is neither format's.
import { z } from "zod";
import { platformIntent } from "../platform-intent/schema.ts";
import { envFile, projectIntent } from "./schema.ts";

export interface DescriptorFeature {
  readonly name: string;
  readonly types: readonly string[];
  readonly required: boolean;
  readonly many: boolean;
  readonly map: boolean;
  /** Whether the value links to a model element rather than holding one. */
  readonly reference: boolean;
  /** The name of what one entry of a map is, where the feature is a map. */
  readonly entry?: string;
}

export interface DescriptorClass {
  readonly name: string;
  readonly features: readonly DescriptorFeature[];
  readonly scalar?: string;
}

export interface DescriptorVocabulary {
  readonly name: string;
  readonly literals: readonly string[];
}

export interface Descriptor {
  readonly classes: readonly DescriptorClass[];
  readonly vocabularies: readonly DescriptorVocabulary[];
}

type Node = Record<string, unknown>;

const PRIMITIVES = new Map([
  ["string", "string"],
  ["integer", "int"],
  ["boolean", "boolean"],
]);

/** The types a property admits, as class, vocabulary or primitive names. */
export function typesOf(node: Node): string[] {
  const named = node["$ref"];
  if (typeof named === "string")
    return [named.slice(named.lastIndexOf("/") + 1)];
  const union = node["anyOf"];
  if (Array.isArray(union))
    return union.flatMap((member) => typesOf(member as Node)).sort();
  const primitive = PRIMITIVES.get(String(node["type"]));
  if (primitive === undefined)
    throw new TypeError(
      `${String(node["type"])} is not a type the descriptor names`,
    );
  return [primitive];
}

function feature(
  name: string,
  node: Node,
  required: boolean,
): DescriptorFeature {
  const reference = node["reference"];
  if (typeof reference === "string")
    return {
      name,
      types: [reference],
      required,
      many: false,
      map: false,
      reference: true,
    };
  if (node["type"] === "array")
    return {
      name,
      types: typesOf(node["items"] as Node),
      required,
      many: true,
      map: false,
      reference: false,
    };
  if (node["type"] === "object")
    return {
      name,
      types: typesOf(node["additionalProperties"] as Node),
      required,
      many: false,
      map: true,
      reference: false,
      entry: String(node["entry"]),
    };
  return {
    name,
    types: typesOf(node),
    required,
    many: false,
    map: false,
    reference: false,
  };
}

/** The descriptor of the source metamodel, Project Intent and Platform Intent, as the wire schemas declare it. */
export function descriptor(): Descriptor {
  // Every authored artefact makes one source metamodel: a vocabulary two of them
  // use, such as Audience, is one definition under one name.
  const definitions = Object.assign(
    {},
    ...[projectIntent, platformIntent, envFile].map(
      (document) =>
        (z.toJSONSchema(document, { io: "input" }) as Node)["$defs"],
    ),
  ) as Record<string, Node>;
  const classes: DescriptorClass[] = [];
  const vocabularies: DescriptorVocabulary[] = [];

  for (const name of Object.keys(definitions).sort()) {
    const definition = definitions[name] as Node;
    const literals = definition["enum"];
    const constant = definition["const"];
    if (Array.isArray(literals)) {
      vocabularies.push({ name, literals: literals.map(String) });
    } else if (typeof constant === "string") {
      classes.push({ name, features: [], scalar: constant });
    } else {
      const properties = definition["properties"] as Record<string, Node>;
      const required = definition["required"] as string[] | undefined;
      classes.push({
        name,
        features: Object.keys(properties)
          .sort()
          .map((key) =>
            feature(
              key,
              properties[key] as Node,
              required?.includes(key) === true,
            ),
          ),
      });
    }
  }

  return { classes, vocabularies };
}
