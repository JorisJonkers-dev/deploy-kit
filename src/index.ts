export {
  checkIntentSet,
  type AuthoredFile,
  type IntentSet,
} from "./application/check-intent-set.ts";
export {
  parsePlatformIntent,
  type ParsedPlatformIntent,
} from "./application/parse-platform-intent.ts";
export {
  parseProjectIntent,
  type ParsedProjectIntent,
} from "./application/parse-project-intent.ts";
export {
  renderIntentSet,
  type RenderedArtifact,
  type RenderedFile,
  type RenderOptions,
  type Serializer,
} from "./application/render-intent-set.ts";
export {
  serialize,
  serializeJson,
  serializeYaml,
} from "./infrastructure/serializer.ts";
export {
  resolveIntentSet,
  type ResolveOptions,
  type ResolvedSet,
} from "./application/resolve-intent-set.ts";
export type {
  DependenciesDocument,
  ResolvedProject,
} from "./model/resolution.ts";
export type { Diagnostic, Result } from "./model/diagnostic.ts";
export type * from "./model/effective-intent.ts";
export type { EnvScope, EnvSource, ScopedEnv } from "./model/env.ts";
export type {
  ApplicationDocument,
  Asset,
  DependencyEdge,
  EnvFile,
  EnvVariable,
  Exposure,
  Grant,
  Placement,
  ProcessDocument,
  ProjectIntentDocument,
  SharedIntent,
} from "./model/project-intent.ts";
export type { PlatformIntentDocument } from "./model/platform-intent.ts";
export { descriptor } from "./model/descriptor.ts";
export type {
  Descriptor,
  DescriptorClass,
  DescriptorFeature,
  DescriptorVocabulary,
} from "./model/descriptor.ts";
export {
  JSON_SCHEMA_PATH,
  PLATFORM_JSON_SCHEMA_PATH,
  platformIntentJsonSchema,
  projectIntentJsonSchema,
} from "./model/json-schema.ts";
export {
  nodeContract,
  type NodeContractDocument,
  type NodeMedium,
} from "./model/node-contract.ts";
export {
  resolvedApplicationDocument,
  resolvedDeployment,
  type ResolvedApplicationDocument,
  type ResolvedDeploymentDocument,
} from "./model/resolved-deployment.ts";
export type { Hasher } from "./model/hasher.ts";
export { applicationRevision } from "./model/revision.ts";
export { canonicalJson } from "./infrastructure/canonical-json.ts";
export { sha256Hasher } from "./infrastructure/sha256-hasher.ts";
