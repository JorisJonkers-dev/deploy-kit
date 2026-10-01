// The one serializer (docs/architecture.md#serialization): typed objects in,
// bytes out. It owns key order, indentation and the one header line, so a
// Deliverable's bytes are one module's responsibility and an adapter asserts a
// field rather than whitespace. A `.json` Deliverable is one document Vault
// reads, which carries no comment and so no header.
import { stringify } from "yaml";
import type { RenderedObject } from "../objects/deliverable.ts";

/** The one line of commentary a rendered file carries. */
export const HEADER = "# GENERATED. Never hand-edit.\n";

/** Every object of one Deliverable, each its own YAML document, in the order handed. */
export const serializeYaml = (objects: readonly RenderedObject[]): string =>
  HEADER +
  objects
    .map(
      (object) =>
        `---\n${stringify(object, { aliasDuplicateObjects: false, lineWidth: 0 })}`,
    )
    .join("");

/** The one document of a JSON Deliverable, two-space indented, newline-terminated. */
export const serializeJson = (objects: readonly RenderedObject[]): string =>
  `${JSON.stringify(objects[0], null, 2)}\n`;

/** A Deliverable's bytes, in the format its path names. */
export const serialize = (
  objects: readonly RenderedObject[],
  path: string,
): string =>
  path.endsWith(".json") ? serializeJson(objects) : serializeYaml(objects);
