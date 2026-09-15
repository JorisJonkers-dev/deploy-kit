// The JSON Schema an editor completes a project file against, generated from
// the input variant of the wire schema: a field with a platform default is
// optional in the file a human writes and required only after validation
// (docs/architecture.md#the-wire-boundary). The generated file is committed and
// checked for a diff (docs/adr/architecture/0119).
import { z } from "zod";
import { projectIntent } from "./schema.ts";

/** The committed schema's path, relative to the repository root. */
export const JSON_SCHEMA_PATH = "spec/v1/schemas/project-intent.schema.json";

/** The draft the generated schema declares itself to be. */
export const DRAFT = "https://json-schema.org/draft/2020-12/schema";

/** The JSON Schema of an authored Project Intent document, as text. */
export function projectIntentJsonSchema(): string {
  // Stryker disable next-line all: no field has a platform default yet, so the
  // input and output variants are the same document and no test can tell them
  // apart. The option stays, because the first default makes them differ.
  const schema = z.toJSONSchema(projectIntent, { io: "input" });
  return `${JSON.stringify({ $schema: DRAFT, ...schema }, undefined, 2)}\n`;
}
