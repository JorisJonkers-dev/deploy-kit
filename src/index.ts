export {
  checkIntentSet,
  type AuthoredFile,
  type IntentSet,
} from "./application/check-intent-set.ts";
export { parsePlatformIntent } from "./application/parse-platform-intent.ts";
export {
  parseProjectIntent,
  type ParsedProjectIntent,
} from "./application/parse-project-intent.ts";
export type * from "./domain/platform-intent/model.ts";
export type { Diagnostic, Result } from "./domain/diagnostic.ts";
export type * from "./domain/project-intent/model.ts";
export type {
  EnvScope,
  EnvSource,
  ScopedEnv,
} from "./wire/project-intent/env.ts";
export { descriptor } from "./wire/project-intent/descriptor.ts";
export type {
  Descriptor,
  DescriptorClass,
  DescriptorFeature,
  DescriptorVocabulary,
} from "./wire/project-intent/descriptor.ts";
export {
  JSON_SCHEMA_PATH,
  PLATFORM_JSON_SCHEMA_PATH,
  platformIntentJsonSchema,
  projectIntentJsonSchema,
} from "./wire/project-intent/json-schema.ts";
export type * from "./domain/node-contract/vocabularies.ts";
export type * from "./domain/resolved-deployment/vocabularies.ts";
export {
  nodeContract,
  type NodeContractDocument,
} from "./wire/node-contract/schema.ts";
export {
  resolvedApplicationDocument,
  resolvedDeployment,
  type ResolvedApplicationDocument,
  type ResolvedDeploymentDocument,
} from "./wire/resolved-deployment/schema.ts";
export type { Hasher } from "./domain/hasher.ts";
export { applicationRevision } from "./domain/resolved-deployment/revision.ts";
export { canonicalJson } from "./infrastructure/canonical-json.ts";
export { sha256Hasher } from "./infrastructure/sha256-hasher.ts";
