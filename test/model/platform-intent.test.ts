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

  it("differs from the oracle when one authored field changes", () => {
    const result = parsePlatformIntent(
      WORKED.replace("retain: 14", "retain: 15"),
    );

    expect(result.ok && canonicalJson(result.value.document)).not.toBe(ORACLE);
  });

  it("maps the migration policy where it is offered, and leaves it absent where it is not", () => {
    const offered = parsePlatformIntent(WORKED);
    const withheld = parsePlatformIntent(
      WORKED.replace(/\nmigration:\n( {2}.*\n)+/, "\n"),
    );

    expect(offered.ok && offered.value.platform.migration).toStrictEqual({
      runner: "liquibase-runner",
      deadline: "10m",
      memory: "256Mi",
      cpu: "100m",
    });
    expect(withheld.ok && "migration" in withheld.value.platform).toBe(false);
    const ungated = parsePlatformIntent(
      WORKED.replace(/\ndelivery:\n( {2}.*\n)+/, "\n"),
    );
    expect(offered.ok && offered.value.platform.delivery).toStrictEqual({
      machinery: ["traefik-public", "traefik-lan", "flagger", "release-gate"],
      analysis: { interval: "30s", iterations: 4, threshold: 3 },
    });
    expect(ungated.ok && "delivery" in ungated.value.platform).toBe(false);
  });

  it("maps the worked document into the domain model", () => {
    const result = parsePlatformIntent(WORKED);
    const platform = result.ok ? result.value.platform : undefined;

    expect(platform?.owner).toBe("joris");
    expect(platform?.cluster).toBe("production");
    expect(platform?.nodeContract).toMatch(/^sha256:/);
    expect(platform?.hardening).toBe("restricted");
    expect(platform?.substrate.secretsEncryption).toBe(false);
    expect(
      platform?.tiers.map(({ name, proxy }) => [name, proxy]),
    ).toStrictEqual([
      ["public-frankfurt", "traefik-public"],
      ["lan", "traefik-lan"],
    ]);
    expect(platform?.tiers[0]?.forwardAuth).toMatch(/^http:\/\/auth-api/);
    expect(platform?.tiers[1]).not.toHaveProperty("forwardAuth");
    expect([...(platform?.durability.keys() ?? [])]).toStrictEqual([
      "reconstructible",
      "recoverable",
      "irreplaceable",
    ]);
    expect(platform?.durability.get("irreplaceable")?.retain).toBe(90);
    expect([...(platform?.engines ?? [])]).toStrictEqual([
      ["postgres", "postgres-backup"],
      ["rabbitmq", "rabbitmq-backup"],
      ["files", "file-backup"],
    ]);
    expect(platform?.providers).toStrictEqual([
      {
        name: "stalwart",
        address: "10.0.0.12",
        surfaces: new Map([
          ["smtp", 25],
          ["http", 8080],
        ]),
      },
    ]);
  });

  it("maps a document with no providers to an empty list", () => {
    const text = WORKED.slice(0, WORKED.indexOf("\nproviders:")) + "\n";
    const result = parsePlatformIntent(text);

    expect(result.ok && result.value.platform.providers).toStrictEqual([]);
  });

  it("refuses a value outside a closed vocabulary at its JSON Pointer", () => {
    expect(
      refusalsOf(WORKED.replace("listener: plain", "listener: quic")),
    ).toStrictEqual([{ code: "schema", path: "/tiers/1/listener" }]);
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
