// The library entry, and one of the two roots of the module graph
// (.dependency-cruiser.cjs). A module this file cannot reach is dead code, and
// the boundary gate says so rather than waiting for coverage to imply it.
//
// What is published today is the Service Intent language definition: its
// abstract syntax, its concrete syntax, its well-formedness rules, and the
// use-case that puts the three in order. Platform Intent (#41) and the
// Resolved Deployment (#42) join it in the same shape.

export type {
  Diagnostic,
  DiagnosticCode,
  DiagnosticKind,
  Result,
} from "./domain/diagnostic.ts";

export * from "./domain/service-intent/model.ts";
export {
  NOT_DECIDED_BY_ONE_DOCUMENT,
  SERVICE_INTENT_RULES,
  type Placement,
  type Rule,
} from "./domain/service-intent/rules.ts";

export { METAMODEL } from "./wire/service-intent/schema.ts";
export { CLOSED_VOCABULARIES } from "./wire/service-intent/vocabularies.ts";
export {
  parseEnvFile,
  type EnvFileParse,
} from "./wire/service-intent/env-file.ts";
export {
  JSON_SCHEMA_PATH,
  serviceIntentJsonSchema,
  serviceIntentJsonSchemaText,
} from "./wire/service-intent/json-schema.ts";
export { documentPath, readDomain } from "./wire/service-intent/read.ts";

export {
  conforms,
  parseServiceIntent,
} from "./application/parse-service-intent.ts";
