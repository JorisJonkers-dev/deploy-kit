export {
  checkIntentSet,
  type AuthoredFile,
  type IntentSet,
} from "./application/check-intent-set.ts";
export { parsePlatformIntent } from "./application/parse-platform-intent.ts";
export { parseProjectIntent } from "./application/parse-project-intent.ts";
export type * from "./domain/platform-intent/model.ts";
export type { Diagnostic, Result } from "./domain/diagnostic.ts";
export type * from "./domain/project-intent/model.ts";
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
export { canonicalJson } from "./infrastructure/canonical-json.ts";
