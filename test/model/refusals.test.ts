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
import {
  IMAGES_LOCK,
  shareOf,
} from "../../src/application/images-lock-shares.ts";

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

/**
 * A fixture's set read together and, where it holds an images lock, each
 * project file's share then packed from that lock, as the publish step packs
 * it (spec/v1/40-composition.md#fragments).
 */
function outcome(stem: string): ReturnType<typeof checkIntentSet> {
  const files = filesOf(stem);
  const checked = checkIntentSet(files);
  const lock = files.find(({ name }) => name === IMAGES_LOCK);
  if (!checked.ok || lock === undefined) return checked;
  const diagnostics = checked.value.projects.flatMap((project) => {
    const share = shareOf(lock, project);
    return share.ok ? [] : share.diagnostics;
  });
  return diagnostics.length > 0 ? { ok: false, diagnostics } : checked;
}

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

// REQ-097: a node listens on a port and a protocol once, and on as many as
// its exposures dial.
describe("two exposures on one node", () => {
  it("are accepted on different ports", () => {
    expect(
      checkIntentSet(
        filesOf("node-port-taken").map((file) =>
          file.name === "refusals.project.yml"
            ? {
                ...file,
                text: file.text.replace(
                  "{address: mail-node, port: 25, protocol: tcp, process: mail-b,",
                  "{address: mail-node, port: 26, protocol: tcp, process: mail-b,",
                ),
              }
            : file,
        ),
      ).ok,
    ).toBe(true);
  });
});

// REQ-097: delivery machinery cuts over rolling, never a pod more, so a host
// port honours its continuous cutover; only a blue/green switch is refused.
describe("a continuous cutover on a node address", () => {
  it("is refused under a platform with no delivery policy, which names no machinery", () => {
    const result = checkIntentSet(
      filesOf("node-address-continuous").map((file) =>
        file.name === "platform.intent.yml"
          ? {
              ...file,
              text: file.text.replace(/\ndelivery:\n( {2}.*\n)+/, "\n"),
            }
          : file,
      ),
    );
    expect(
      result.ok ? [] : result.diagnostics.map(({ code }) => code),
    ).toContain("E_CUTOVER_UNHONOURABLE");
  });

  it("is accepted where the Application is delivery machinery", () => {
    expect(
      checkIntentSet(
        filesOf("node-address-continuous").map((file) =>
          file.name === "platform.intent.yml"
            ? {
                ...file,
                text: file.text.replace(
                  "machinery: [refusals/edge-proxy]",
                  "machinery: [refusals/edge-proxy, refusals/mail]",
                ),
              }
            : file,
        ),
      ).ok,
    ).toBe(true);
  });
});

// REQ-099: a tier's proxy provides the surfaces its listener reaches.
describe("a tier whose proxy lacks its surface", () => {
  it("says which surfaces the listener reaches", () => {
    const result = checkIntentSet(filesOf("tier-surface-missing"));
    expect(
      result.ok
        ? []
        : result.diagnostics.map(({ message, hint }) => ({ message, hint })),
    ).toStrictEqual([
      {
        message:
          "no Process of refusals/edge-proxy provides web, which tier lan's plain listener reaches",
        hint: "Provide the surfaces on the proxy's Process, or name a proxy that provides them.",
      },
    ]);
  });

  it("names both surfaces of a tls listener", () => {
    const result = checkIntentSet(
      filesOf("tier-surface-missing").map((file) =>
        file.name === "platform.intent.yml"
          ? {
              ...file,
              text: file.text.replace("listener: plain", "listener: tls"),
            }
          : file,
      ),
    );
    expect(
      result.ok ? [] : result.diagnostics.map(({ message }) => message),
    ).toContain(
      "no Process of refusals/edge-proxy provides web and websecure, which tier lan's tls listener reaches",
    );
  });
});

// REQ-097: a node's port is taken across Projects as much as within one.
describe("two Projects on one node port", () => {
  it("are both refused, though their Processes share a name", () => {
    const files = filesOf("node-port-taken");
    const project = files.find(({ name }) => name === "refusals.project.yml");
    if (project === undefined) throw new Error("no project file");
    const other = {
      name: "other.project.yml",
      text: project.text
        .replace("project: refusals", "project: other")
        // Application ids are the estate's; the Process keeps its name.
        .replace("- id: mail-a", "- id: mail-x")
        .replace(/\n {2}- id: mail-b\n(.*\n)*?(?= {2}- id: )/, "\n")
        .replace(/\n {2}- id: edge-proxy\n(.*\n?)*$/, "\n"),
    };
    const result = checkIntentSet([
      ...files.map((file) =>
        file.name === "refusals.project.yml"
          ? {
              ...file,
              text: file.text.replace(
                /\n {2}- id: mail-b\n(.*\n)*?(?= {2}- id: )/,
                "\n",
              ),
            }
          : file,
      ),
      other,
    ]);
    expect(
      result.ok
        ? []
        : result.diagnostics.map(({ code, document, path }) => ({
            code,
            document,
            path,
          })),
    ).toStrictEqual([
      {
        code: "E_NODE_PORT_TAKEN",
        document: "refusals.project.yml",
        path: "/applications/0/l4Exposure/0",
      },
      {
        code: "E_NODE_PORT_TAKEN",
        document: "other.project.yml",
        path: "/applications/0/l4Exposure/0",
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

describe("a claim", () => {
  /** One Process `store` with an engine, declaring `volumes` as given. */
  const withVolumes = (...volumes: readonly [string, string][]): string =>
    `apiVersion: intent.jorisjonkers.dev/v1
kind: Project
schemaVersion: 1.0.0
project: refusals
owner: joris
applications:
  - id: store
    processes:
      - name: store
        lifecycle: job
        image: store
        runtime: none
        engine: files
        placement: { memory: 64Mi, cpu: 10m }
        cutover: interrupted
        volumes:
${volumes
  .map(
    ([claim, durability], index) =>
      `          - { claim: ${claim}, mountAt: /v${String(index)}, size: 1Gi, durability: ${durability} }\n`,
  )
  .join("")}`;

  it("declared twice by one Process is refused at the second volume", () => {
    expect(
      refusalsOf(
        withVolumes(["data", "recoverable"], ["data", "reconstructible"]),
      ),
    ).toStrictEqual([
      {
        code: "E_DUPLICATE_CLAIM",
        path: "/applications/0/processes/0/volumes/1",
      },
    ]);
  });

  it("is refused where a later volume's backup claim takes an earlier volume's name", () => {
    expect(
      refusalsOf(
        withVolumes(
          ["data-backup", "reconstructible"],
          ["data", "recoverable"],
        ),
      ),
    ).toStrictEqual([
      {
        code: "E_DUPLICATE_CLAIM",
        path: "/applications/0/processes/0/volumes/1",
      },
    ]);
  });

  it("is reserved by no Process that declares no volume", () => {
    const process = (name: string): string =>
      `      - name: ${name}\n        lifecycle: job\n        image: ${name}\n        runtime: none\n        placement: { memory: 64Mi, cpu: 10m }\n        cutover: interrupted\n`;
    expect(
      refusalsOf(
        DOCUMENT.replace("GRANTS", "").replace(
          / {4}processes:\n[^]*$/,
          `    processes:\n${process("first")}${process("second")}`,
        ),
      ),
    ).toStrictEqual([]);
  });

  it("ending in -backup is accepted beside its stem where neither derives a backup", () => {
    expect(
      refusalsOf(
        withVolumes(
          ["data", "reconstructible"],
          ["data-backup", "reconstructible"],
          ["logs", "irreplaceable"],
        ),
      ),
    ).toStrictEqual([]);
  });
});

describe("the refusal fixtures", () => {
  it("are the ones this chapter carries, refused but for the accepted counterpart", () => {
    expect(fixtures).toStrictEqual([
      "acme-proxy-replicated",
      "alert-rules-not-found",
      "alert-rules-outside-monitoring",
      "alert-rules-without-groups",
      "asset-not-found",
      "backup-surface-not-provided",
      "buckets-without-object-store",
      "catalog-surface-not-provided",
      "certificate-from-repeated",
      "certificate-from-unserved",
      "client-crd-not-bootstrapped",
      "client-path-unrouted",
      "client-placeholder-without-secret",
      "credentials-without-database",
      "cutover-continuous-over-rwo",
      "cutover-interrupted-over-rwo",
      "cutover-missing",
      "cutover-mixed",
      "dashboard-not-found",
      "dashboard-without-uid",
      "duplicate-backup-claim",
      "duplicate-claim",
      "duplicate-dashboard-uid",
      "duplicate-human-grant",
      "duplicate-l4-port",
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
      "image-runs-as-root",
      "l4-address-exhausted",
      "library-not-granted",
      "migration-owner-duplicated",
      "migration-undeclared",
      "migration-ungated",
      "migration-without-database",
      "mongo-credentials-without-database",
      "mongo-without-durability",
      "no-acme-policy",
      "no-api-access-policy",
      "no-dashboard-policy",
      "no-delivery-policy",
      "no-direct-target",
      "no-durability-policy",
      "no-engine-policy",
      "no-forward-auth-endpoint",
      "no-migration-policy",
      "no-secret-store",
      "no-sign-in-provider",
      "no-tier-for-audience",
      "no-upstream-nameservers",
      "no-vpn-policy",
      "node-address-continuous",
      "node-address-replicated",
      "node-port-taken",
      "non-kv-delivery",
      "operated-process",
      "owner-role-granted",
      "placement-incomplete",
      "prepare-forward-only",
      "prepare-process-serves",
      "process-rbac-grant",
      "profile-key-authored",
      "redirect-loop",
      "release-unit-no-readiness",
      "schedule-missing",
      "schedule-unscheduled",
      "scheduled-process-serves",
      "scrape-unknown-process",
      "secrets-at-rest-required",
      "secrets-at-rest-required-at-header",
      "self-without-vault-client",
      "shared-declaration-duplicated",
      "shared-intent-merged",
      "shared-quantity",
      "surface-label-invalid",
      "tier-class-unfiltered",
      "tier-surface-missing",
      "tier-without-ingress-class",
      "unauthorised-secret-reference",
      "unbound-secret-grant",
      "unknown-api-holder",
      "unknown-critical-application",
      "unknown-enrolled-project",
      "unknown-forward-auth-provider",
      "unknown-l4-address",
      "unknown-library",
      "unknown-machinery",
      "unknown-monitoring-application",
      "unknown-receiver",
      "unknown-surface",
      "unknown-telemetry-collector",
      "unknown-tier-proxy",
      "unresolved-placeholder",
    ]);
    expect(refused).toHaveLength(100);
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

  it("refuses a Process once, naming every surface no consumer label can name", () => {
    const [file] = filesOf("surface-label-invalid");
    const result = checkIntentSet([
      {
        name: file?.name as string,
        text: (file?.text as string).replace(
          "          http: 8080\n",
          "          http: 8080\n          grpc: 9090\n",
        ),
      },
    ]);
    const id =
      "surface-label-invalid-an-application-whose-id-runs-past-the-limit";

    expect(
      result.ok
        ? []
        : result.diagnostics.map(({ code, message }) => [code, message]),
    ).toStrictEqual([
      [
        "E_SURFACE_LABEL_INVALID",
        `${id}.http, ${id}.grpc cannot name a label: at most 63 characters of letters, digits, '-', '_' and '.', starting and ending with a letter or digit`,
      ],
    ]);
  });

  /** A fixture's set with each file's text edited, refused with `code` where. */
  const codeIn = (
    stem: string,
    code: string,
    edit: (text: string) => string,
  ): string[] => {
    const result = checkIntentSet(
      filesOf(stem).map((file) => ({ ...file, text: edit(file.text) })),
    );
    return result.ok
      ? []
      : result.diagnostics
          .filter((diagnostic) => diagnostic.code === code)
          .map(({ path }) => path);
  };

  // REQ-160 (docs/requirements.md): the operator runs a monitoring role's
  // Process only as one interrupted Process with one surface and flags of its own.
  it("refuses an argument of a monitoring role's Process that is not a flag", () => {
    expect(
      codeIn("operated-process", "E_OPERATED_PROCESS", (text) =>
        text.replace("--storage.tsdb.retention.time=15d", "retention"),
      ),
    ).toStrictEqual([
      "/applications/0/processes/0/cutover",
      "/applications/0/processes/0/args/0",
      "/applications/0/processes/0/args/1",
      "/applications/1/processes/0/provides",
    ]);
  });

  it("says what the operator cannot run of each monitoring role's Process, and how to fix it", () => {
    const result = checkIntentSet(
      filesOf("operated-process").map((file) => ({
        ...file,
        text: file.text.replace(
          "--storage.tsdb.retention.time=15d",
          "retention",
        ),
      })),
    );

    expect(
      result.ok
        ? []
        : result.diagnostics
            .filter(({ code }) => code === "E_OPERATED_PROCESS")
            .map(({ message, hint }) => [message, hint]),
    ).toStrictEqual([
      [
        "prometheus: the operator replaces its Prometheus's one pod in place, so its Process is `interrupted`",
        "The Prometheus operator runs the monitoring stack's Prometheus from one interrupted Process with one surface, and sets its configuration and data paths itself.",
      ],
      [
        "prometheus: the operator sets --config.file itself",
        "The Prometheus operator runs the monitoring stack's Prometheus from one interrupted Process with one surface, and sets its configuration and data paths itself.",
      ],
      [
        "prometheus: retention is not a flag, and the operator passes its Prometheus flags alone",
        "The Prometheus operator runs the monitoring stack's Prometheus from one interrupted Process with one surface, and sets its configuration and data paths itself.",
      ],
      [
        "alertmanager: the operator serves its Alertmanager on one port, and alertmanager provides 2 surfaces",
        "The Prometheus operator runs the monitoring stack's Alertmanager from one interrupted Process with one surface, and sets its configuration and data paths itself.",
      ],
    ]);
  });

  it("checks no Process of a monitoring role its Project does not declare", () => {
    const result = checkIntentSet(
      filesOf("operated-process").map((file) => ({
        ...file,
        text: file.text.replace(
          "  prometheus: refusals/prometheus\n",
          "  prometheus: refusals/absent\n",
        ),
      })),
    );
    expect(
      result.ok ? [] : result.diagnostics.map(({ code }) => code),
    ).toStrictEqual(["E_OPERATED_PROCESS", "E_UNKNOWN_MONITORING_APPLICATION"]);
    expect(
      codeIn("operated-process", "E_OPERATED_PROCESS", (text) =>
        text.replace(
          "  prometheus: refusals/prometheus\n",
          "  prometheus: refusals/absent\n",
        ),
      ),
    ).toStrictEqual(["/applications/1/processes/0/provides"]);
  });

  it("accepts a monitoring role's interrupted Process with one surface and flags the operator does not set", () => {
    expect(
      codeIn("operated-process", "E_OPERATED_PROCESS", (text) =>
        text
          .replace(
            "args: [--config.file=/etc/prometheus/prometheus.yml, ",
            "args: [",
          )
          .replace(
            "        cutover: continuous\n  - id: alertmanager",
            "        cutover: interrupted\n  - id: alertmanager",
          )
          .replace("          cluster: 9094\n", ""),
      ),
    ).toStrictEqual([]);
  });

  it("refuses a monitoring role's Application of more than one Process, at its processes", () => {
    expect(
      codeIn("operated-process", "E_OPERATED_PROCESS", (text) =>
        text.replace(
          "  - id: edge-proxy\n",
          "      - name: alertmanager-peer\n        lifecycle: application\n        image: alertmanager\n        runtime: none\n        provides:\n          http: 9093\n        placement: { memory: 128Mi, cpu: 50m }\n        probes:\n          readiness: { path: /-/ready, port: 9093 }\n        startupBudget: 30s\n        cutover: interrupted\n  - id: edge-proxy\n",
        ),
      ),
    ).toStrictEqual([
      "/applications/0/processes/0/cutover",
      "/applications/0/processes/0/args/0",
      "/applications/1/processes",
    ]);
    expect(
      (() => {
        const result = checkIntentSet(
          filesOf("operated-process").map((file) => ({
            ...file,
            text: file.text.replace(
              "  - id: edge-proxy\n",
              "      - name: alertmanager-peer\n        lifecycle: application\n        image: alertmanager\n        runtime: none\n        provides:\n          http: 9093\n        placement: { memory: 128Mi, cpu: 50m }\n        probes:\n          readiness: { path: /-/ready, port: 9093 }\n        startupBudget: 30s\n        cutover: interrupted\n  - id: edge-proxy\n",
            ),
          })),
        );
        return result.ok
          ? []
          : result.diagnostics
              .filter(({ path }) => path === "/applications/1/processes")
              .map(({ message }) => message);
      })(),
    ).toStrictEqual([
      "alertmanager: the operator runs one Process as its Alertmanager, and the Application declares 2",
    ]);
  });

  it("lets a proxy replicate on a tier that issues no certificate through acme", () => {
    expect(
      codeIn("acme-proxy-replicated", "E_ACME_PROXY_REPLICATED", (text) =>
        text.replace("certificates: acme", "certificates: none"),
      ),
    ).toStrictEqual([]);
  });

  it("filters no class for a tier that names none, after one that does", () => {
    expect(
      codeIn("tier-class-unfiltered", "E_TIER_CLASS_UNFILTERED", (text) =>
        text.replace("    ingressClass: edge-proxy-internal\n", ""),
      ),
    ).toStrictEqual([]);
  });

  it("refuses a tls tier whose proxy provides web but not websecure", () => {
    expect(
      codeIn("tier-surface-missing", "E_TIER_SURFACE_MISSING", (text) =>
        text
          .replace("listener: plain", "listener: tls")
          .replace("http: 8080", "web: 8080"),
      ),
    ).toStrictEqual(["/tiers/0"]);
  });

  it("accepts a Postgres on a volume whose durability derives no backup, because its catalog derives", () => {
    expect(checkIntentSet(filesOf("engine-owns-databases")).ok).toBe(true);
  });

  it.each(refused)(
    "%s is refused with the codes, documents and paths its oracle names",
    (stem) => {
      const result = outcome(stem);
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
    const result = outcome(stem);
    const diagnostics = result.ok ? [] : result.diagnostics;

    expect(diagnostics).not.toHaveLength(0);
    for (const { message, hint } of diagnostics) {
      expect(message.trim()).not.toBe("");
      expect(hint.trim()).not.toBe("");
    }
  });
});
