// REQ-045 (docs/requirements.md): the CLI's three commands against the worked
// examples, in process: `validate` accepts and refuses a set, `publish` packs a
// project's and the platform's Intent Fragment, and `compose` composes the
// estate from pulled fragments and composes it again from its own lock. A
// wrong call is a usage error, and a refusal is rendered for a human or as JSON.
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { main, USAGE_TEXT, type World } from "../../src/cli/main.ts";
import { sha256Hasher } from "../../src/index.ts";
import { temporary } from "../setup.ts";

const EXAMPLES = join(
  import.meta.dirname,
  "..",
  "..",
  "spec",
  "v1",
  "examples",
);
const example = (path: string): string => join(EXAMPLES, path);

const WORLD: World = {
  now: () => "2026-10-02T09:00:00.000Z",
  toolkitVersion: "0.2.0",
};
const run = (...argv: string[]) => main(argv, WORLD);

const INTEGRITY = `sha256:${"5e".repeat(32)}`;

/** The foundation and minimal, as the files `validate` reads. */
const SET = [
  "platform/platform.intent.yml",
  "minimal/notes.project.yml",
  "minimal/env/notes-api/base.env",
  "delivery/delivery.project.yml",
  "edge/edge.project.yml",
  "observability/observability.project.yml",
  "secrets/secrets.project.yml",
].map(example);

/** Each project file of the union, and the repository that publishes it. */
const PROJECTS = [
  ["minimal/notes.project.yml", "notes"],
  ["data/data.project.yml", "data"],
  ["delivery/delivery.project.yml", "delivery"],
  ["edge/edge.project.yml", "edge"],
  ["observability/observability.project.yml", "observability"],
  ["secrets/secrets.project.yml", "secrets"],
] as const;

const hex = (seed: string, length: number): string =>
  sha256Hasher(seed).slice("sha256:".length, "sha256:".length + length);

/** One release published into `out`, and the reference a pull records beside it. */
function published(document: string, name: string, out: string): string {
  const outcome = run(
    "publish",
    document,
    "--repository",
    `JorisJonkers-dev/${name}`,
    "--source-sha",
    hex(name, 40),
    "--version",
    "1.0.0",
    "--out",
    out,
  );
  expect(outcome.code).toBe(0);
  writeFileSync(
    join(out, "ref"),
    `ghcr.io/jorisjonkers-dev/intent/${name}@sha256:${hex(`${name}-ref`, 64)}\n`,
  );
  // When the pull's registry says the fragment was pushed: the day before the run.
  writeFileSync(join(out, "published"), "2026-10-01T09:00:00Z\n");
  return out;
}

/** A participants list that expects every project of the union, and the Platform document. */
const LISTED = `participants:\n${["jorisjonkers.dev", ...PROJECTS.map(([, name]) => name)].map((name) => `  ${name}: {}\n`).join("")}`;

/** Every fragment pulled into one workspace, under a ledger whose delivered Projects the adapters spell. */
function pulled(): string {
  const root = mkdtempSync(join(temporary(), "compose-"));
  for (const [document, name] of PROJECTS)
    published(example(document), name, join(root, "fragments", name));
  const platform = join(root, "authored");
  cpSync(example("platform"), platform, { recursive: true });
  const document = join(platform, "platform.intent.yml");
  writeFileSync(
    document,
    readFileSync(document, "utf8").replace(
      /\nhandover:\n(?: {2}.*\n)+/,
      "\nhandover:\n  retireBy: 2027-03-31\n  legacy: [auth, data, delivery, edge, knowledge]\n  estate: [notes, observability, secrets]\n",
    ),
  );
  published(document, "estate", join(root, "platform"));
  writeFileSync(join(root, "participants.yml"), LISTED);
  return root;
}

const composeIn = (root: string, ...extra: string[]) =>
  run(
    "compose",
    "--platform",
    join(root, "platform"),
    "--fragments",
    join(root, "fragments"),
    "--participants",
    join(root, "participants.yml"),
    "--cluster-state",
    example("platform/cluster-state.yml"),
    "--schema-package-integrity",
    INTEGRITY,
    ...extra,
  );

describe("deploy-kit validate", () => {
  it("accepts a set the checks accept", () => {
    expect(run("validate", ...SET)).toEqual({
      code: 0,
      stdout: "accepted (7 read)\n",
      stderr: "",
    });
  });

  it("reads a directory as every file below it", () => {
    const root = mkdtempSync(join(temporary(), "validate-"));
    cpSync(example("minimal"), join(root, "minimal"), {
      recursive: true,
      filter: (source) =>
        !source.includes("expected") && !source.includes("rendered"),
    });

    const outcome = run("validate", join(root, "minimal"));

    expect(outcome).toEqual({
      code: 0,
      stdout: "accepted (3 read)\n",
      stderr: "",
    });
  });

  it("renders a refusal for a human, and verbatim under --json", () => {
    const human = run("validate", example("platform/platform.intent.yml"));
    expect(human.code).toBe(1);
    expect(human.stdout).toBe("");
    expect(human.stderr.split("\n")[2]).toMatch(/^E_UNKNOWN_TIER_PROXY /);
    expect(human.stderr.split("\n").slice(0, 2)).toEqual([
      `E_UNKNOWN_TIER_PROXY ${example("platform/platform.intent.yml")}#/tiers/0: no project file declares the Application traefik-public this tier's proxy names`,
      "  Declare the proxy Application in a project file the platform owns.",
    ]);

    const json = run(
      "validate",
      example("platform/platform.intent.yml"),
      "--json",
    );
    expect(json.code).toBe(1);
    expect(json.stderr).toBe("");
    expect(
      (JSON.parse(json.stdout) as { code: string }[]).map(({ code }) => code),
    ).toContain("E_UNKNOWN_TIER_PROXY");
  });

  it("renders a refusal at no path without a fragment", () => {
    const root = mkdtempSync(join(temporary(), "validate-"));
    const file = join(root, "broken.project.yml");
    writeFileSync(file, "project: [");

    expect(run("validate", file).stderr).toMatch(
      /^\S+ \S+broken\.project\.yml: /,
    );
  });

  it("names each file of a directory by its path, so a refusal points at it", () => {
    const root = mkdtempSync(join(temporary(), "validate-"));
    writeFileSync(join(root, "broken.project.yml"), "project: [");

    expect(run("validate", root).stderr).toContain(
      `${root}/broken.project.yml`,
    );
  });

  it("asks for something to read", () => {
    expect(run("validate")).toEqual({
      code: 2,
      stdout: "",
      stderr: `validate: name a file or a directory\n${USAGE_TEXT}`,
    });
  });
});

describe("deploy-kit publish", () => {
  it("packs a project file, its env files and its Asset files, with the manifest that names its release", () => {
    const out = join(mkdtempSync(join(temporary(), "publish-")), "data");
    const outcome = run(
      "publish",
      example("data/data.project.yml"),
      "--repository",
      "JorisJonkers-dev/data",
      "--source-sha",
      hex("data", 40),
      "--version",
      "2.1.0",
      "--out",
      out,
    );

    expect(outcome).toEqual({
      code: 0,
      stdout: `data 2.1.0 packed in ${out}\n`,
      stderr: "",
    });
    const files = [
      "data.project.yml",
      "env/postgres/base.env",
      "config/postgresql.conf",
    ].map((name) => ({
      name,
      text: readFileSync(example(`data/${name}`), "utf8"),
    }));
    for (const { name, text } of files)
      expect(readFileSync(join(out, name), "utf8")).toBe(text);
    expect(parse(readFileSync(join(out, "fragment.yml"), "utf8"))).toEqual({
      apiVersion: "intent.jorisjonkers.dev/v1",
      kind: "IntentFragment",
      metadata: {
        repository: "JorisJonkers-dev/data",
        sourceSha: hex("data", 40),
      },
      spec: {
        schemaVersion: "1.0.0",
        project: "data",
        version: "2.1.0",
        inputsSha: sha256Hasher(files).slice("sha256:".length),
      },
    });
  });

  it("packs a project's migration proof beside it, and a project with no env files", () => {
    const out = join(mkdtempSync(join(temporary(), "publish-")), "auth");
    published(example("auth/auth.project.yml"), "auth", out);
    expect(existsSync(join(out, "migration-proof.yml"))).toBe(true);

    const bare = join(mkdtempSync(join(temporary(), "publish-")), "edge");
    published(example("edge/edge.project.yml"), "edge", bare);
    expect(existsSync(join(bare, "env"))).toBe(false);
  });

  it("packs a project's share of the images lock it is handed, and counts it among the inputs", () => {
    const out = join(mkdtempSync(join(temporary(), "publish-")), "auth");
    const arguments_ = [
      "publish",
      example("auth/auth.project.yml"),
      "--repository",
      "JorisJonkers-dev/auth",
      "--source-sha",
      hex("auth", 40),
      "--version",
      "1.0.0",
      "--out",
      out,
    ];
    expect(run(...arguments_).code).toBe(0);
    expect(existsSync(join(out, "images.lock.yml"))).toBe(false);
    const without = (
      parse(readFileSync(join(out, "fragment.yml"), "utf8")) as {
        spec: { inputsSha: string };
      }
    ).spec.inputsSha;

    expect(
      run(...arguments_, "--images-lock", example("platform/images.lock.yml")),
    ).toEqual({ code: 0, stdout: `auth 1.0.0 packed in ${out}\n`, stderr: "" });
    const share = parse(readFileSync(join(out, "images.lock.yml"), "utf8")) as {
      name: string;
      kind: string;
      images: Record<string, unknown>;
    };
    expect(share.kind).toBe("ImagesLock");
    expect(share.name).toBe("auth");
    expect(Object.keys(share.images)).toEqual([
      "auth-api",
      "auth-migration",
      "auth-ui",
    ]);
    // A new digest in the share is a new fragment.
    expect(
      (
        parse(readFileSync(join(out, "fragment.yml"), "utf8")) as {
          spec: { inputsSha: string };
        }
      ).spec.inputsSha,
    ).not.toBe(without);
  });

  it("refuses to pack a project whose image the lock it is handed does not hold", () => {
    const directory = mkdtempSync(join(temporary(), "publish-"));
    const lock = join(directory, "images.lock.yml");
    writeFileSync(
      lock,
      readFileSync(example("platform/images.lock.yml"), "utf8").replace(
        /^ {2}auth-ui:\n(?: {4}.*\n)+/m,
        "",
      ),
    );
    const out = join(directory, "auth");
    const outcome = run(
      "publish",
      example("auth/auth.project.yml"),
      "--repository",
      "JorisJonkers-dev/auth",
      "--source-sha",
      hex("auth", 40),
      "--version",
      "1.0.0",
      "--out",
      out,
      "--images-lock",
      lock,
      "--json",
    );

    expect(outcome.code).toBe(1);
    expect(JSON.parse(outcome.stdout)).toEqual([
      {
        code: "E_UNLOCKED_IMAGE",
        document: lock,
        path: "/images",
        message: "the images lock holds no entry for auth-ui",
        hint: "Lock every alias the project file names before its fragment is published.",
      },
    ]);
    expect(existsSync(out)).toBe(false);
  });

  it("takes --images-lock for a project file only: the Platform document publishes the lock beside it", () => {
    const out = join(mkdtempSync(join(temporary(), "publish-")), "platform");
    const outcome = run(
      "publish",
      example("platform/platform.intent.yml"),
      "--repository",
      "JorisJonkers-dev/estate",
      "--source-sha",
      hex("estate", 40),
      "--version",
      "1.0.0",
      "--out",
      out,
      "--images-lock",
      example("platform/images.lock.yml"),
    );

    expect(outcome).toEqual({
      code: 2,
      stdout: "",
      stderr: `publish: --images-lock is for a project file\n${USAGE_TEXT}`,
    });
    expect(existsSync(out)).toBe(false);
  });

  it("packs the Platform document with the node contract and the images lock it publishes with", () => {
    const out = join(mkdtempSync(join(temporary(), "publish-")), "platform");
    published(example("platform/platform.intent.yml"), "estate", out);

    expect(existsSync(join(out, "node-contract.yml"))).toBe(true);
    expect(existsSync(join(out, "images.lock.yml"))).toBe(true);
    expect(existsSync(join(out, "cluster-state.yml"))).toBe(false);
    expect(
      (
        parse(readFileSync(join(out, "fragment.yml"), "utf8")) as {
          spec: { project: string };
        }
      ).spec.project,
    ).toBe("jorisjonkers.dev");
  });

  it("refuses a document the checks refuse, and writes nothing", () => {
    const root = mkdtempSync(join(temporary(), "publish-"));
    for (const document of ["broken.project.yml", "platform.intent.yml"]) {
      writeFileSync(join(root, document), "kind: [");
      const out = join(root, `out-${document}`);
      const outcome = run(
        "publish",
        join(root, document),
        "--repository",
        "JorisJonkers-dev/broken",
        "--source-sha",
        hex("broken", 40),
        "--version",
        "1.0.0",
        "--out",
        out,
      );
      expect(outcome.code).toBe(1);
      expect(existsSync(out)).toBe(false);
    }
  });

  it("asks for the document, every option, and a manifest a fragment can record", () => {
    expect(run("publish").stderr).toBe(
      `publish: name the project file or the Platform document\n${USAGE_TEXT}`,
    );
    expect(run("publish", example("edge/edge.project.yml")).stderr).toBe(
      `--repository is required\n${USAGE_TEXT}`,
    );
    expect(
      run(
        "publish",
        example("edge/edge.project.yml"),
        "--repository",
        "JorisJonkers-dev/edge",
        "--source-sha",
        "not-a-sha",
        "--version",
        "v1",
        "--out",
        mkdtempSync(join(temporary(), "publish-")),
      ),
    ).toEqual({
      code: 2,
      stdout: "",
      stderr: `publish: metadata.sourceSha, spec.version is not what a fragment records\n${USAGE_TEXT}`,
    });
  });
});

describe("deploy-kit compose", () => {
  it("composes a Project from the share its fragment carries, when the platform's lock no longer holds its image", () => {
    const root = pulled();
    // The platform's fragment, published again with a lock that leaves the
    // Project's image out.
    const authored = join(root, "authored");
    const estate = readFileSync(join(authored, "images.lock.yml"), "utf8");
    writeFileSync(
      join(authored, "images.lock.yml"),
      estate.replace(/^ {2}notes-api:\n(?: {4}.*\n)+/m, ""),
    );
    published(
      join(authored, "platform.intent.yml"),
      "estate",
      join(root, "platform"),
    );
    expect(composeIn(root, "--out", join(root, "unlocked")).stdout).toBe(
      "composed 2 artifacts; pins move for: observability, secrets\n",
    );

    // The Project's own release, published with the lock its build wrote.
    const lock = join(root, "notes.lock.yml");
    writeFileSync(lock, estate);
    const notes = join(root, "fragments", "notes");
    expect(
      run(
        "publish",
        example("minimal/notes.project.yml"),
        "--repository",
        "JorisJonkers-dev/notes",
        "--source-sha",
        hex("notes", 40),
        "--version",
        "1.0.0",
        "--out",
        notes,
        "--images-lock",
        lock,
      ).code,
    ).toBe(0);
    writeFileSync(
      join(notes, "ref"),
      `ghcr.io/jorisjonkers-dev/intent/notes@sha256:${hex("notes-share", 64)}\n`,
    );

    expect(composeIn(root, "--out", join(root, "shared"))).toEqual({
      code: 0,
      stdout:
        "composed 3 artifacts; pins move for: notes, observability, secrets\n",
      stderr: "",
    });
  });

  it("composes the estate from pulled fragments, then again from its own lock with nothing to move", () => {
    const root = pulled();
    const first = composeIn(root, "--out", join(root, "first"));

    expect(first).toEqual({
      code: 0,
      stdout:
        "composed 3 artifacts; pins move for: notes, observability, secrets\n",
      stderr: "",
    });
    expect(
      readFileSync(
        join(
          root,
          "first",
          "artifacts",
          "notes",
          "apps",
          "notes",
          "notes",
          "workload.yaml",
        ),
        "utf8",
      ),
    ).toBe(
      readFileSync(
        example("minimal/rendered/apps/notes/notes/workload.yaml"),
        "utf8",
      ),
    );
    const lock = JSON.parse(
      readFileSync(join(root, "first", "lock.json"), "utf8"),
    ) as {
      metadata: { generatedAt: string };
      spec: { toolkitVersion: string; schemaVersion: string };
    };
    expect(lock.metadata.generatedAt).toBe("2026-10-02T09:00:00.000Z");
    expect(lock.spec.toolkitVersion).toBe("0.2.0");
    expect(lock.spec.schemaVersion).toBe("1.0.0");
    const report = JSON.parse(
      readFileSync(join(root, "first", "composition.json"), "utf8"),
    ) as {
      artifacts: { name: string; contentHash: string; moves: boolean }[];
      statuses: unknown[];
      conditions: unknown[];
    };
    expect(report.statuses).toHaveLength(7);
    expect(report.conditions).toEqual([]);
    // REQ-051 (docs/requirements.md): an artifact with no pin yet has its pin
    // source written, at the path the Estate repository commits it under.
    expect(
      readFileSync(
        join(root, "first", "projects", "notes", "source.yaml"),
        "utf8",
      ),
    ).toBe(
      readFileSync(example("pins/rendered/projects/notes/source.yaml"), "utf8"),
    );

    const pins = join(root, "pins.json");
    writeFileSync(
      pins,
      JSON.stringify(
        Object.fromEntries(
          report.artifacts.map(({ name, contentHash }) => [
            name,
            { contentHash, annotations: {} },
          ]),
        ),
      ),
    );
    const again = composeIn(
      root,
      "--held",
      join(root, "fragments"),
      "--pins",
      pins,
      "--lock",
      join(root, "first", "lock.json"),
      "--lock-commit",
      hex("estate", 40),
      "--out",
      join(root, "again"),
    );

    expect(again.stdout).toBe("composed 3 artifacts; pins move for: none\n");
    // Pinned already, so no source is written a second time.
    expect(existsSync(join(root, "again", "projects"))).toBe(false);
  });

  it("isolates a refused fragment that never composed, and composes the rest", () => {
    const root = pulled();
    writeFileSync(
      join(root, "fragments", "notes", "notes.project.yml"),
      readFileSync(example("minimal/notes.project.yml"), "utf8").replace(
        "surface: http }",
        "surface: grpc }",
      ),
    );

    expect(composeIn(root, "--out", join(root, "out")).stdout).toBe(
      "composed 2 artifacts; pins move for: observability, secrets\n",
    );
  });

  it("refuses a run whose Platform document is refused, and writes nothing", () => {
    const root = pulled();
    const document = join(root, "platform", "platform.intent.yml");
    writeFileSync(
      document,
      readFileSync(document, "utf8").replace(
        "estate: [notes, observability, secrets]",
        "estate: [notes, observability, secrets, data]",
      ),
    );
    const refusal = composeIn(root, "--out", join(root, "out"), "--json");

    expect(refusal.code).toBe(1);
    expect(
      (JSON.parse(refusal.stdout) as { code: string }[]).map(
        ({ code }) => code,
      ),
    ).toContain("E_HANDOVER_BOTH_PATHS");
    expect(existsSync(join(root, "out"))).toBe(false);
  });

  it("isolates a refused release at its held fragment, recording the lock it follows", () => {
    const root = pulled();
    const first = composeIn(root, "--out", join(root, "first"));
    expect(first.code).toBe(0);
    cpSync(join(root, "fragments"), join(root, "held"), { recursive: true });
    const notes = join(root, "fragments", "notes");
    writeFileSync(
      join(notes, "notes.project.yml"),
      readFileSync(example("minimal/notes.project.yml"), "utf8").replace(
        "surface: http }",
        "surface: grpc }",
      ),
    );
    writeFileSync(
      join(notes, "ref"),
      `ghcr.io/jorisjonkers-dev/intent/notes@sha256:${hex("notes-next", 64)}\n`,
    );

    const again = composeIn(
      root,
      "--held",
      join(root, "held"),
      "--lock",
      join(root, "first", "lock.json"),
      "--lock-commit",
      hex("estate", 40),
      "--out",
      join(root, "again"),
    );

    expect(again.stdout).toBe(
      "composed 3 artifacts; pins move for: notes, observability, secrets\n",
    );
    const lock = JSON.parse(
      readFileSync(join(root, "again", "lock.json"), "utf8"),
    ) as {
      spec: {
        previousLockDigest?: string;
        isolated?: Record<string, { codes: string[] }>;
      };
    };
    expect(lock.spec.previousLockDigest).toMatch(/^sha256:/);
    expect(lock.spec.isolated?.notes?.codes).toEqual(["E_UNKNOWN_SURFACE"]);
  });

  it("refuses a union with no Platform document, naming no document", () => {
    const root = pulled();
    rmSync(join(root, "platform", "platform.intent.yml"));

    expect(composeIn(root, "--out", join(root, "out"))).toEqual({
      code: 1,
      stdout: "",
      stderr:
        "schema: a resolution reads a Platform document, and the set holds none\n  Read the set together with its Platform document, node contract, images lock and ClusterState snapshot.\n",
    });
  });

  // REQ-050 (docs/requirements.md): the command hands composition the
  // participants list and each fragment's publish time.
  it("isolates a participant that published nothing, and records it in the lock with no fragment", () => {
    const root = pulled();
    rmSync(join(root, "fragments", "notes"), { recursive: true });

    expect(composeIn(root, "--out", join(root, "out")).code).toBe(0);
    const lock = JSON.parse(
      readFileSync(join(root, "out", "lock.json"), "utf8"),
    ) as { spec: { isolated: Record<string, unknown> } };
    expect(lock.spec.isolated).toStrictEqual({
      notes: { codes: ["E_PARTICIPANT_MISSING"] },
    });
  });

  it("refuses a run with no Platform document's fragment at all, as a participant that is missing", () => {
    const root = pulled();
    const outcome = run(
      "compose",
      "--fragments",
      join(root, "fragments"),
      "--participants",
      join(root, "participants.yml"),
      "--cluster-state",
      example("platform/cluster-state.yml"),
      "--schema-package-integrity",
      INTEGRITY,
      "--out",
      join(root, "out"),
    );

    expect(outcome.code).toBe(1);
    expect(outcome.stderr).toContain(
      "E_PARTICIPANT_MISSING participants.yml#/participants: the Platform document published no fragment",
    );
  });

  it("refuses a participants list that is not one, at the file it was handed", () => {
    const root = pulled();
    writeFileSync(
      join(root, "participants.yml"),
      "participants:\n  notes: { maxAge: 21d }\n",
    );

    const outcome = composeIn(root, "--out", join(root, "out"), "--json");

    expect(outcome.code).toBe(1);
    expect(JSON.parse(outcome.stdout)).toMatchObject([
      {
        code: "schema",
        document: "participants.yml",
        path: "/participants/notes/reason",
      },
    ]);
  });

  it("asks for the publish time a pull records beside each reference", () => {
    const root = pulled();
    rmSync(join(root, "fragments", "notes", "published"));
    expect(composeIn(root, "--out", join(root, "out")).stderr).toBe(
      `notes: no publish time recorded beside its reference\n${USAGE_TEXT}`,
    );
    writeFileSync(join(root, "fragments", "notes", "published"), "yesterday\n");
    expect(composeIn(root, "--out", join(root, "out")).stderr).toBe(
      `notes: no publish time recorded beside its reference\n${USAGE_TEXT}`,
    );
    writeFileSync(
      join(root, "fragments", "notes", "published"),
      "2026-10-01T09:00:00Z\n",
    );
    rmSync(join(root, "platform", "published"));
    expect(composeIn(root, "--out", join(root, "out")).stderr).toBe(
      `jorisjonkers.dev: no publish time recorded beside its reference\n${USAGE_TEXT}`,
    );
  });

  it("asks for a pulled fragment, the commit of a lock it is handed, and every required option", () => {
    const root = pulled();
    const notesRef = readFileSync(
      join(root, "fragments", "notes", "ref"),
      "utf8",
    );
    rmSync(join(root, "fragments", "notes", "ref"));
    expect(composeIn(root, "--out", join(root, "out")).stderr).toBe(
      `${join(root, "fragments", "notes")}: not a pulled fragment\n${USAGE_TEXT}`,
    );
    writeFileSync(join(root, "fragments", "notes", "ref"), notesRef);
    rmSync(join(root, "platform", "ref"));
    expect(composeIn(root, "--out", join(root, "out")).stderr).toBe(
      `${join(root, "platform")}: not a pulled fragment\n${USAGE_TEXT}`,
    );
    writeFileSync(join(root, "platform", "ref"), "ghcr.io/x/y@sha256:0\n");
    writeFileSync(join(root, "platform", "fragment.yml"), "kind: nothing\n");
    expect(composeIn(root, "--out", join(root, "out")).stderr).toBe(
      `${join(root, "platform")}: not a pulled fragment\n${USAGE_TEXT}`,
    );
    rmSync(join(root, "platform", "fragment.yml"));
    expect(composeIn(root, "--out", join(root, "out")).stderr).toBe(
      `${join(root, "platform")}: not a pulled fragment\n${USAGE_TEXT}`,
    );
    expect(
      composeIn(root, "--lock", join(root, "out", "lock.json")).stderr,
    ).toBe(`--lock-commit is required\n${USAGE_TEXT}`);
    expect(run("compose").stderr).toBe(
      `--cluster-state is required\n${USAGE_TEXT}`,
    );
    expect(
      run("compose", "--cluster-state", "x", "--fragments", "y").stderr,
    ).toBe(`--participants is required\n${USAGE_TEXT}`);
  });
});

describe("deploy-kit", () => {
  it("prints the usage of all three commands", () => {
    expect(USAGE_TEXT.split("\n").slice(0, 5)).toEqual([
      "usage:",
      "  deploy-kit --help",
      "  deploy-kit validate <file|directory>... [--json]",
      "  deploy-kit publish <project-file|platform.intent.yml> --repository <owner/name> --source-sha <sha> --version <x.y.z> --out <directory>",
      "                     [--images-lock <file>] [--json]",
    ]);
    expect(USAGE_TEXT).toContain(
      "  deploy-kit compose --fragments <directory> --participants <file> --cluster-state <file>",
    );
    expect(USAGE_TEXT).toContain("[--platform <directory>]");
  });

  it("answers help on stdout, accepted, however it is asked for", () => {
    const help = { code: 0, stdout: USAGE_TEXT, stderr: "" };
    for (const argv of [
      ["--help"],
      ["-h"],
      ["validate", "--help"],
      ["compose", "-h"],
    ])
      expect(run(...argv), argv.join(" ")).toEqual(help);
  });

  it("writes data alone under --json for an accepted run, and its summary for a human", () => {
    const file = example("minimal/notes.project.yml");

    expect(run("validate", file, "--json")).toEqual({
      code: 0,
      stdout: "[]\n",
      stderr: "accepted (1 read)\n",
    });
    expect(run("validate", file)).toEqual({
      code: 0,
      stdout: "accepted (1 read)\n",
      stderr: "",
    });
  });

  it("asks for a command it knows, and an option it knows", () => {
    expect(run()).toEqual({
      code: 2,
      stdout: "",
      stderr: `name a command\n${USAGE_TEXT}`,
    });
    expect(run("bogus").stderr).toBe(`bogus: no such command\n${USAGE_TEXT}`);
    expect(run("validate", "--bogus").stderr).toMatch(
      /^Unknown option '--bogus'/,
    );
  });

  it("leaves a failure that is not a wrong call to the process", () => {
    expect(() => run("validate", join(temporary(), "absent"))).toThrow(
      "ENOENT",
    );
  });
});
