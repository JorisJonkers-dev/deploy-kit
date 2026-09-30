// The one serializer (docs/architecture.md#serialization): typed objects in,
// bytes out. It owns key order, indentation and the one header line, so a
// Deliverable's bytes are one module's responsibility and an adapter asserts a
// field rather than whitespace.
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
