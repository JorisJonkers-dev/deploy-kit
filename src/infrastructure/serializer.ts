// The one serializer (docs/architecture.md#serialization): typed objects in,
// bytes out. It owns key order, indentation and the one header line, so a
// Deliverable's bytes are one module's responsibility and an adapter asserts a
// field rather than whitespace. A `.json` Deliverable is one document Vault
// reads, which carries no comment and so no header.
import { stringify } from "yaml";
import type { RenderedObject } from "../objects/deliverable.ts";
import type { ConfigMap } from "../objects/kubernetes.ts";
import { canonicalJson } from "./canonical-json.ts";

/** The one line of commentary a rendered file carries. */
export const HEADER = "# GENERATED. Never hand-edit.\n";

/** A Vault document carries no `kind`; every Kubernetes object does. */
const isConfigMap = (object: RenderedObject): object is ConfigMap =>
  (object as { readonly kind?: unknown }).kind === "ConfigMap";

/**
 * An object as it is written: a JSON document a ConfigMap carries is its
 * canonical form (RFC 8785) on one line, so two renders of one value are the
 * same bytes whatever order the value's keys were built in. The line ends, as
 * a file's does, which also makes it a block in the YAML around it: no quoting
 * rule decides any of its bytes.
 */
const written = (object: RenderedObject): unknown =>
  isConfigMap(object)
    ? {
        ...object,
        data: Object.fromEntries(
          Object.entries(object.data).map(([key, value]) => [
            key,
            typeof value === "string"
              ? value
              : `${canonicalJson(value.json)}\n`,
          ]),
        ),
      }
    : object;

/** Every object of one Deliverable, each its own YAML document, in the order handed. */
export const serializeYaml = (objects: readonly RenderedObject[]): string =>
  HEADER +
  objects
    .map(
      (object) =>
        `---\n${stringify(written(object), { aliasDuplicateObjects: false, lineWidth: 0 })}`,
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
