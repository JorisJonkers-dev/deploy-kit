// Chapter 17 (spec/v1/17-sign-in.md): an Application's `client` block, what
// composition refuses in it, and what the model derives from it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkIntentSet } from "../../src/index.ts";

const BASE = readFileSync(
  join(
    import.meta.dirname,
    "..",
    "..",
    "spec",
    "v1",
    "examples",
    "refusals",
    "unbound-secret-grant",
    "platform.intent.yml",
  ),
  "utf8",
);

const GATE = "http://identity.signin-system.svc.cluster.local:8080/gate";

const SIGN_IN = `signIn:
  issuer: https://auth.signin.dev
  provider: signin/identity
`;

/** The base platform with a public tier carrying every audience a Client takes, and a sign-in provider. */
const platformOf = (signIn = SIGN_IN): string =>
  BASE.replace(
    "tiers:\n",
    `tiers:
  - name: public
    audiences: [anonymous, authenticated, internal]
    listener: tls
    certificates: acme
    forwardAuth: "${GATE}"
    traefik: signin/edge-proxy
`,
  )
    .replaceAll("refusals/edge-proxy", "signin/edge-proxy")
    .replace("hardening:", `${signIn}hardening:`);

const PROCESSES = (name: string) => `    processes:
      - name: ${name}
        lifecycle: application
        image: ${name}
        runtime: none
        provides: { http: 8080 }
        placement: { memory: 128Mi, cpu: 25m }
        probes: { readiness: { tcp: 8080 } }
        cutover: continuous
`;

const SUPPORT = `  - id: edge-proxy
${PROCESSES("edge-proxy")}  - id: identity
${PROCESSES("identity")}`;

const exposureOf = (
  name: string,
  audience: string,
  path = "/",
) => `      - name: ${name}
        host: ${name}.signin.dev
        audience: ${audience}
        routes:
          - { path: ${path}, match: prefix, process: grafana, surface: http }
`;

/** Application `grafana` with its exposures and its `client` block, indented as the file reads. */
const grafana = (
  client: string,
  exposures = exposureOf("public", "authenticated"),
) => `  - id: grafana
    exposure:
${exposures}    client:
${client
  .trim()
  .split("\n")
  .map((line) => `      ${line}`)
  .join("\n")}
${PROCESSES("grafana")}`;

const project = (
  applications: string,
) => `apiVersion: intent.jorisjonkers.dev/v1
kind: Project
schemaVersion: 1.0.0
project: signin
owner: joris
applications:
${applications}${SUPPORT}`;

const NATIVE = `signIn: native
label: Grafana
redirectPaths: [/login/generic_oauth]
protectedPath: /api/user
credential: secret`;

type Found = { code: string; path: string };

function refusals(
  applications: string,
  { platform = platformOf(), env }: { platform?: string; env?: string } = {},
): Found[] {
  const result = checkIntentSet([
    { name: "platform.intent.yml", text: platform },
    { name: "signin.project.yml", text: project(applications) },
    ...(env === undefined ? [] : [{ name: "env/grafana/base.env", text: env }]),
  ]);
  return result.ok
    ? []
    : result.diagnostics.map(({ code, path }) => ({ code, path }));
}

const AT = "/applications/0/client";

describe("a client block", () => {
  it("is accepted for a native Client on an authenticated exposure", () => {
    expect(refusals(grafana(NATIVE))).toStrictEqual([]);
  });

  it("is accepted for a token Client on an internal exposure", () => {
    expect(
      refusals(grafana("signIn: token", exposureOf("api", "internal"))),
    ).toStrictEqual([]);
  });

  it("names an exposure its Application declares", () => {
    expect(refusals(grafana(`${NATIVE}\nexposure: elsewhere`))).toStrictEqual([
      { code: "E_CLIENT_EXPOSURE_UNRESOLVED", path: `${AT}/exposure` },
    ]);
  });

  it("names its exposure when its Application declares more than one", () => {
    expect(
      refusals(
        grafana(
          NATIVE,
          exposureOf("public", "authenticated") + exposureOf("api", "internal"),
        ),
      ),
    ).toStrictEqual([{ code: "E_CLIENT_EXPOSURE_UNRESOLVED", path: AT }]);
  });

  it("resolves the exposure it names among several", () => {
    expect(
      refusals(
        grafana(
          `${NATIVE}\nexposure: public`,
          exposureOf("public", "authenticated") + exposureOf("api", "internal"),
        ),
      ),
    ).toStrictEqual([]);
  });

  it("is refused on an Application that declares no exposure", () => {
    expect(
      refusals(`  - id: grafana
    client:
      signIn: token
${PROCESSES("grafana")}`),
    ).toStrictEqual([{ code: "E_CLIENT_EXPOSURE_UNRESOLVED", path: AT }]);
  });

  it("refuses a field its mode does not take", () => {
    expect(
      refusals(grafana("signIn: gated\nlabel: Sonarr\ncredential: pkce")),
    ).toStrictEqual([
      { code: "E_CLIENT_FIELD_FOR_MODE", path: `${AT}/credential` },
    ]);
  });

  it("refuses a field its mode requires and it leaves out", () => {
    expect(
      refusals(
        grafana(
          "signIn: native\nlabel: Grafana\nprotectedPath: /api/user\ncredential: pkce",
        ),
      ),
    ).toStrictEqual([{ code: "E_CLIENT_FIELD_FOR_MODE", path: AT }]);
  });

  it("refuses a label on a token Client, which has no tile to show", () => {
    expect(
      refusals(
        grafana("signIn: token\nlabel: API", exposureOf("api", "internal")),
      ),
    ).toStrictEqual([{ code: "E_CLIENT_FIELD_FOR_MODE", path: `${AT}/label` }]);
  });

  it("refuses an audience its mode cannot serve", () => {
    expect(
      refusals(grafana(NATIVE, exposureOf("public", "internal"))),
    ).toStrictEqual([{ code: "E_CLIENT_AUDIENCE", path: AT }]);
  });

  it("refuses a role listed twice", () => {
    expect(
      refusals(grafana(`${NATIVE}\nroles: [viewer, admin, viewer]`)),
    ).toStrictEqual([{ code: "E_DUPLICATE_APP_ROLE", path: `${AT}/roles/2` }]);
  });

  it("refuses the user role, which every Client already has", () => {
    expect(refusals(grafana(`${NATIVE}\nroles: [user]`))).toStrictEqual([
      { code: "E_DUPLICATE_APP_ROLE", path: `${AT}/roles/0` },
    ]);
  });

  it.each(["/.auth/", "/.auth/callback", "/.auth"])(
    "refuses a gated Application's own route at %s",
    (path) => {
      expect(
        refusals(
          grafana(
            "signIn: gated\nlabel: Sonarr",
            exposureOf("public", "authenticated", path),
          ),
        ),
      ).toStrictEqual([
        {
          code: "E_GATE_PATH_CLAIMED",
          path: "/applications/0/exposure/0/routes/0",
        },
      ]);
    },
  );

  it("leaves a native Application its own route under /.auth/", () => {
    expect(
      refusals(
        grafana(NATIVE, exposureOf("public", "authenticated", "/.auth/")),
      ),
    ).toStrictEqual([]);
  });

  it("is refused where the Platform document names no sign-in provider", () => {
    expect(
      refusals(grafana(NATIVE), { platform: platformOf("") }),
    ).toContainEqual({ code: "E_NO_SIGN_IN_PROVIDER", path: AT });
  });
});

describe("the sign-in provider", () => {
  it("is an Application its Project declares", () => {
    expect(
      refusals(grafana(NATIVE), {
        platform: platformOf(SIGN_IN.replace("signin/identity", "signin/gone")),
      }),
    ).toStrictEqual([{ code: "E_UNKNOWN_SIGN_IN_PROVIDER", path: "/signIn" }]);
  });
});

describe("a client placeholder", () => {
  it.each(["issuer", "id", "secret"])(
    "resolves ${client:%s} in a Client holding a secret",
    (field) => {
      expect(
        refusals(grafana(NATIVE), { env: `X=\${client:${field}}\n` }),
      ).toStrictEqual([]);
    },
  );

  it("refuses ${client:secret} where the Client holds none", () => {
    expect(
      refusals(grafana(NATIVE.replace("secret", "pkce")), {
        env: "X=${client:secret}\n",
      }),
    ).toStrictEqual([
      {
        code: "E_CLIENT_PLACEHOLDER_WITHOUT_SECRET",
        path: "/applications/0/processes/0",
      },
    ]);
  });

  it("refuses a field a Client hands out none of", () => {
    expect(
      refusals(grafana(NATIVE), { env: "X=${client:label}\n" }),
    ).toStrictEqual([
      { code: "E_UNRESOLVED_PLACEHOLDER", path: "/applications/0/processes/0" },
    ]);
  });

  it("refuses the secret as part of a value", () => {
    expect(
      refusals(grafana(NATIVE), { env: "X=${client:secret}-suffix\n" }),
    ).toStrictEqual([
      { code: "E_UNRESOLVED_PLACEHOLDER", path: "/applications/0/processes/0" },
    ]);
  });

  it("is unresolved in an Application that declares no Client", () => {
    expect(
      refusals(
        `  - id: grafana
${PROCESSES("grafana")}`,
        { env: "X=${client:id}\n" },
      ),
    ).toStrictEqual([
      { code: "E_UNRESOLVED_PLACEHOLDER", path: "/applications/0/processes/0" },
    ]);
  });
});
