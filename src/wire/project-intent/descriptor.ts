// The descriptor the parity contract fixes: every class of the source
// metamodel with its features, and every closed vocabulary with its literals
// (docs/architecture.md#the-parity-contract). It is built from the Zod schemas
// through Zod's own JSON Schema, and normalised into the contract's shape,
// which is neither format's.
import { z } from "zod";
import { projectIntent } from "./schema.ts";

export interface DescriptorFeature {
  readonly name: string;
  readonly types: readonly string[];
  readonly required: boolean;
  readonly many: boolean;
  readonly map: boolean;
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
  if (node["type"] === "array")
    return {
      name,
      types: typesOf(node["items"] as Node),
      required,
      many: true,
      map: false,
    };
  if (node["type"] === "object")
    return {
      name,
      types: typesOf(node["additionalProperties"] as Node),
      required,
      many: false,
      map: true,
    };
  return { name, types: typesOf(node), required, many: false, map: false };
}

/** The descriptor of the Project Intent metamodel, as the wire schemas declare it. */
export function descriptor(): Descriptor {
  const schema = z.toJSONSchema(projectIntent, { io: "input" }) as Node;
  const definitions = schema["$defs"] as Record<string, Node>;
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
