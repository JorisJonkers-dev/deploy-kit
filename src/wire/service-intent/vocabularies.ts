// The seventeen closed vocabularies of chapter 10, declared once.
//
// "Values are **exhaustive**: one absent from a list here fails schema
// validation, and adding one is a change to this chapter." The chapter is the
// normative statement; this is its single machine-readable declaration, and no
// other module in this repository may re-type one of these lists. A test
// constant spelling out `AlertClass` a second time is exactly the drift the
// vocabulary table exists to prevent, and issue #38 deletes the one that
// existed.
//
// The record at the bottom is what issue #40 renders the chapter's vocabulary
// table from: name, the attributes it types, and the values, in the chapter's
// own order.
import { z } from "zod";

export const Lifecycle = z.enum(["service", "job"]);
export const Runtime = z.enum(["jvm", "python", "node", "static", "none"]);
export const Engine = z.enum(["postgres", "rabbitmq", "valkey", "files"]);
export const Cutover = z.enum(["rolling", "recreate"]);
export const DurabilityClass = z.enum([
  "reconstructible",
  "recoverable",
  "irreplaceable",
]);
export const Arch = z.enum(["amd64", "arm64"]);
export const Media = z.enum(["nvme", "ssd", "hdd"]);
export const AlertClass = z.enum(["business-hours", "urgent", "page"]);
export const Audience = z.enum([
  "anonymous",
  "authenticated",
  "internal",
  "lan",
]);
export const ContentPolicy = z.enum(["strict", "admin", "workflow"]);
export const Match = z.enum(["prefix", "exact"]);
export const SecretEngine = z.enum(["kv", "database", "transit"]);
export const AccessTier = z.enum([
  "read",
  "self-renew",
  "self-roll",
  "custody",
]);
export const TransitOp = z.enum([
  "sign",
  "verify",
  "encrypt",
  "decrypt",
  "rotate",
]);
export const Delivery = z.enum(["env", "file", "self"]);
export const Tolerance = z.enum(["restart", "reload"]);
export const PlaceholderKind = z.enum([
  "secret",
  "dependency",
  "exposure",
  "identity",
]);

/** One row of chapter 10's closed-vocabulary table. */
export interface Vocabulary {
  /** The type name the class diagram uses. */
  readonly name: string;
  /** The `Class.attribute` spellings this vocabulary types. */
  readonly namedBy: readonly string[];
  readonly values: readonly string[];
}

/**
 * Every closed vocabulary, in the chapter's order. Seventeen is not a magic
 * number: it is what the chapter says it holds, and a test compares the two.
 */
export const CLOSED_VOCABULARIES: readonly Vocabulary[] = [
  {
    name: "Lifecycle",
    namedBy: ["Workload.lifecycle"],
    values: Lifecycle.options,
  },
  { name: "Runtime", namedBy: ["Workload.runtime"], values: Runtime.options },
  { name: "Engine", namedBy: ["Workload.engine"], values: Engine.options },
  { name: "Cutover", namedBy: ["Workload.cutover"], values: Cutover.options },
  {
    name: "DurabilityClass",
    namedBy: ["Volume.durability"],
    values: DurabilityClass.options,
  },
  { name: "Arch", namedBy: ["Placement.arch"], values: Arch.options },
  { name: "Media", namedBy: ["DiskRequest.media"], values: Media.options },
  {
    name: "AlertClass",
    namedBy: ["Observability.alertClass"],
    values: AlertClass.options,
  },
  {
    name: "Audience",
    namedBy: ["Exposure.audience", "Route.audience"],
    values: Audience.options,
  },
  {
    name: "ContentPolicy",
    namedBy: ["Exposure.contentPolicy"],
    values: ContentPolicy.options,
  },
  { name: "Match", namedBy: ["Route.match"], values: Match.options },
  {
    name: "SecretEngine",
    namedBy: ["Grant.engine"],
    values: SecretEngine.options,
  },
  {
    name: "AccessTier",
    namedBy: ["Grant.access"],
    values: AccessTier.options,
  },
  {
    name: "TransitOp",
    namedBy: ["Grant.operations"],
    values: TransitOp.options,
  },
  { name: "Delivery", namedBy: ["Grant.delivery"], values: Delivery.options },
  {
    name: "Tolerance",
    namedBy: ["Rotation.tolerates"],
    values: Tolerance.options,
  },
  {
    name: "PlaceholderKind",
    namedBy: ["Placeholder.kind"],
    values: PlaceholderKind.options,
  },
];
