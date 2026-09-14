// Every Service Intent document in this repository, parsed against the one
// metamodel that defines the language.
//
// A worked example proves the model can express the estate; it cannot prove
// that the model refuses what it says it refuses. So this gate holds both
// halves to the same declaration: an accepted document parses, and a refusal
// fixture fails with **exactly** the code its `expect:` header names. A fixture
// that fails for a second reason is as much a defect as one that passes.
//
// Until this landed, the checks over these files read YAML by indentation: a
// six-space `- name:` was a Workload, unless it was an exposure entry, in which
// case it was not. Those checks could not see a closed vocabulary, could not
// see a union, and could not produce a document path. The parser can.
//
// The gate also regenerates the committed JSON Schema and fails on a diff, so
// the editor completion an author gets and the refusal the loader gives come
// from one declaration rather than two.
//
// A library first: tests call `lintIntent()` in-process against fixture trees,
// and `node scripts/lint-intent.ts [root]` is the command.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { parseServiceIntent } from "../src/application/parse-service-intent.ts";
import type { Diagnostic } from "../src/domain/diagnostic.ts";
import { parseEnvFile } from "../src/wire/service-intent/env-file.ts";
import {
  JSON_SCHEMA_PATH,
  serviceIntentJsonSchemaText,
} from "../src/wire/service-intent/json-schema.ts";
import { isEntrypoint } from "./lib/entrypoint.ts";
import { processOutput, type GateOutput } from "./lib/output.ts";

const REPOSITORY = join(import.meta.dirname, "..");

/**
 * Directories under the worked examples that hold something other than layer-1
 * intent: rendered Deliverables, the Platform document (#41's metamodel), and
 * the workflow fixtures.
 */
const NOT_INTENT = new Set(["rendered", "workflows", "platform"]);

/** `expect: <outcome>[, why]`, the fixture metadata chapter 10's refusals carry. */
const EXPECT = /^expect:[ \t]*([^,\n]+)/m;

/** Every file under `dir` whose name ends in `suffix`, sorted, relative to `root`. */
function under(root: string, suffix: string): string[] {
  const examples = join(root, "spec", "v1", "examples");
  if (!existsSync(examples)) return [];
  return readdirSync(examples, { recursive: true, encoding: "utf8" })
    .filter((rel) => rel.endsWith(suffix))
    .filter((rel) => !rel.split(sep).some((part) => NOT_INTENT.has(part)))
    .map((rel) => join(examples, rel))
    .filter((path) => statSync(path).isFile())
    .sort();
}

/** Every authored Service Intent document: the accepted set and the fixtures. */
export function intentDocuments(root: string): string[] {
  return under(root, ".yml");
}

/** Every authored env file: the second artefact of layer 1 (0011). */
export function intentEnvFiles(root: string): string[] {
  return under(root, ".env");
}

/**
 * What a document says should happen to it. An accepted worked example carries
 * no header at all, and the absence is the claim: it parses.
 */
export function expectationOf(text: string): string {
  return EXPECT.exec(text)?.[1]?.trim() ?? "accepted";
}

/**
 * The `expect:` header is fixture metadata and "is not part of the Domain
 * schema" (spec/v1/examples/refusals/README.md), so it is removed before the
 * document is parsed. Removing the line rather than the text keeps every other
 * line at its own number, which a YAML offset still points into.
 */
export function withoutExpectation(text: string): string {
  return text.replace(/^expect:.*$/m, "");
}

/** What actually happened to a document: `accepted`, `schema`, `syntax`, or a code. */
function outcomeOf(diagnostics: readonly Diagnostic[]): string {
  const first = diagnostics[0];
  if (first === undefined) return "accepted";
  // A refusal fixture isolates one defect, so one outcome is the whole answer.
  // Several distinct ones mean the fixture has stopped isolating, which the
  // caller reports as the mismatch it is.
  const distinct = [...new Set(diagnostics.map((d) => d.code))];
  return distinct.length === 1 ? (distinct[0] as string) : distinct.join(" + ");
}

export interface IntentLintResult {
  readonly documents: number;
  readonly envFiles: number;
  readonly errors: readonly string[];
}

/** One diagnostic, rendered for a human: the file, the path inside it, the code. */
function render(root: string, diagnostic: Diagnostic): string {
  return (
    `  ${relative(root, diagnostic.document)}: ` +
    `${diagnostic.at}: ${diagnostic.code}: ${diagnostic.message}`
  );
}

/** Parse every Service Intent document and env file under `root`. */
export function lintIntent(root: string): IntentLintResult {
  const errors: string[] = [];
  const documents = intentDocuments(root);
  if (documents.length === 0)
    errors.push("intent lint: no Service Intent documents found");

  for (const file of documents) {
    const text = readFileSync(file, "utf8");
    const expected = expectationOf(text);
    const result = parseServiceIntent(withoutExpectation(text), file);
    const diagnostics = result.ok ? [] : result.diagnostics;
    const actual = outcomeOf(diagnostics);
    if (actual === expected) continue;
    errors.push(
      `${relative(root, file)}: expected ${expected}, got ${actual}`,
      ...diagnostics.map((diagnostic) => render(root, diagnostic)),
    );
  }

  const envFiles = intentEnvFiles(root);
  for (const file of envFiles) {
    const { diagnostics } = parseEnvFile(readFileSync(file, "utf8"), file);
    errors.push(...diagnostics.map((diagnostic) => render(root, diagnostic)));
  }

  const committed = join(root, JSON_SCHEMA_PATH);
  const generated = serviceIntentJsonSchemaText();
  if (!existsSync(committed))
    errors.push(
      `${JSON_SCHEMA_PATH}: not committed; the metamodel generates it, ` +
        "an editor reads it, and `node scripts/lint-intent.ts --write` writes it",
    );
  else if (readFileSync(committed, "utf8") !== generated)
    errors.push(
      `${JSON_SCHEMA_PATH}: differs from what the metamodel generates; ` +
        "regenerate it with `node scripts/lint-intent.ts --write` rather " +
        "than editing it by hand",
    );

  return { documents: documents.length, envFiles: envFiles.length, errors };
}

/**
 * Write the generated JSON Schema over the committed copy.
 *
 * The gate itself never writes: a CI step that mutates the tree turns a diff
 * into a silent repair. This is the developer command behind it,
 * `node scripts/lint-intent.ts --write`, named in the failure the gate prints.
 */
export function writeJsonSchema(root: string): string {
  const target = join(root, JSON_SCHEMA_PATH);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, serviceIntentJsonSchemaText());
  return target;
}

/** Lint the tree named by argv[0], or this repository. `--write` regenerates. */
export function main(
  argv: readonly string[],
  output: GateOutput = processOutput,
): number {
  const write = argv.includes("--write");
  const root = argv.find((arg) => !arg.startsWith("--")) ?? REPOSITORY;
  if (write)
    output.out(`intent lint: wrote ${relative(root, writeJsonSchema(root))}\n`);
  const { documents, envFiles, errors } = lintIntent(root);
  if (errors.length > 0) {
    output.err(`${errors.join("\n")}\n`);
    return 1;
  }
  output.out(
    `intent lint: ${documents} Service Intent document(s) and ` +
      `${envFiles} env file(s) conform to the metamodel.\n`,
  );
  return 0;
}

if (isEntrypoint(import.meta.url, process.argv[1]))
  process.exitCode = main(process.argv.slice(2));
