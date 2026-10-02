// The CLI's three commands (docs/architecture.md#layers): `validate` checks a
// set of authored files, `publish` writes a project file's Intent Fragment, and
// `compose` composes the estate from the fragments a workflow pulled. Every
// command reads and writes directories and nothing else: the workflow moves
// fragments and artifacts to and from the registry, never this code. It returns
// what the process should do, and `boundary.ts` does it.
import {
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { parseArgs } from "node:util";
import { parse, stringify } from "yaml";
import {
  checkIntentSet,
  type AuthoredFile,
} from "../application/check-intent-set.ts";
import {
  composeEstate,
  type Fragment,
  type Pin,
} from "../application/compose-estate.ts";
import { parsePlatformIntent } from "../application/parse-platform-intent.ts";
import { parseProjectIntent } from "../application/parse-project-intent.ts";
import { canonicalJson } from "../infrastructure/canonical-json.ts";
import { serialize } from "../infrastructure/serializer.ts";
import { sha256Hasher } from "../infrastructure/sha256-hasher.ts";
import { compositionLock } from "../model/composition-lock.ts";
import type { Diagnostic } from "../model/diagnostic.ts";
import { fragmentManifest } from "../model/fragment.ts";

/** What the process does once a command has run. */
export interface Outcome {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** What a command reads from outside its arguments: the clock and the toolkit's own release. */
export interface World {
  readonly now: () => string;
  readonly toolkitVersion: string;
}

/** A command accepted, refused, or called wrongly. */
const ACCEPTED = 0;
const REFUSED = 1;
const USAGE = 2;

/** The model version this toolkit writes. */
const SCHEMA_VERSION = "1.0.0";
const MANIFEST = "fragment.yml";
const PLATFORM_DOCUMENT = "platform.intent.yml";
const PROOF = "migration-proof.yml";
const PLATFORM_INPUTS = ["node-contract.yml", "images.lock.yml"];
const REF = "ref";

export const USAGE_TEXT = `usage:
  deploy-kit validate <file|directory>... [--json]
  deploy-kit publish <project-file|platform.intent.yml> --repository <owner/name> --source-sha <sha> --version <x.y.z> --out <directory> [--json]
  deploy-kit compose --platform <directory> --fragments <directory> --cluster-state <file>
                     --schema-package-integrity <sha256:...> --out <directory>
                     [--held <directory>] [--pins <file>] [--lock <file> --lock-commit <sha>] [--json]
`;

/** The options every command reads, by name. */
const OPTIONS = {
  json: { type: "boolean" },
  repository: { type: "string" },
  "source-sha": { type: "string" },
  version: { type: "string" },
  out: { type: "string" },
  platform: { type: "string" },
  fragments: { type: "string" },
  held: { type: "string" },
  pins: { type: "string" },
  lock: { type: "string" },
  "lock-commit": { type: "string" },
  "cluster-state": { type: "string" },
  "schema-package-integrity": { type: "string" },
} as const;

type Options = Readonly<Record<string, string | boolean | undefined>>;

/** A wrong call: the usage, after what was wrong with it. */
const usage = (message: string): Outcome => ({
  code: USAGE,
  stdout: "",
  stderr: `${message}\n${USAGE_TEXT}`,
});

/** Diagnostics for a human, or verbatim under `--json`. */
function refused(diagnostics: readonly Diagnostic[], json: boolean): Outcome {
  return {
    code: REFUSED,
    stdout: json ? `${JSON.stringify(diagnostics)}\n` : "",
    stderr: json
      ? ""
      : diagnostics
          .map(
            ({ code, document, path, message, hint }) =>
              `${code}${document === undefined ? "" : ` ${document}`}${path === "" ? "" : `#${path}`}: ${message}\n  ${hint}\n`,
          )
          .join(""),
  };
}

const accepted = (stdout: string): Outcome => ({
  code: ACCEPTED,
  stdout,
  stderr: "",
});

/** Every file under `root`, by its path below it, in path order. */
function filesUnder(root: string): AuthoredFile[] {
  // Each directory is read in name order, so the files come in one order
  // wherever they are read. The machines this runs on already list names in
  // that order, so no test here can tell the sort is there.
  const walk = (directory: string): string[] =>
    // Stryker disable next-line MethodExpression
    readdirSync(directory)
      .sort()
      .map((entry) => join(directory, entry))
      .flatMap((path) => (statSync(path).isDirectory() ? walk(path) : [path]));
  return walk(root).map((path) => ({
    name: relative(root, path),
    text: readFileSync(path, "utf8"),
  }));
}

/** The files `path` names: the file itself, or every file under the directory it is. */
function filesAt(path: string): AuthoredFile[] {
  // One descriptor answers both what `path` is and what it holds, so the file
  // cannot change between the two.
  const descriptor = openSync(path, "r");
  const files = fstatSync(descriptor).isDirectory()
    ? filesUnder(path).map(({ name, text }) => ({
        name: `${path}/${name}`,
        text,
      }))
    : [{ name: path, text: readFileSync(descriptor, "utf8") }];
  // A descriptor left open is invisible to a test.
  // Stryker disable next-line all
  closeSync(descriptor);
  return files;
}

/** One fragment a workflow pulled: its manifest, the reference it recorded, and its files; or why it is not one. */
function fragmentAt(directory: string): Fragment | string {
  const files = filesUnder(directory);
  const manifest = files.find(({ name }) => name === MANIFEST);
  const ref = files.find(({ name }) => name === REF);
  const parsed =
    manifest === undefined
      ? undefined
      : fragmentManifest.safeParse(parse(manifest.text));
  if (parsed?.success !== true || ref === undefined)
    return `${directory}: not a pulled fragment`;
  return { ref: ref.text.trim(), manifest: parsed.data, files };
}

/** Every fragment directory below `root`, or why the first that is not one is not. */
function fragmentsUnder(root: string): Fragment[] | string {
  // Composition is order-independent, so the order fragments are read in is unobservable.
  const read =
    // Stryker disable next-line MethodExpression
    readdirSync(root)
      .sort()
      .map((entry) => fragmentAt(join(root, entry)));
  return (
    read.find((fragment) => typeof fragment === "string") ??
    (read as Fragment[])
  );
}

function validate(paths: readonly string[], json: boolean): Outcome {
  if (paths.length === 0) return usage("validate: name a file or a directory");
  const files = paths.flatMap(filesAt);
  const checked = checkIntentSet(files);
  return checked.ok
    ? accepted(`accepted (${String(files.length)} read)\n`)
    : refused(checked.diagnostics, json);
}

/** The first of `names` the call gives no value, if any. */
const absentOf = (
  values: Options,
  names: readonly string[],
): string | undefined => names.find((name) => typeof values[name] !== "string");

/** An option the caller has already been checked to give. */
const given = (values: Options, name: string): string => values[name] as string;

/** What a fragment holds, and the project and schema version its document declares. */
interface Packed {
  readonly files: readonly AuthoredFile[];
  readonly project: string;
  readonly schemaVersion: string;
}

/**
 * A project file's fragment: the file, its env files, the Asset files it names
 * and the proof beside it, the authored inputs and nothing generated.
 */
function packProject(
  file: string,
  text: string,
): Packed | readonly Diagnostic[] {
  const beside = dirname(file);
  const env = existsSync(join(beside, "env"))
    ? filesUnder(join(beside, "env")).map(({ name, text: body }) => ({
        path: `env/${name}`,
        text: body,
      }))
    : [];
  const parsed = parseProjectIntent(text, env);
  if (!parsed.ok) return parsed.diagnostics;
  const assets = parsed.value.effective.applications.flatMap(({ processes }) =>
    processes.flatMap(({ assets: named }) =>
      (named ?? []).map(({ from }) => from),
    ),
  );
  return {
    files: [
      { name: basename(file), text },
      ...env.map(({ path, text: body }) => ({ name: path, text: body })),
      ...besideFiles(beside, [...new Set(assets)].concat(PROOF)),
    ],
    project: parsed.value.document.project,
    schemaVersion: parsed.value.document.schemaVersion,
  };
}

/**
 * The Platform document's fragment: the document, and the node contract and
 * images lock it publishes with (spec/v1/40-composition.md#participants).
 */
function packPlatform(
  file: string,
  text: string,
): Packed | readonly Diagnostic[] {
  const parsed = parsePlatformIntent(text);
  if (!parsed.ok) return parsed.diagnostics;
  return {
    files: [
      { name: basename(file), text },
      ...besideFiles(dirname(file), PLATFORM_INPUTS),
    ],
    project: parsed.value.document.metadata.project,
    schemaVersion: parsed.value.document.schemaVersion,
  };
}

/** The files named that exist beside a document, read. */
const besideFiles = (
  beside: string,
  names: readonly string[],
): AuthoredFile[] =>
  names
    .filter((name) => existsSync(join(beside, name)))
    .map((name) => ({ name, text: readFileSync(join(beside, name), "utf8") }));

function publish(
  paths: readonly string[],
  values: Options,
  json: boolean,
): Outcome {
  const [document] = paths;
  if (document === undefined)
    return usage("publish: name the project file or the Platform document");
  const absent = absentOf(values, [
    "repository",
    "source-sha",
    "version",
    "out",
  ]);
  if (absent !== undefined) return usage(`--${absent} is required`);
  const text = readFileSync(document, "utf8");
  const packed = document.endsWith(PLATFORM_DOCUMENT)
    ? packPlatform(document, text)
    : packProject(document, text);
  if (!("files" in packed)) return refused(packed, json);
  const { files } = packed;
  const manifest = {
    apiVersion: "intent.jorisjonkers.dev/v1",
    kind: "IntentFragment",
    metadata: {
      repository: given(values, "repository"),
      sourceSha: given(values, "source-sha"),
    },
    spec: {
      schemaVersion: packed.schemaVersion,
      project: packed.project,
      version: given(values, "version"),
      inputsSha: sha256Hasher(files).slice("sha256:".length),
    },
  };
  const checked = fragmentManifest.safeParse(manifest);
  if (!checked.success)
    return usage(
      `publish: ${checked.error.issues.map(({ path }) => path.join(".")).join(", ")} is not what a fragment records`,
    );
  const out = given(values, "out");
  for (const { name, text: body } of files) write(join(out, name), body);
  write(join(out, MANIFEST), stringify(checked.data));
  return accepted(
    `${manifest.spec.project} ${manifest.spec.version} packed in ${out}\n`,
  );
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function compose(values: Options, json: boolean, world: World): Outcome {
  const lockFile = values.lock;
  // A lock is read only with the commit it was committed in.
  const absent =
    typeof lockFile === "string" && typeof values["lock-commit"] !== "string"
      ? "lock-commit"
      : absentOf(values, [
          "cluster-state",
          "platform",
          "fragments",
          "schema-package-integrity",
          "out",
        ]);
  if (absent !== undefined) return usage(`--${absent} is required`);
  const platform = fragmentAt(given(values, "platform"));
  const fragments = fragmentsUnder(given(values, "fragments"));
  const held =
    // No --held and an empty directory hold no fragment alike.
    // Stryker disable next-line ArrayDeclaration
    typeof values.held === "string" ? fragmentsUnder(values.held) : [];
  const wrong = [platform, fragments, held].find(
    (read) => typeof read === "string",
  );
  if (wrong !== undefined) return usage(wrong);
  const pins = values.pins;
  const clusterState = given(values, "cluster-state");
  const result = composeEstate(
    {
      platform: platform as Fragment,
      fragments: fragments as Fragment[],
      held: held as Fragment[],
      pins:
        typeof pins === "string"
          ? (JSON.parse(readFileSync(pins, "utf8")) as Record<string, Pin>)
          : {},
      clusterState: {
        name: basename(clusterState),
        text: readFileSync(clusterState, "utf8"),
      },
      previous:
        typeof lockFile === "string"
          ? {
              commit: given(values, "lock-commit"),
              lock: compositionLock.parse(
                JSON.parse(readFileSync(lockFile).toString()),
              ),
            }
          : undefined,
    },
    {
      hash: sha256Hasher,
      serialize,
      schemaPackageIntegrity: given(values, "schema-package-integrity"),
      schemaVersion: SCHEMA_VERSION,
      toolkitVersion: world.toolkitVersion,
      generatedAt: world.now(),
    },
  );
  if (!result.ok) return refused(result.diagnostics, json);
  const out = given(values, "out");
  const { artifacts, lock: written, statuses, conditions } = result.value;
  for (const { name, files } of artifacts)
    for (const { path, text } of files)
      write(join(out, "artifacts", name, path), text);
  write(join(out, "lock.json"), `${canonicalJson(written)}\n`);
  write(
    join(out, "composition.json"),
    `${canonicalJson({
      artifacts: artifacts.map(({ name, contentHash, moves }) => ({
        name,
        contentHash,
        moves,
      })),
      statuses,
      conditions,
    })}\n`,
  );
  const moving = artifacts.filter(({ moves }) => moves).map(({ name }) => name);
  return accepted(
    `composed ${String(artifacts.length)} artifacts; pins move for: ${moving.length === 0 ? "none" : moving.join(", ")}\n`,
  );
}

/** One command line, run: what the process should print and exit with. */
export function main(argv: readonly string[], world: World): Outcome {
  const [command, ...rest] = argv;
  // Not strict, so an unknown option is reported here rather than thrown.
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    strict: false,
    options: OPTIONS,
  });
  const unknown = Object.keys(values).find((name) => !(name in OPTIONS));
  if (unknown !== undefined) return usage(`Unknown option '--${unknown}'`);
  const json = values.json === true;
  switch (command) {
    case "validate":
      return validate(positionals, json);
    case "publish":
      return publish(positionals, values, json);
    case "compose":
      return compose(values, json, world);
    default:
      return usage(
        command === undefined
          ? "name a command"
          : `${command}: no such command`,
      );
  }
}
