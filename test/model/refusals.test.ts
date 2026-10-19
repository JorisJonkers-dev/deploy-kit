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

describe("a generated key", () => {
  const grant = (path: string): string =>
    `      - path: ${path}\n        keys: [plain, { name: session_key, generate: {} }]\n        access: read\n        delivery: env\n        rotation: { tolerates: restart }\n`;

  it("is accepted under its own Project's prefix", () => {
    expect(
      refusalsOf(
        withApplicationGrant(grant("secret/data/refusals-system/app")),
      ),
    ).toStrictEqual([]);
  });

  it.each([
    ["another Project's prefix", "secret/data/auth-system/app"],
    ["a shared platform path", "secret/data/platform/batch"],
    ["the prefix itself", "secret/data/refusals-system"],
    [
      "a path that climbs out",
      "secret/data/refusals-system/../auth-system/app",
    ],
    ["a path that stays put", "secret/data/refusals-system/./app"],
    ["an empty segment", "secret/data/refusals-system//app"],
  ])("is refused under %s", (_, path) => {
    expect(refusalsOf(withApplicationGrant(grant(path)))).toStrictEqual([
      {
        code: "E_GENERATED_KEY_OUTSIDE_PROJECT",
        path: "/applications/0/secrets/0/keys/1",
      },
    ]);
  });
});

describe("a generated key declared for the whole project", () => {
  it("is refused under another Project's prefix", () => {
    expect(
      refusalsOf(
        DOCUMENT.replace("GRANTS", "").replace(
          "applications:\n",
          "secrets:\n  - path: secret/data/platform/batch\n    keys: [{ name: k, generate: {} }]\n    access: read\n    delivery: self\n    rotation: { tolerates: restart }\napplications:\n",
        ),
      ),
    ).toStrictEqual([
      { code: "E_GENERATED_KEY_OUTSIDE_PROJECT", path: "/secrets/0/keys/0" },
    ]);
  });
});

describe("a generated key that adopts a value", () => {
  const OLD = `      - path: secret/data/platform/batch\n        keys: [session_key]\n        access: read\n        delivery: env\n        rotation: { tolerates: restart }\n`;
  const grant = (adopt: string): string =>
    `      - path: secret/data/refusals-system/app\n        keys: [{ name: session_key, generate: { adopt: "${adopt}" } }]\n        access: read\n        delivery: env\n        rotation: { tolerates: restart }\n`;

  it("is accepted from a path a grant of its Project reads", () => {
    expect(
      refusalsOf(
        withApplicationGrant(
          OLD + grant("secret/data/platform/batch#session_key"),
        ),
      ),
    ).toStrictEqual([]);
  });

  it("is refused from a path no grant of its Project reads", () => {
    expect(
      refusalsOf(
        withApplicationGrant(grant("secret/data/platform/batch#session_key")),
      ),
    ).toStrictEqual([
      {
        code: "E_GENERATED_KEY_ADOPTS_UNGRANTED",
        path: "/applications/0/secrets/0/keys/0/generate",
      },
    ]);
  });

  it.each([
    ["no key", "secret/data/platform/batch"],
    ["an empty key", "secret/data/platform/batch#"],
    ["no kv mount", "sys/policies/acl/root#policy"],
    [
      "a path that climbs out",
      "secret/data/../../sys/policies/acl/root#policy",
    ],
    ["a segment that stays put", "secret/data/./platform#key"],
    ["an empty segment", "secret/data/platform//batch#key"],
  ])("is malformed with %s", (_, adopt) => {
    expect(
      refusalsOf(withApplicationGrant(OLD + grant(adopt))).map(
        ({ code }) => code,
      ),
    ).toStrictEqual(["schema"]);
  });
});

describe("an edge's credential delivered to the environment", () => {
  const edge = (tolerates: string) =>
    DOCUMENT.replace(
      "        cutover: interrupted\n",
      `        cutover: interrupted\n        dependsOn:\n          - application: platform-postgres\n            surface: postgres\n            credentials: { delivery: env, rotation: { tolerates: ${tolerates} } }\n`,
    ).replace("GRANTS", "");

  it("is refused where it tolerates a reload, and accepted where it tolerates a restart", () => {
    expect(refusalsOf(edge("reload"))).toStrictEqual([
      {
        code: "E_ENV_CANNOT_RELOAD",
        path: "/applications/0/processes/0/dependsOn/0/credentials/rotation",
      },
    ]);
    expect(refusalsOf(edge("restart"))).toStrictEqual([]);
  });

  it("says why, at the Application and the project as at the Process", () => {
    const declared = (at: string) =>
      `      - application: platform-postgres\n        surface: postgres\n        credentials: { delivery: env, rotation: { tolerates: reload } }\n`.replace(
        /^ {4}/gm,
        at,
      );
    const result = parseProjectIntent(
      DOCUMENT.replace("GRANTS", "")
        .replace(
          "  - id: batch\n",
          `  - id: batch\n    dependsOn:\n${declared("    ").replace("platform-postgres", "other-postgres")}`,
        )
        .replace(
          "applications:\n",
          `dependsOn:\n${declared("")}applications:\n`,
        ),
    );

    expect(result.ok ? [] : result.diagnostics).toStrictEqual([
      {
        code: "E_ENV_CANNOT_RELOAD",
        path: "/dependsOn/0/credentials/rotation",
        message: "an environment variable cannot be reloaded without a restart",
        hint: "Tolerate a restart, or let the application read its credential itself.",
      },
      {
        code: "E_ENV_CANNOT_RELOAD",
        path: "/applications/0/dependsOn/0/credentials/rotation",
        message: "an environment variable cannot be reloaded without a restart",
        hint: "Tolerate a restart, or let the application read its credential itself.",
      },
    ]);
  });

  it("is delivered to a file only with the directory and the mode its files land at", () => {
    const result = parseProjectIntent(
      edge("restart").replace("delivery: env", "delivery: file"),
    );

    expect(result.ok ? [] : result.diagnostics).toStrictEqual([
      {
        code: "schema",
        path: "/applications/0/processes/0/dependsOn/0/credentials",
        message:
          "an edge delivers its credential to a file only with `mountAt` and `fileMode`",
        hint: "Name the directory its `username` and `password` files land in, and their mode.",
      },
    ]);
  });

  it.each([
    ["a directory but no mode", "mountAt: /run/secrets/database"],
    ["a mode but no directory", 'fileMode: "0400"'],
  ])("is refused to a file with %s", (_, field) => {
    expect(
      refusalsOf(
        edge("restart").replace("delivery: env", `delivery: file, ${field}`),
      ),
    ).toStrictEqual([
      {
        code: "schema",
        path: "/applications/0/processes/0/dependsOn/0/credentials",
      },
    ]);
  });

  it("is accepted to a file with a directory and a mode", () => {
    expect(
      refusalsOf(
        edge("restart").replace(
          "delivery: env",
          'delivery: file, mountAt: /run/secrets/database, fileMode: "0400"',
        ),
      ),
    ).toStrictEqual([]);
  });
});

describe("internet egress", () => {
  const egress = (value: string): string =>
    DOCUMENT.replace("GRANTS", "").replace(
      "        cutover: interrupted\n",
      `        cutover: interrupted\n        egress: ${value}\n`,
    );

  it("is accepted with a reason", () => {
    expect(
      refusalsOf(
        egress("{ to: internet, reason: workflows call public APIs }"),
      ),
    ).toStrictEqual([]);
  });

  it.each([
    [
      "no reason",
      "{ to: internet }",
      "/applications/0/processes/0/egress/reason",
    ],
    [
      "an empty reason",
      '{ to: internet, reason: "" }',
      "/applications/0/processes/0/egress/reason",
    ],
    [
      "a destination outside the vocabulary",
      "{ to: lan, reason: x }",
      "/applications/0/processes/0/egress/to",
    ],
    [
      "an authored range",
      "{ to: internet, reason: x, cidr: 192.0.2.0/24 }",
      "/applications/0/processes/0/egress/cidr",
    ],
  ])("is refused with %s", (_, value, path) => {
    expect(refusalsOf(egress(value))).toStrictEqual([{ code: "schema", path }]);
  });
});

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

describe("a library mount", () => {
  const granted = (edit: (text: string) => string) =>
    checkIntentSet(
      filesOf("library-not-granted").map((file) =>
        file.name === "platform.intent.yml"
          ? { ...file, text: edit(file.text) }
          : file,
      ),
    );
  const codesOf = (result: ReturnType<typeof checkIntentSet>) =>
    result.ok
      ? []
      : result.diagnostics.map(({ code, path }) => ({ code, path }));
  const AT = "/applications/0/processes/0/libraries/0";

  it("is accepted where the library grants the project write", () => {
    expect(
      granted((text) => text.replace("refusals: read", "refusals: write")).ok,
    ).toBe(true);
  });

  it("is accepted where it mounts read and the library grants read", () => {
    expect(
      checkIntentSet(
        filesOf("library-not-granted").map((file) =>
          file.name === "refusals.project.yml"
            ? {
                ...file,
                text: file.text.replace("access: write", "access: read"),
              }
            : file,
        ),
      ).ok,
    ).toBe(true);
  });

  it("says whether the project is granted nothing or only read", () => {
    const messagesOf = (result: ReturnType<typeof checkIntentSet>) =>
      result.ok ? [] : result.diagnostics.map(({ message }) => message);

    expect(messagesOf(granted((text) => text))).toStrictEqual([
      "the library media grants the project refusals read, and the Process mounts it write",
    ]);
    expect(
      messagesOf(
        granted((text) => text.replace("refusals: read", "jellyfin: write")),
      ),
    ).toStrictEqual(["the library media grants the project refusals nothing"]);
  });

  it("is refused where the library grants the project nothing, though it grants another", () => {
    expect(
      codesOf(
        granted((text) => text.replace("refusals: read", "jellyfin: write")),
      ),
    ).toStrictEqual([{ code: "E_LIBRARY_NOT_GRANTED", path: AT }]);
  });

  it("is refused where the project or the library is named for something every object holds", () => {
    expect(
      codesOf(
        granted((text) => text.replace("refusals: read", "toString: write")),
      ),
    ).toStrictEqual([{ code: "E_LIBRARY_NOT_GRANTED", path: AT }]);
    expect(
      codesOf(
        checkIntentSet(
          filesOf("unknown-library").map((file) =>
            file.name === "refusals.project.yml"
              ? {
                  ...file,
                  text: file.text.replace(
                    "library: media",
                    "library: toString",
                  ),
                }
              : file,
          ),
        ),
      ),
    ).toStrictEqual([{ code: "E_UNKNOWN_LIBRARY", path: AT }]);
  });
});

describe("the refusal fixtures", () => {
  it("are the ones this chapter carries, refused but for the accepted counterpart", () => {
    expect(fixtures).toStrictEqual([
      "alert-class-without-signal",
      "asset-not-found",
      "backup-surface-not-provided",
      "credentials-without-database",
      "cutover-continuous-over-rwo",
      "cutover-interrupted-over-rwo",
      "cutover-missing",
      "cutover-mixed",
      "duplicate-route-match",
      "durability-policy-incomplete",
      "durability-without-engine",
      "engine-owns-databases",
      "engine-without-durability",
      "env-cannot-reload",
      "generated-key-adopts-granted",
      "generated-key-adopts-ungranted",
      "generated-key-outside-project",
      "generated-key-twice",
      "generated-key-written-elsewhere",
      "handover-both-paths",
      "handover-serving",
      "handover-unlisted",
      "illegal-delivery-for-access",
      "library-not-granted",
      "migration-owner-duplicated",
      "migration-undeclared",
      "migration-ungated",
      "migration-without-database",
      "no-delivery-policy",
      "no-durability-policy",
      "no-engine-policy",
      "no-forward-auth-endpoint",
      "no-migration-policy",
      "no-secret-store",
      "no-tier-for-audience",
      "non-kv-delivery",
      "owner-role-granted",
      "placement-incomplete",
      "prepare-forward-only",
      "prepare-process-serves",
      "process-rbac-grant",
      "profile-key-authored",
      "release-unit-no-readiness",
      "scrape-unknown-process",
      "secrets-at-rest-required",
      "secrets-at-rest-required-at-header",
      "shared-declaration-duplicated",
      "shared-intent-merged",
      "shared-quantity",
      "unauthorised-secret-reference",
      "unbound-secret-grant",
      "unknown-api-holder",
      "unknown-library",
      "unknown-machinery",
      "unknown-surface",
      "unknown-telemetry-collector",
      "unknown-tier-proxy",
      "unresolved-placeholder",
    ]);
    expect(refused).toHaveLength(53);
    expect(
      fixtures.length - refused.length,
      "the five accepted counterparts carry no oracle",
    ).toBe(5);
  });

  it("accepts a generated key adopting a value its Project already reads", () => {
    expect(checkIntentSet(filesOf("generated-key-adopts-granted")).ok).toBe(
      true,
    );
  });

  it("accepts a Postgres on a volume whose durability derives no backup, because its catalog derives", () => {
    expect(checkIntentSet(filesOf("engine-owns-databases")).ok).toBe(true);
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
