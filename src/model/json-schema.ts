// The JSON Schema an editor completes a project file against, generated from
// the input variant of the wire schema: a field with a platform default is
// optional in the file a human writes and required only after validation
// (docs/architecture.md#the-wire-boundary). The generated file is committed and
// checked for a diff
// (docs/adr/architecture/0068-two-implementations-meet-at-the-parity-table.md).
//
// The documents the toolkit writes rather than reads are published the same
// way, as the output variant: what a consumer outside this repository, such as
// a Go service generating its types, receives.
import { z } from "zod";
import { clusterState } from "./cluster-state.ts";
import { compositionLock } from "./composition-lock.ts";
import { participants } from "./participants.ts";
import { pinAnnotations } from "./pin-annotations.ts";
import { platformIntent } from "./platform-intent.ts";
import { projectIntent } from "./project-intent.ts";
import {
  resolvedApplicationDocument,
  resolvedDeployment,
} from "./resolved-deployment.ts";

/** The committed schema's path, relative to the repository root. */
export const JSON_SCHEMA_PATH = "spec/v1/schemas/project-intent.schema.json";

/** The committed Platform document schema's path, relative to the repository root. */
export const PLATFORM_JSON_SCHEMA_PATH =
  "spec/v1/schemas/platform-intent.schema.json";

/** The draft the generated schema declares itself to be. */
export const DRAFT = "https://json-schema.org/draft/2020-12/schema";

function generated(document: z.ZodType): string {
  // Stryker disable next-line all: no field has a platform default yet, so the
  // input and output variants are the same document and no test can tell them
  // apart. The option stays, because the first default makes them differ.
  const schema = z.toJSONSchema(document, { io: "input" });
  return `${JSON.stringify({ $schema: DRAFT, ...schema }, undefined, 2)}\n`;
}

/** A document the toolkit writes, and the path its committed schema lives at. */
interface Published {
  readonly path: string;
  readonly document: z.ZodType;
}

/** Every schema of a document the toolkit writes, in the order the package lists them. */
export const PUBLISHED_SCHEMAS: readonly Published[] = [
  {
    path: "spec/v1/schemas/resolved-deployment.schema.json",
    document: resolvedDeployment,
  },
  {
    path: "spec/v1/schemas/resolved-application.schema.json",
    document: resolvedApplicationDocument,
  },
  {
    path: "spec/v1/schemas/composition-lock.schema.json",
    document: compositionLock,
  },
  {
    path: "spec/v1/schemas/pin-annotations.schema.json",
    document: pinAnnotations,
  },
  {
    path: "spec/v1/schemas/cluster-state-snapshot.schema.json",
    document: clusterState,
  },
  {
    path: "spec/v1/schemas/participants.schema.json",
    document: participants,
  },
];

/** The JSON Schema of a document the toolkit writes, as text. */
export function publishedJsonSchema({ document }: Published): string {
  // zod's default variant is the output one, which is what a consumer reads.
  const schema = z.toJSONSchema(document);
  return `${JSON.stringify({ $schema: DRAFT, ...schema }, undefined, 2)}\n`;
}

/** The JSON Schema of an authored Project Intent document, as text. */
export function projectIntentJsonSchema(): string {
  return generated(projectIntent);
}

/** The JSON Schema of the authored Platform document, as text. */
export function platformIntentJsonSchema(): string {
  return generated(platformIntent);
}
