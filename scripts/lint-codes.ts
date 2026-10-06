// Every E_ code the specification defines is exercised by a test, or pending
// on the ticket that will exercise it; no code outside the specification is
// used in the tree. See docs/adr/architecture/0118.
import { join } from "node:path";
import { isEntrypoint } from "./lib/entrypoint.ts";
import { processOutput, type GateOutput } from "./lib/output.ts";
import { trackedText } from "./lib/tracked.ts";

export interface Pending {
  readonly ticket: string;
  readonly reason: string;
  readonly codes: readonly string[];
}

export interface CodesLintResult {
  readonly defined: number;
  readonly exercised: number;
  readonly pending: number;
  readonly errors: readonly string[];
}

type Files = Readonly<Record<string, string>>;

const REPOSITORY = join(import.meta.dirname, "..");
const CODE = /(?<![A-Z0-9_])E_[A-Z][A-Z0-9_]*[A-Z0-9](?![A-Z0-9_])/g;
const CHAPTER = /^spec\/v1\/\d\d-[^/]+\.md$/;
// The closed type a refusal's code is checked against when the compiler is
// typechecked: it holds every code a chapter defines, and no other.
export const CLOSED = "src/model/diagnostic.ts";
const EXERCISING = [
  /^test\//,
  /^emf\/[^/]+\/[^/]+\/src\/test\//,
  /\.diagnostics\.json$/,
];
const OUT_OF_SCOPE = [
  /^docs\/mde\//,
  /^docs\/adr\/deferred\//,
  /^review\//,
  /^scripts\/diagrams\//,
  /^CHANGELOG\.md$/,
];

export const RETIRED: Readonly<Record<string, string>> = {
  E_CAPABILITY_UNSATISFIABLE:
    "retired for E_PLACEMENT_UNSATISFIABLE by 0017, which records the retirement",
  E_ORPHANED_CLAIM:
    "retired by 0018: a claim whose class derives a backup is never pruned, so nothing refuses its removal",
};

export const PENDING: readonly Pending[] = [
  {
    ticket: "#44",
    reason: "a code the rule registry retires or rehomes: one rule, one code",
    codes: [
      "E_CONTRACT_TOO_EARLY",
      "E_DUPLICATE_APEX",
      "E_DUPLICATE_ROUTE",
      "E_RELEASE_UNIT_NO_READINESS",
      "E_ROUTE_AUTH_MODE_NOT_IN_TIER",
      "E_UNKNOWN_OVERRIDE",
      "E_UNMANAGED_SURFACE_WITHOUT_COORDINATES",
    ],
  },
  {
    ticket: "#204",
    reason:
      "an invariant over the composed union the registry does not answer yet: secrets, completeness and placement",
    codes: [
      "E_PROVIDER_WITHOUT_COORDINATES",
      "E_RAW_SECRET",
      "E_READER_NOT_DECLARED",
      "E_RELEASE_UNIT_SINGLETON",
      "E_ROLL_AFFECTS_OTHER_READERS",
      "E_SCHEMA_VERSION_MISMATCH",
      "E_UNAUTHORISED_SECRET_REFERENCE",
      "E_UNBOUND_SECRET_GRANT",
      "E_UNDECLARED_SECRET_PATH",
    ],
  },
  {
    ticket: "#92",
    reason:
      "a refusal while resolving, which needs the resolver and its pinned inputs",
    codes: [
      "E_DISK_BINDING_CONFLICT",
      "E_HARDENING_UNMET",
      "E_IMAGE_USER_NOT_NUMERIC",
      "E_STORAGE_UNSATISFIABLE",
      "E_SUBTREE_PREFIX_COLLISION",
    ],
  },
  {
    ticket: "#148",
    reason:
      "a refusal where an Intent Fragment is published, which needs the repository the changelog lives in",
    codes: ["E_CHANGELOG_MISSING"],
  },
  {
    ticket: "#97",
    reason:
      "a refusal while rendering, which needs the adapters and the serializer",
    codes: [
      "E_AMBIENT_INPUT_FORBIDDEN",
      "E_FLOATING_IMAGE",
      "E_FORBIDDEN_KIND",
      "E_FOREIGN_NAMESPACE",
      "E_INPUT_OUTSIDE_WORKDIR",
      "E_LEDGER_ENTRY_STALE",
      "E_RENDER_NONDETERMINISTIC",
      "E_RENDER_OVERWRITE_REFUSED",
      "E_UNACCEPTED_DRIFT",
      "E_UNATTRIBUTED_OBJECT",
      "E_UNREGISTERED_SURFACE",
      "E_UNSAFE_OUTPUT_PATH",
    ],
  },
];

const matches = (rel: string, patterns: readonly RegExp[]): boolean =>
  patterns.some((pattern) => pattern.test(rel));

const superseded = (rel: string, content: string): boolean =>
  rel.startsWith("docs/adr/") && /^superseded-by:/m.test(content);

function codesIn(
  files: Files,
  keep: (rel: string, content: string) => boolean,
): Map<string, string> {
  const found = new Map<string, string>();
  const entries = Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1));
  for (const [rel, content] of entries)
    if (keep(rel, content))
      for (const [code] of content.matchAll(CODE))
        if (!found.has(code)) found.set(code, rel);
  return found;
}

export function codeErrors(
  files: Files,
  pending: readonly Pending[],
): CodesLintResult {
  const defined = codesIn(files, (rel) => CHAPTER.test(rel));
  const exercised = codesIn(files, (rel) => matches(rel, EXERCISING));
  const used = codesIn(
    files,
    (rel, content) =>
      !CHAPTER.test(rel) &&
      !matches(rel, OUT_OF_SCOPE) &&
      !superseded(rel, content),
  );
  const errors: string[] = [];
  const pendingOn = new Map<string, string>();

  for (const group of pending) {
    if (group.reason.trim() === "")
      errors.push(`pending on ${group.ticket}: names no reason`);
    for (const code of group.codes) {
      const earlier = pendingOn.get(code);
      if (earlier !== undefined)
        errors.push(`${code}: pending on both ${earlier} and ${group.ticket}`);
      pendingOn.set(code, group.ticket);
      if (!defined.has(code))
        errors.push(
          `${code}: pending on ${group.ticket}, but no chapter defines it`,
        );
      const by = exercised.get(code);
      if (by !== undefined)
        errors.push(
          `${code}: pending on ${group.ticket}, but ${by} exercises it`,
        );
    }
  }
  for (const code of defined.keys())
    if (!exercised.has(code) && !pendingOn.has(code))
      errors.push(
        `${code}: defined by the specification, exercised by no test, and not pending`,
      );
  if (CLOSED in files) {
    const closed = codesIn(files, (rel) => rel === CLOSED);
    for (const code of defined.keys())
      if (!closed.has(code))
        errors.push(
          `${code}: defined by the specification, and missing from the closed code type in ${CLOSED}`,
        );
    // A retired code may still be mentioned elsewhere, never carried.
    for (const code of closed.keys())
      if (!defined.has(code))
        errors.push(
          `${code}: in the closed code type in ${CLOSED}, and defined by no chapter`,
        );
  }
  for (const [code, rel] of used)
    if (rel !== CLOSED && !defined.has(code) && !(code in RETIRED))
      errors.push(`${rel} uses ${code}, which no chapter defines`);

  const exercisedDefined = [...exercised.keys()].filter((code) =>
    defined.has(code),
  ).length;
  return {
    defined: defined.size,
    exercised: exercisedDefined,
    pending: pendingOn.size,
    errors,
  };
}

export function lintCodes(
  root: string,
  pending: readonly Pending[] = PENDING,
): CodesLintResult {
  return codeErrors(trackedText(root), pending);
}

export function main(
  argv: readonly string[],
  output: GateOutput = processOutput,
  pendingList: readonly Pending[] = PENDING,
): number {
  const { defined, exercised, pending, errors } = lintCodes(
    argv[0] ?? REPOSITORY,
    pendingList,
  );
  if (errors.length > 0) {
    output.err(
      `codes lint: ${errors.length} error(s)\n` +
        errors.map((e) => `  - ${e}\n`).join(""),
    );
    return 1;
  }
  output.out(
    `codes lint: ${defined} codes defined, ${exercised} exercised, ${pending} pending\n`,
  );
  return 0;
}

if (isEntrypoint(import.meta.url, process.argv[1]))
  process.exitCode = main(process.argv.slice(2));
