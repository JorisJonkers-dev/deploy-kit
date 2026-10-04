// REQ-047 (docs/requirements.md): a fragment's share of the images lock holds
// the aliases its project file names and no other, and the union of every
// share is one lock, refusing an alias two shares lock differently at the
// share that changed (spec/v1/40-composition.md#fragments).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  composedLock,
  readLock,
  shareOf,
  unionOf,
  type Carrier,
  type Share,
} from "../../src/application/images-lock-shares.ts";
import { parseProjectIntent } from "../../src/application/parse-project-intent.ts";
import type { EffectiveProject } from "../../src/model/effective-intent.ts";
import type {
  ImagesLockDocument,
  LockedImage,
} from "../../src/model/images-lock.ts";

const EXAMPLES = join(
  import.meta.dirname,
  "..",
  "..",
  "spec",
  "v1",
  "examples",
);
const text = (path: string): string =>
  readFileSync(join(EXAMPLES, path), "utf8");

/** A worked project file, lowered. */
function project(file: string, env: readonly string[] = []): EffectiveProject {
  const directory = file.split("/")[0] as string;
  const parsed = parseProjectIntent(
    text(file),
    env.map((path) => ({ path, text: text(`${directory}/${path}`) })),
  );
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.diagnostics));
  return parsed.value.effective;
}

const ESTATE = {
  name: "ci/images.lock.yml",
  text: text("platform/images.lock.yml"),
};
const AUTH = project("auth/auth.project.yml");
const NOTES = project("minimal/notes.project.yml", ["env/notes-api/base.env"]);

const digest = (character: string): string => `sha256:${character.repeat(64)}`;
const image = (character: string, uid = 1000, gid = 1000): LockedImage => ({
  repository: "ghcr.io/jorisjonkers-dev/notes/notes-api",
  digest: digest(character),
  uid,
  gid,
});
const lock = (
  name: string,
  images: Readonly<Record<string, LockedImage>>,
): ImagesLockDocument => ({
  apiVersion: "lock.jorisjonkers.dev/v1",
  kind: "ImagesLock",
  schemaVersion: "1.0.0",
  name,
  images,
});
const share = (
  directory: string,
  changed: boolean,
  images: Readonly<Record<string, LockedImage>>,
): Share => ({ directory, changed, lock: lock(directory, images) });

/** The union's diagnostics, as the documents and aliases they name. */
const refusedAt = (shares: readonly Share[]): string[] => {
  const union = unionOf(shares, "estate", "1.0.0");
  if (union.ok) return [];
  expect(union.diagnostics.map(({ code }) => code)).toEqual(
    union.diagnostics.map(() => "E_IMAGE_LOCK_CONFLICT"),
  );
  return union.diagnostics.map(
    ({ document, path }) => `${String(document)}#${path}`,
  );
};

describe("a project's share of the images lock", () => {
  it("holds every alias the project file names, sorted, and no other", () => {
    const packed = shareOf(ESTATE, AUTH);
    if (!packed.ok) throw new Error(JSON.stringify(packed.diagnostics));

    expect(packed.value).toMatchObject({
      apiVersion: "lock.jorisjonkers.dev/v1",
      kind: "ImagesLock",
      schemaVersion: "1.0.0",
      name: "auth",
    });
    // Two Processes' images and the image of the Application's changelog;
    // none of the fourteen other aliases the estate's lock holds.
    expect(Object.keys(packed.value.images)).toEqual([
      "auth-api",
      "auth-migration",
      "auth-ui",
    ]);
    expect(packed.value.images["auth-ui"]).toEqual({
      repository: "ghcr.io/jorisjonkers-dev/auth/auth-ui",
      digest:
        "sha256:8b0d2f4a6c8e0b2d4f6a8c0e2b4d6f8a0c2e4b6d8f0a2c4e6b8d0f2a4c6e8b0d",
      uid: 101,
      gid: 101,
    });
  });

  it("names a sidecar's image, and each alias once however often it is named", () => {
    const twice: EffectiveProject = {
      ...NOTES,
      applications: NOTES.applications.map((application) => ({
        ...application,
        processes: application.processes.flatMap((process) => [
          { ...process, sidecars: [{ ...process, image: "otel-collector" }] },
          { ...process, name: `${process.name}-again` },
        ]),
      })),
    } as EffectiveProject;
    const packed = shareOf(ESTATE, twice);

    expect(packed.ok && Object.keys(packed.value.images)).toEqual([
      "notes-api",
      "otel-collector",
    ]);
  });

  it("names no migration image for an Application that moves no schema with a changelog", () => {
    const packed = shareOf(ESTATE, NOTES);
    expect(packed.ok && Object.keys(packed.value.images)).toEqual([
      "notes-api",
    ]);
  });

  it("refuses every alias the lock it is handed does not hold", () => {
    const partial = {
      name: "ci/images.lock.yml",
      text: ESTATE.text.replace(/^ {2}auth-ui:\n(?: {4}.*\n)+/m, ""),
    };
    const stripped = {
      name: partial.name,
      text: partial.text.replace(/^ {2}auth-api:\n(?: {4}.*\n)+/m, ""),
    };

    expect(shareOf(stripped, AUTH)).toEqual({
      ok: false,
      diagnostics: ["auth-api", "auth-ui"].map((alias) => ({
        code: "E_UNLOCKED_IMAGE",
        document: "ci/images.lock.yml",
        path: "/images",
        message: `the images lock holds no entry for ${alias}`,
        hint: "Lock every alias the project file names before its fragment is published.",
      })),
    });
  });

  it("refuses a lock that is not one, at the file it was read from", () => {
    const notYaml = readLock("images: [", "notes/images.lock.yml");
    const notALock = shareOf(
      { name: "ci/lock.yml", text: "kind: Other\n" },
      NOTES,
    );

    expect(notYaml.ok).toBe(false);
    expect(!notYaml.ok && notYaml.diagnostics[0]?.document).toBe(
      "notes/images.lock.yml",
    );
    expect(notALock.ok).toBe(false);
    expect(
      !notALock.ok && notALock.diagnostics.map(({ document }) => document),
    ).toContain("ci/lock.yml");
    expect(
      !notALock.ok && new Set(notALock.diagnostics.map(({ code }) => code)),
    ).toEqual(new Set(["schema"]));
  });
});

describe("the union of every share", () => {
  it("is one lock holding every alias once, in alias order, under the name it is given", () => {
    const union = unionOf(
      [
        share("notes", true, { "notes-api": image("a") }),
        share("_platform", false, { vault: image("b"), flagger: image("c") }),
      ],
      "estate",
      "1.2.0",
    );

    expect(union).toEqual({
      ok: true,
      value: {
        apiVersion: "lock.jorisjonkers.dev/v1",
        kind: "ImagesLock",
        schemaVersion: "1.2.0",
        name: "estate",
        images: {
          flagger: image("c"),
          "notes-api": image("a"),
          vault: image("b"),
        },
      },
    });
    expect(union.ok && Object.keys(union.value.images)).toEqual([
      "flagger",
      "notes-api",
      "vault",
    ]);
  });

  it("is an empty lock where no fragment carries a share", () => {
    expect(unionOf([], "estate", "1.0.0")).toMatchObject({
      ok: true,
      value: { images: {} },
    });
  });

  it("takes an alias two shares lock to the same image as one entry", () => {
    const shared = { "otel-collector": image("d", 10001, 10001) };
    const union = unionOf(
      [share("notes", true, shared), share("auth", true, shared)],
      "estate",
      "1.0.0",
    );
    expect(union).toMatchObject({ ok: true, value: { images: shared } });
  });

  it("refuses an alias locked differently in any of the four things a lock records", () => {
    const base = image("a");
    for (const other of [
      { ...base, repository: "ghcr.io/jorisjonkers-dev/other/notes-api" },
      { ...base, digest: digest("b") },
      { ...base, uid: 1001 },
      { ...base, gid: 1001 },
    ])
      expect(
        refusedAt([
          share("_platform", false, { "notes-api": base }),
          share("notes", true, { "notes-api": other }),
        ]),
      ).toEqual(["notes/images.lock.yml#/images/notes-api"]);
  });

  it("refuses the changed share that disagrees with what the unchanged ones hold, and only it", () => {
    expect(
      refusedAt([
        share("_platform", false, { "otel-collector": image("a") }),
        share("auth", false, { "otel-collector": image("a") }),
        share("data", true, { "otel-collector": image("a") }),
        share("notes", true, { "otel-collector": image("b") }),
      ]),
    ).toEqual(["notes/images.lock.yml#/images/otel-collector"]);
  });

  it("refuses every share of an alias nothing unchanged settles", () => {
    expect(
      refusedAt([
        share("data", true, { "otel-collector": image("a") }),
        share("notes", true, { "otel-collector": image("b") }),
      ]),
    ).toEqual([
      "data/images.lock.yml#/images/otel-collector",
      "notes/images.lock.yml#/images/otel-collector",
    ]);

    // Two unchanged shares that disagree settle nothing either: every holder
    // is named, the unchanged ones included, which fails the run.
    expect(
      refusedAt([
        share("_platform", false, { "otel-collector": image("a") }),
        share("auth", false, { "otel-collector": image("b") }),
        share("notes", true, { "otel-collector": image("a") }),
      ]),
    ).toEqual([
      "_platform/images.lock.yml#/images/otel-collector",
      "auth/images.lock.yml#/images/otel-collector",
      "notes/images.lock.yml#/images/otel-collector",
    ]);
  });

  it("says what each side locked the alias to, and where the other one is", () => {
    const union = unionOf(
      [
        share("_platform", false, { "notes-api": image("a") }),
        share("notes", true, { "notes-api": image("b", 1001, 1002) }),
      ],
      "estate",
      "1.0.0",
    );

    expect(union).toEqual({
      ok: false,
      diagnostics: [
        {
          code: "E_IMAGE_LOCK_CONFLICT",
          document: "notes/images.lock.yml",
          path: "/images/notes-api",
          message: `notes-api is locked to ghcr.io/jorisjonkers-dev/notes/notes-api@${digest("b")} as 1001:1002 here, and to ghcr.io/jorisjonkers-dev/notes/notes-api@${digest("a")} as 1000:1000 in _platform/images.lock.yml`,
          hint: "One alias resolves to one image estate-wide: lock the same digest, uid and gid, or name another alias.",
        },
      ],
    });
  });

  it("reports every conflicting alias, in alias order", () => {
    expect(
      refusedAt([
        share("_platform", false, { vault: image("a"), flagger: image("a") }),
        share("notes", true, { vault: image("b"), flagger: image("b") }),
      ]),
    ).toEqual([
      "notes/images.lock.yml#/images/flagger",
      "notes/images.lock.yml#/images/vault",
    ]);
  });
});

describe("the lock a composition resolves from", () => {
  const file = (images: Readonly<Record<string, LockedImage>>, name = "x") => ({
    name: "images.lock.yml",
    text: JSON.stringify(lock(name, images)),
  });
  const platform = (
    images: Readonly<Record<string, LockedImage>> | undefined,
    names: readonly string[] = [],
  ): Carrier => ({
    directory: "_platform",
    changed: false,
    document: "_platform/platform.intent.yml",
    names,
    lock: images === undefined ? undefined : file(images, "estate"),
  });
  const carrier = (
    directory: string,
    names: readonly string[],
    images?: Readonly<Record<string, LockedImage>>,
    changed = true,
  ): Carrier => ({
    directory,
    changed,
    document: `${directory}/${directory}.project.yml`,
    names,
    lock: images === undefined ? undefined : file(images, directory),
  });
  const composed = (own: Carrier, projects: readonly Carrier[]) =>
    composedLock(own, projects, "jorisjonkers.dev", "1.3.0");
  /** What was refused, as code, document and the alias its message names. */
  const refusals = (own: Carrier, projects: readonly Carrier[]): string[] => {
    const result = composed(own, projects);
    return result.ok
      ? []
      : result.diagnostics.map(
          ({ code, document, message }) =>
            `${code} ${String(document)} ${String(/ ([a-z-]+)$/.exec(message)?.[1])}`,
        );
  };

  it("is the platform's lock and every Project's share, named and versioned as it is told", () => {
    expect(
      composed(platform({ vault: image("a") }, ["vault"]), [
        carrier("notes", ["notes-api"], { "notes-api": image("b") }),
        carrier("data", ["postgres"], { postgres: image("c") }, false),
      ]),
    ).toEqual({
      ok: true,
      value: {
        ...lock("jorisjonkers.dev", {
          "notes-api": image("b"),
          postgres: image("c"),
          vault: image("a"),
        }),
        schemaVersion: "1.3.0",
      },
    });
  });

  it("is the Projects' shares alone where the Platform document's fragment carries no lock", () => {
    const result = composed(platform(undefined), [
      carrier("notes", ["notes-api"], { "notes-api": image("a") }),
    ]);
    expect(result.ok && result.value.images).toEqual({
      "notes-api": image("a"),
    });
  });

  it("reads the platform's lock whole, whatever the Platform document names", () => {
    const result = composed(
      platform({ "notes-api": image("a"), vault: image("b") }),
      [carrier("notes", ["notes-api"])],
    );
    expect(result.ok && Object.keys(result.value.images)).toEqual([
      "notes-api",
      "vault",
    ]);
  });

  it("reads a Project's share only for the aliases its own project file names", () => {
    const result = composed(platform({}), [
      carrier("notes", ["notes-api"], {
        "notes-api": image("a"),
        "auth-api": image("b"),
      }),
    ]);
    expect(result.ok && result.value.images).toEqual({
      "notes-api": image("a"),
    });
  });

  it("never resolves a Project from another Project's share", () => {
    // auth names notes-api itself and locks it; notes names it and locks
    // nothing. What auth locked is auth's, and notes is unlocked.
    expect(
      refusals(platform({}), [
        carrier("auth", ["notes-api"], { "notes-api": image("a") }),
        carrier("notes", ["notes-api"]),
      ]),
    ).toEqual(["E_UNLOCKED_IMAGE notes/notes.project.yml notes-api"]);
  });

  it("never resolves the Platform document from a Project's share", () => {
    expect(
      refusals(platform({}, ["postgres-backup"]), [
        carrier("data", ["postgres-backup"], { "postgres-backup": image("a") }),
      ]),
    ).toEqual([
      "E_UNLOCKED_IMAGE _platform/platform.intent.yml postgres-backup",
    ]);
    expect(refusals(platform(undefined, ["postgres-backup"]), [])).toEqual([
      "E_UNLOCKED_IMAGE _platform/platform.intent.yml postgres-backup",
    ]);
  });

  it("resolves a Project from the platform's lock where its own share does not lock the alias", () => {
    expect(
      refusals(platform({ "notes-api": image("a"), flagger: image("b") }), [
        carrier("notes", ["notes-api"]),
        carrier("delivery", ["flagger", "release-gate"], {
          "release-gate": image("c"),
        }),
      ]),
    ).toEqual([]);
  });

  it("names every alias no lock a document is resolved from holds, at that document", () => {
    const result = composed(platform({}), [
      carrier("auth", ["auth-api", "auth-ui"], { "auth-ui": image("a") }),
    ]);
    expect(result).toEqual({
      ok: false,
      diagnostics: [
        {
          code: "E_UNLOCKED_IMAGE",
          document: "auth/auth.project.yml",
          path: "",
          message:
            "no lock this document is resolved from holds an entry for auth-api",
          hint: "Lock the alias in this fragment's own share or in the Platform document's lock: a fragment is never resolved from another Project's share.",
        },
      ],
    });
  });

  it("takes nothing from the share of a fragment whose project file names nothing", () => {
    const result = composed(platform({}), [
      carrier("broken", [], { "notes-api": image("a") }),
    ]);
    expect(result.ok && result.value.images).toEqual({});
  });

  it("refuses a share that cannot be read at its own file, and still checks the others", () => {
    const unreadable: Carrier = {
      ...carrier("notes", ["notes-api"]),
      lock: { name: "images.lock.yml", text: "images: [" },
    };
    const result = composed(platform({}), [
      unreadable,
      carrier("auth", ["auth-api"]),
    ]);
    expect(
      !result.ok && result.diagnostics.map(({ document }) => document),
    ).toEqual(["notes/images.lock.yml", "auth/auth.project.yml"]);
  });

  it("stops at a Platform document's lock that cannot be read", () => {
    const result = composed(
      {
        ...platform(undefined, ["vault"]),
        lock: { name: "images.lock.yml", text: "images: [" },
      },
      [carrier("notes", ["notes-api"])],
    );
    expect(
      !result.ok && result.diagnostics.map(({ document }) => document),
    ).toEqual(["_platform/images.lock.yml"]);
  });

  it("refuses a changed share that disagrees with the platform's lock, and not one that already composed", () => {
    const own = platform({ "otel-collector": image("a") });
    const conflicts = (changed: boolean) => {
      const result = composed(own, [
        carrier(
          "notes",
          ["otel-collector"],
          { "otel-collector": image("b") },
          changed,
        ),
      ]);
      return result.ok
        ? []
        : result.diagnostics.map(
            ({ code, document }) => `${code} ${String(document)}`,
          );
    };

    expect(conflicts(true)).toEqual([
      "E_IMAGE_LOCK_CONFLICT notes/images.lock.yml",
    ]);
    expect(conflicts(false)).toEqual([
      "E_IMAGE_LOCK_CONFLICT _platform/images.lock.yml",
      "E_IMAGE_LOCK_CONFLICT notes/images.lock.yml",
    ]);
  });
});
