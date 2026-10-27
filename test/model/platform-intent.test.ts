// REQ-030 (docs/requirements.md): the authored Platform document parses to its
// committed intent oracle, and a tier that carries the authenticated audience
// without an endpoint to authenticate it is refused.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLATFORM_JSON_SCHEMA_PATH,
  canonicalJson,
  parsePlatformIntent,
  platformIntentJsonSchema,
} from "../../src/index.ts";
import {
  foundationOf,
  type PlatformIntentDocument,
} from "../../src/model/platform-intent.ts";

const REPOSITORY = join(import.meta.dirname, "..", "..");
const PLATFORM = join(REPOSITORY, "spec", "v1", "examples", "platform");
const WORKED = readFileSync(join(PLATFORM, "platform.intent.yml"), "utf8");
const ORACLE = readFileSync(join(PLATFORM, "expected", "intent.json"), "utf8");

function refusalsOf(text: string) {
  const result = parsePlatformIntent(text);
  return result.ok
    ? []
    : result.diagnostics.map(({ code, path }) => ({ code, path }));
}

describe("parsePlatformIntent", () => {
  it("parses the worked Platform document to its committed intent oracle, byte for byte", () => {
    const result = parsePlatformIntent(WORKED);

    expect(result.ok && canonicalJson(result.value.document)).toBe(ORACLE);
  });

  it("refuses text that is not one YAML document, before any schema reads it", () => {
    const result = parsePlatformIntent(`${WORKED}---\n${WORKED}`);

    expect(result.ok ? [] : result.diagnostics).toStrictEqual([
      expect.objectContaining({
        code: "schema",
        path: "",
        message: "expected one YAML document, found 2",
      }),
    ]);
  });

  it("differs from the oracle when one authored field changes", () => {
    const result = parsePlatformIntent(
      WORKED.replace("retain: 14", "retain: 15"),
    );

    expect(result.ok && canonicalJson(result.value.document)).not.toBe(ORACLE);
  });

  it("reads the migration policy where it is offered, and leaves it absent where it is not", () => {
    const offered = parsePlatformIntent(WORKED);
    const withheld = parsePlatformIntent(
      WORKED.replace(/\nmigration:\n( {2}.*\n)+/, "\n"),
    );

    expect(offered.ok && offered.value.document.migration).toStrictEqual({
      runner: "liquibase-runner",
      deadline: "10m",
      memory: "256Mi",
      cpu: "100m",
    });
    expect(withheld.ok && "migration" in withheld.value.document).toBe(false);
    const ungated = parsePlatformIntent(
      WORKED.replace(/\ndelivery:\n( {2}.*\n)+/, "\n"),
    );
    expect(offered.ok && offered.value.document.delivery).toStrictEqual({
      machinery: [
        "edge/traefik-public",
        "edge/traefik-lan",
        "delivery/flagger",
        "delivery/release-gate",
      ],
      gate: "delivery/release-gate",
      reporter: "delivery/reporter",
      analysis: {
        interval: "30s",
        iterations: 4,
        threshold: 3,
        errorRate: "1%",
        latency: "500ms",
      },
      move: { timeout: "300s", retention: "7d", memory: "128Mi", cpu: "100m" },
    });
    expect(ungated.ok && "delivery" in ungated.value.document).toBe(false);
  });

  it("refuses a library at the root, outside an absolute path, or climbing out of one, and one that grants no project", () => {
    for (const path of ["/", "srv/media", "/srv/../etc", "/srv/./media"])
      expect(
        refusalsOf(WORKED.replace("path: /srv/media", `path: "${path}"`)),
        path,
      ).toStrictEqual([{ code: "schema", path: "/libraries/media/path" }]);
    expect(
      refusalsOf(
        WORKED.replace(/\n {4}grants:\n( {6}.*\n)+/, "\n    grants: {}\n"),
      ),
    ).toStrictEqual([{ code: "schema", path: "/libraries/media/grants" }]);
    const empty = parsePlatformIntent(
      WORKED.replace(/\n {4}grants:\n( {6}.*\n)+/, "\n    grants: {}\n"),
    );
    expect(
      empty.ok ? [] : empty.diagnostics.map(({ message }) => message),
    ).toStrictEqual(["a library grants at least one project"]);
    expect(refusalsOf(WORKED.replace("gid: 3001", "gid: 0"))).toStrictEqual([
      { code: "schema", path: "/libraries/media/gid" },
    ]);
  });

  it("refuses a VPN setting the render derives from the attached Process, and a setting that is no variable name", () => {
    for (const name of [
      "FIREWALL_INPUT_PORTS",
      "VPN_PORT_FORWARDING",
      "VPN_PORT_FORWARDING_UP_COMMAND",
    ]) {
      const derived = parsePlatformIntent(
        WORKED.replace('    DOT: "off"\n', `    DOT: "off"\n    ${name}: x\n`),
      );
      expect(
        derived.ok
          ? []
          : derived.diagnostics.map(({ path, message }) => [path, message]),
        name,
      ).toStrictEqual([
        [
          `/vpn/settings/${name}`,
          `${name} is derived from the attached Process`,
        ],
      ]);
    }
    expect(
      refusalsOf(
        WORKED.replace('    DOT: "off"\n', '    DOT: "off"\n    vpn_type: x\n'),
      ),
    ).toStrictEqual([{ code: "schema", path: "/vpn/settings/vpn_type" }]);
  });

  it("refuses a value outside a closed vocabulary at its JSON Pointer", () => {
    expect(
      refusalsOf(WORKED.replace("listener: plain", "listener: quic")),
    ).toStrictEqual([{ code: "schema", path: "/tiers/1/listener" }]);
  });

  // REQ-104 (docs/requirements.md): an off-cluster copy is encrypted to an
  // age public key the platform names, so a destination without one, or with
  // something that is no such key, is refused with the document.
  it("refuses an off-cluster copy with no recipient, or one that is no age public key, at the recipient", () => {
    const recipient =
      /\n {6}recipient: age1s6v5qrx3mgcgk37gscv8y6z43rssksdct5lx3xk5xrtptjndqvhsnhj7h8\n/;
    const path = "/durability/irreplaceable/offCluster/recipient";

    expect(refusalsOf(WORKED.replace(recipient, "\n"))).toStrictEqual([
      { code: "schema", path },
    ]);
    for (const wrong of [
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI",
      // One character short, and one outside the bech32 alphabet.
      "age1s6v5qrx3mgcgk37gscv8y6z43rssksdct5lx3xk5xrtptjndqvhsnhj7h",
      "age1b6v5qrx3mgcgk37gscv8y6z43rssksdct5lx3xk5xrtptjndqvhsnhj7h8",
      // A key with anything before or after it is no key.
      "xage1s6v5qrx3mgcgk37gscv8y6z43rssksdct5lx3xk5xrtptjndqvhsnhj7h8",
      "age1s6v5qrx3mgcgk37gscv8y6z43rssksdct5lx3xk5xrtptjndqvhsnhj7h88",
    ])
      expect(
        refusalsOf(
          WORKED.replace(recipient, `\n      recipient: "${wrong}"\n`),
        ),
      ).toStrictEqual([{ code: "schema", path }]);
  });

  // REQ-057 (docs/requirements.md): the Release Gate's two thresholds are
  // the platform's to state, and a delivery policy without one is refused.
  it("refuses an analysis that states no threshold, or one that is no share or no latency", () => {
    const codesAt = (document: string) => {
      const parsed = parsePlatformIntent(document);
      return parsed.ok
        ? []
        : parsed.diagnostics.map(({ code, path }) => [code, path]);
    };
    const stating = (field: string, value: string): string =>
      WORKED.replace(
        new RegExp(`\\n( +)${field}: .*\\n`),
        `\n$1${field}: ${value}\n`,
      );

    for (const field of ["errorRate", "latency"])
      expect(
        codesAt(WORKED.replace(new RegExp(`\\n +${field}: .*\\n`), "\n")),
        field,
      ).toStrictEqual([["schema", `/delivery/analysis/${field}`]]);
    for (const share of ["101%", "1", "1.234%", "-1%", "1 %", "one%"])
      expect(codesAt(stating("errorRate", share)), share).toStrictEqual([
        ["schema", "/delivery/analysis/errorRate"],
      ]);
    for (const share of ["0%", "0.5%", "12.25%", "100%"])
      expect(codesAt(stating("errorRate", share)), share).toStrictEqual([]);
    for (const bound of ["0ms", "500", "1.5s", "5m", "ms"])
      expect(codesAt(stating("latency", bound)), bound).toStrictEqual([
        ["schema", "/delivery/analysis/latency"],
      ]);
    for (const bound of ["1ms", "250ms", "2s"])
      expect(codesAt(stating("latency", bound)), bound).toStrictEqual([]);
  });

  it("refuses rendered artifacts that name no signer, at the artifacts", () => {
    // Flux fetches each Project's render from the artifact repository and
    // verifies its signer, so neither may be missing
    // (spec/v1/55-delivery.md#rendered-artifacts-and-pins).
    const unsigned = WORKED.replace(/\n {6}signer:\n( {8}.*\n)+/, "\n");

    expect(refusalsOf(unsigned)).toStrictEqual([
      { code: "schema", path: "/bootstrap/flux/artifacts/signer" },
    ]);
  });

  it("reads the Secret a private artifact repository is pulled with, and refuses an empty name", () => {
    // The worked estate names none; a private repository names the Secret
    // Flux pulls it with (spec/v1/14-platform-intent.md#the-bootstrap-set).
    const withSecret = (name: string) =>
      WORKED.replace(
        "      repository: ghcr.io/jorisjonkers-dev/render\n",
        `      repository: ghcr.io/jorisjonkers-dev/render\n      pullSecret: ${name}\n`,
      );
    const pulled = parsePlatformIntent(withSecret("render-pull"));
    const worked = parsePlatformIntent(WORKED);

    expect(
      pulled.ok && pulled.value.document.bootstrap.flux.artifacts.pullSecret,
    ).toBe("render-pull");
    expect(
      worked.ok &&
        "pullSecret" in worked.value.document.bootstrap.flux.artifacts,
    ).toBe(false);
    expect(refusalsOf(withSecret('""'))).toStrictEqual([
      { code: "schema", path: "/bootstrap/flux/artifacts/pullSecret" },
    ]);
  });

  it("refuses a handover ledger that puts a Project on both paths, naming each", () => {
    // Two sources applying one Project prune each other
    // (spec/v1/60-setup.md#handing-over-one-project-at-a-time).
    const ledger = (lists: string): string =>
      WORKED.replace(
        /\nhandover:\n( {2}.*\n)+/,
        `\nhandover:\n  retireBy: 2027-03-31\n${lists}`,
      );
    const messages = (text: string) => {
      const result = parsePlatformIntent(text);
      return result.ok
        ? []
        : result.diagnostics.map(({ code, path, message }) => ({
            code,
            path,
            message,
          }));
    };

    expect(
      messages(
        ledger("  legacy: [auth, data, notes]\n  estate: [notes, auth]\n"),
      ),
    ).toStrictEqual([
      {
        code: "E_HANDOVER_BOTH_PATHS",
        path: "/handover",
        message: "the handover ledger puts notes, auth on both delivery paths",
      },
    ]);
    expect(messages(ledger("  legacy: [auth]\n"))).toStrictEqual([]);
    expect(messages(ledger("  estate: [auth]\n"))).toStrictEqual([]);
  });

  it("refuses YAML outside the subset before the schema runs", () => {
    expect(refusalsOf(`${WORKED}---\n${WORKED}`)).toStrictEqual([
      { code: "schema", path: "" },
    ]);
  });

  // REQ-099: a tier's address is one the Platform document declares, and an
  // acme tier's proxy registers with the account the platform names.
  it("refuses a tier whose address the platform does not declare, at the address", () => {
    const text = WORKED.replace("address: lan-edge", "address: lan-nowhere");
    expect(refusalsOf(text)).toStrictEqual([
      { code: "E_UNKNOWN_L4_ADDRESS", path: "/tiers/1/address" },
    ]);
    const result = parsePlatformIntent(text);
    expect(
      result.ok
        ? []
        : result.diagnostics.map(({ message, hint }) => ({ message, hint })),
    ).toStrictEqual([
      {
        message: "the platform declares no L4 Address lan-nowhere",
        hint: "Declare the address in `l4Addresses`, or name one it declares.",
      },
    ]);
  });

  it("refuses an acme tier where no Secret Store holds its DNS token, at the tier", () => {
    const text = WORKED.replace("secretStore: secrets/vault\n", "");
    const result = parsePlatformIntent(text);
    expect(
      result.ok
        ? []
        : result.diagnostics.map(({ code, path, message, hint }) => ({
            code,
            path,
            message,
            hint,
          })),
    ).toStrictEqual([
      {
        code: "E_NO_SECRET_STORE",
        path: "/tiers/0",
        message:
          "tier public-frankfurt issues its certificates through acme, and no Secret Store holds its DNS provider's token",
        hint: "Name the platform's `secretStore`, or issue the tier's certificates another way.",
      },
    ]);
    // A tier that issues none needs no token.
    expect(
      refusalsOf(text.replace("certificates: acme", "certificates: none")),
    ).toStrictEqual([]);
  });

  it("refuses an acme tier where the platform names no acme account, at the tier", () => {
    const text = WORKED.replace(/\nacme:\n( {2}.*\n)+/, "\n");
    expect(refusalsOf(text)).toStrictEqual([
      { code: "E_NO_ACME_POLICY", path: "/tiers/0" },
    ]);
  });

  it("refuses a tier that carries authenticated with no forwardAuth, at the tier", () => {
    const text = WORKED.replace(/\n\s+forwardAuth: [^\n]*/, "");
    const result = parsePlatformIntent(text);

    expect(refusalsOf(text)).toStrictEqual([
      { code: "E_NO_FORWARD_AUTH_ENDPOINT", path: "/tiers/0" },
    ]);
    expect(!result.ok && result.diagnostics[0]?.message).toBe(
      "tier public-frankfurt carries authenticated and names no forwardAuth endpoint",
    );
    expect(!result.ok && result.diagnostics[0]?.hint).toBe(
      "Declare the tier's `forwardAuth`, or stop carrying `authenticated` on it.",
    );
  });

  // REQ-080 (docs/requirements.md): a group holds a role by one grant.
  it("refuses a group granted one role twice, at the second grant, and accepts it granted two roles", () => {
    const granted = (grants: string) =>
      WORKED.replace(
        /\nhumanGrants:\n( {2}.*\n)+/,
        `\nhumanGrants:\n${grants}`,
      );
    const grant = (group: string, role: string) =>
      `  - group: ${group}\n    clusterRole: ${role}\n    reason: works on the cluster\n`;
    const result = parsePlatformIntent(
      granted(
        grant("oidc:k8s-admin", "cluster-admin") +
          grant("oidc:k8s-viewers", "view") +
          grant("oidc:k8s-admin", "cluster-admin"),
      ),
    );

    expect(result.ok ? [] : result.diagnostics).toStrictEqual([
      {
        code: "E_DUPLICATE_HUMAN_GRANT",
        path: "/humanGrants/2",
        message: "the group oidc:k8s-admin is granted cluster-admin twice",
        hint: "Keep one grant of the role to the group, with the reason it is held.",
      },
    ]);
    expect(
      refusalsOf(
        granted(
          grant("oidc:k8s-admin", "cluster-admin") +
            grant("oidc:k8s-admin", "view") +
            grant("oidc:k8s-viewers", "view"),
        ),
      ),
    ).toStrictEqual([]);
  });

  it("refuses a human grant to a user, in a namespace, of another role, or to a group no binding can be named for", () => {
    const grant = (lines: string) =>
      WORKED.replace(
        /\nhumanGrants:\n( {2}.*\n)+/,
        `\nhumanGrants:\n  - ${lines}`,
      );

    expect(
      refusalsOf(
        grant("user: joris\n    clusterRole: view\n    reason: reads\n"),
      ),
    ).toStrictEqual([
      { code: "schema", path: "/humanGrants/0/group" },
      { code: "schema", path: "/humanGrants/0/user" },
    ]);
    expect(
      refusalsOf(
        grant(
          "group: g\n    clusterRole: view\n    namespace: a\n    reason: reads\n",
        ),
      ),
    ).toStrictEqual([{ code: "schema", path: "/humanGrants/0/namespace" }]);
    expect(
      refusalsOf(
        grant("group: g\n    clusterRole: system:node\n    reason: r\n"),
      ),
    ).toStrictEqual([{ code: "schema", path: "/humanGrants/0/clusterRole" }]);
    for (const group of ["a/b", "a%b", "a b"])
      expect(
        refusalsOf(
          grant(`group: "${group}"\n    clusterRole: view\n    reason: r\n`),
        ),
        group,
      ).toStrictEqual([{ code: "schema", path: "/humanGrants/0/group" }]);
  });

  it("points a schema failure at the chapter that defines the field", () => {
    const result = parsePlatformIntent(
      WORKED.replace("listener: plain", "listener: quic"),
    );

    expect(!result.ok && result.diagnostics[0]?.hint).toBe(
      "Correct the field against spec/v1/14-platform-intent.md.",
    );
  });

  it("regenerates its JSON Schema without a diff", () => {
    expect(PLATFORM_JSON_SCHEMA_PATH).toBe(
      "spec/v1/schemas/platform-intent.schema.json",
    );
    expect(platformIntentJsonSchema()).toBe(
      readFileSync(join(REPOSITORY, PLATFORM_JSON_SCHEMA_PATH), "utf8"),
    );
  });
});

// REQ-096 (docs/requirements.md): the foundation is every holder of a
// privileged role, and nothing a Platform document leaves out.
describe("the foundation", () => {
  const platformOf = (text: string): PlatformIntentDocument => {
    const result = parsePlatformIntent(text);
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
    return result.value.document;
  };

  it("leaves out an Application admitted to hold API access in its own namespace alone", () => {
    // The worked platform admits agents-api to its own namespace alone.
    expect(foundationOf(platformOf(WORKED)).has("agents/agents-api")).toBe(
      false,
    );
  });

  it("is every holder of a privileged role the worked platform names", () => {
    expect([...foundationOf(platformOf(WORKED))].sort()).toStrictEqual([
      "delivery/collector",
      "delivery/flagger",
      "delivery/release-gate",
      "delivery/reporter",
      "edge/external-dns",
      "edge/traefik-lan",
      "edge/traefik-public",
      "identity/identity",
      "observability/alloy",
      "observability/gatus",
      "observability/grafana-operator",
      "observability/kube-state-metrics",
      "observability/otel-collector",
      "observability/prometheus",
      "observability/prometheus-operator",
      "secrets/vault",
      "secrets/vault-secrets-operator",
    ]);
  });

  it("is the tiers' proxies alone where the platform names no other role", () => {
    const bare = platformOf(WORKED);
    const {
      delivery: _d,
      apiAccess: _a,
      telemetry: _t,
      secretStore: _s,
      signIn: _i,
      ...rest
    } = bare;

    expect([...foundationOf(rest)].sort()).toStrictEqual([
      "edge/traefik-lan",
      "edge/traefik-public",
    ]);
  });

  it("holds the delivery machinery without a gate or a reporter", () => {
    const worked = platformOf(WORKED);
    const delivery = worked.delivery as NonNullable<typeof worked.delivery>;
    const { gate: _g, reporter: _r, ...machinery } = delivery;

    expect(
      [
        ...foundationOf({
          tiers: [],
          delivery: machinery as typeof delivery,
        } as unknown as PlatformIntentDocument),
      ].sort(),
    ).toStrictEqual([...delivery.machinery].sort());
  });

  it("holds a gate and a reporter that hold no other role", () => {
    expect(
      [
        ...foundationOf({
          tiers: [],
          delivery: { machinery: [], gate: "gate/gate", reporter: "news/news" },
        } as unknown as PlatformIntentDocument),
      ].sort(),
    ).toStrictEqual(["gate/gate", "news/news"]);
  });
});
