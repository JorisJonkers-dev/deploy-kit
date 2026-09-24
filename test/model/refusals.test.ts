// REQ-024 (docs/requirements.md): a document, or a set of documents read
// together, that breaks a rule is refused with the code, the document and the
// path its committed diagnostics oracle names.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  checkIntentSet,
  parseProjectIntent,
  type AuthoredFile,
} from "../../src/index.ts";

const REFUSALS = join(
  import.meta.dirname,
  "..",
  "..",
  "spec",
  "v1",
  "examples",
  "refusals",
);

const isCase = (name: string): boolean =>
  statSync(join(REFUSALS, name), { throwIfNoEntry: false })?.isDirectory() ===
  true;

/** A fixture is one project file, or a directory of documents read together. */
const fixtures = readdirSync(REFUSALS)
  .filter((name) => name.endsWith(".project.yml") || isCase(name))
  .map((name) => name.replace(".project.yml", ""))
  .sort();

/** The authored files a fixture holds, by the names its oracle calls them. */
const filesOf = (stem: string): AuthoredFile[] =>
  isCase(stem)
    ? readdirSync(join(REFUSALS, stem), {
        recursive: true,
        encoding: "utf8",
      })
        .filter((name) => statSync(join(REFUSALS, stem, name)).isFile())
        .map((name) => ({
          name: name.split(sep).join("/"),
          text: readFileSync(join(REFUSALS, stem, name), "utf8"),
        }))
    : [
        {
          name: `${stem}.project.yml`,
          text: readFileSync(join(REFUSALS, `${stem}.project.yml`), "utf8"),
        },
      ];

const read = (name: string): string =>
  readFileSync(join(REFUSALS, name), "utf8");

const oracle = (stem: string): string | undefined => {
  const file = `${stem}.diagnostics.json`;
  return readdirSync(REFUSALS).includes(file) ? read(file) : undefined;
};

const refused = fixtures.filter((stem) => oracle(stem) !== undefined);

const DOCUMENT = `apiVersion: intent.jorisjonkers.dev/v1
kind: Project
schemaVersion: 1.0.0
project: refusals
owner: joris
applications:
  - id: batch
GRANTS    processes:
      - name: worker
        lifecycle: job
        image: worker
        runtime: none
        placement: { memory: 64Mi, cpu: 10m }
        cutover: interrupted
`;

/** The document above with `secrets` on the Application, indented as the file reads. */
const withApplicationGrant = (grant: string): string =>
  DOCUMENT.replace("GRANTS", `    secrets:\n${grant}`);

const refusalsOf = (text: string): { code: string; path: string }[] => {
  const result = parseProjectIntent(text);
  return result.ok
    ? []
    : result.diagnostics.map(({ code, path }) => ({ code, path }));
};

describe("the access by delivery matrix", () => {
  it.each([
    ["self-renew", "env"],
    ["custody", "env"],
    ["custody", "file"],
  ])("refuses access %s delivered as %s", (access, delivery) => {
    const grant = `      - path: secret/data/batch\n        keys: [password]\n        access: ${access}\n        delivery: ${delivery}\n        mountAt: /run/secrets/password\n        rotation: { tolerates: restart }\n`;

    expect(refusalsOf(withApplicationGrant(grant))).toStrictEqual([
      {
        code: "E_ILLEGAL_DELIVERY_FOR_ACCESS",
        path: "/applications/0/secrets/0",
      },
    ]);
  });

  it.each([
    ["read", "env"],
    ["read", "file"],
    ["self-renew", "self"],
    ["self-roll", "file"],
  ])("accepts access %s delivered as %s", (access, delivery) => {
    const grant = `      - path: secret/data/batch\n        keys: [password]\n        access: ${access}\n        delivery: ${delivery}\n        mountAt: /run/secrets/password\n        rotation: { tolerates: restart }\n`;

    expect(refusalsOf(withApplicationGrant(grant))).toStrictEqual([]);
  });

  it("points at the Application's own grant when the grant is the Application's", () => {
    const grant = `      - path: secret/data/batch\n        keys: [password]\n        access: read\n        delivery: env\n        rotation: { tolerates: reload }\n`;

    expect(refusalsOf(withApplicationGrant(grant))).toStrictEqual([
      {
        code: "E_ENV_CANNOT_RELOAD",
        path: "/applications/0/secrets/0/rotation",
      },
    ]);
  });
});

describe("the refusal fixtures", () => {
  it("are the ones this chapter carries, refused but for the accepted counterpart", () => {
    expect(fixtures).toStrictEqual([
      "alert-class-unknown",
      "alert-class-without-signal",
      "credentials-without-database",
      "cutover-continuous-over-rwo",
      "cutover-interrupted-over-rwo",
      "cutover-missing",
      "cutover-mixed",
      "duplicate-route-match",
      "durability-without-engine",
      "engine-without-durability",
      "env-cannot-reload",
      "handover-both-paths",
      "handover-unlisted",
      "illegal-delivery-for-access",
      "migration-owner-duplicated",
      "migration-undeclared",
      "migration-without-database",
      "no-delivery-policy",
      "no-durability-policy",
      "no-engine-policy",
      "no-forward-auth-endpoint",
      "no-migration-policy",
      "no-tier-for-audience",
      "non-kv-delivery",
      "owner-role-granted",
      "placement-incomplete",
      "prepare-forward-only",
      "prepare-process-serves",
      "scrape-unknown-process",
      "secrets-at-rest-required",
      "secrets-at-rest-required-at-header",
      "shared-declaration-duplicated",
      "shared-intent-merged",
      "shared-quantity",
      "unknown-machinery",
      "unknown-surface",
      "unknown-tier-proxy",
    ]);
    expect(refused).toHaveLength(33);
    expect(
      fixtures.length - refused.length,
      "the three accepted counterparts and the vocabulary case carry no oracle",
    ).toBe(4);
  });

  it.each(refused)(
    "%s is refused with the codes, documents and paths its oracle names",
    (stem) => {
      const result = checkIntentSet(filesOf(stem));
      const entries = result.ok
        ? []
        : result.diagnostics
            .map(({ code, document, path }) => ({ code, document, path }))
            .sort((a, b) =>
              `${a.code}${a.document}${a.path}` <
              `${b.code}${b.document}${b.path}`
                ? -1
                : 1,
            );

      expect(canonicalJson(entries)).toBe(oracle(stem));
    },
  );

  it("accepts a prepare Process that serves nothing, and keeps the shared cutover off it", () => {
    const result = parseProjectIntent(read("prepare-forward-only.project.yml"));
    const processes = result.ok
      ? result.value.effective.applications[0]?.processes
      : undefined;

    expect(oracle("prepare-forward-only")).toBeUndefined();
    expect(
      processes?.map(({ name, lifecycle, cutover }) => ({
        name,
        lifecycle,
        cutover,
      })),
    ).toStrictEqual([
      { name: "api", lifecycle: "application", cutover: "continuous" },
      { name: "seed", lifecycle: "prepare", cutover: undefined },
    ]);
  });

  it("accepts the counterpart that declares the cutover its storage can honour", () => {
    expect(
      parseProjectIntent(read("cutover-interrupted-over-rwo.project.yml")).ok,
    ).toBe(true);
    expect(oracle("cutover-interrupted-over-rwo")).toBeUndefined();
  });

  it.each(refused)("%s says what it refused and how to fix it", (stem) => {
    const result = checkIntentSet(filesOf(stem));
    const diagnostics = result.ok ? [] : result.diagnostics;

    expect(diagnostics).not.toHaveLength(0);
    for (const { message, hint } of diagnostics) {
      expect(message.trim()).not.toBe("");
      expect(hint.trim()).not.toBe("");
    }
  });
});
