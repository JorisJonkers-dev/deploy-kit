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

const SIGN_IN = `signIn:
  issuer: https://auth.signin.dev
  provider: signin/identity
`;

/** The bootstrap set's entry for the Client kind. */
const CLIENT_CRD = "    - identity.jorisjonkers.dev/v1\n";

/**
 * The base platform with a public tier carrying every audience a Client takes,
 * a sign-in provider, and the Client kind in its bootstrap set.
 */
const platformOf = (signIn = SIGN_IN, crd = CLIENT_CRD): string =>
  BASE.replace(
    "    - traefik.io/v1alpha1\n",
    `    - traefik.io/v1alpha1\n${crd}`,
  )
    .replace(
      "tiers:\n",
      `tiers:
  - name: public
    audiences: [anonymous, authenticated, internal]
    listener: tls
    certificates: acme
    forwardAuth: {provider: signin/identity, surface: http, path: /gate}
    traefik: signin/edge-proxy
    ingressClass: edge-proxy
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
type Explained = Found & { message: string; hint: string | undefined };
type Inputs = { platform?: string; env?: string };

function explained(
  applications: string,
  { platform = platformOf(), env }: Inputs = {},
): Explained[] {
  const result = checkIntentSet([
    { name: "platform.intent.yml", text: platform },
    { name: "signin.project.yml", text: project(applications) },
    ...(env === undefined ? [] : [{ name: "env/grafana/base.env", text: env }]),
  ]);
  return result.ok
    ? []
    : result.diagnostics.map(({ code, path, message, hint }) => ({
        code,
        path,
        message,
        hint,
      }));
}

const refusals = (applications: string, inputs?: Inputs): Found[] =>
  explained(applications, inputs).map(({ code, path }) => ({ code, path }));

const EXPOSURE_HINT =
  "Name one exposure of the Application in `exposure`, or declare the one exposure the Client signs people in on.";
const FIELD_HINT =
  "Remove the field, or choose the Sign-in Mode that takes it.";
const ROLE_HINT = "List each App Role once, and never `user`.";

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
    expect(explained(grafana(`${NATIVE}\nexposure: elsewhere`))).toStrictEqual([
      {
        code: "E_CLIENT_EXPOSURE_UNRESOLVED",
        path: `${AT}/exposure`,
        message: "grafana declares no exposure elsewhere",
        hint: EXPOSURE_HINT,
      },
    ]);
  });

  it("names its exposure when its Application declares more than one", () => {
    expect(
      explained(
        grafana(
          NATIVE,
          exposureOf("public", "authenticated") + exposureOf("api", "internal"),
        ),
      ),
    ).toStrictEqual([
      {
        code: "E_CLIENT_EXPOSURE_UNRESOLVED",
        path: AT,
        message:
          "grafana declares 2 exposures, and the Client names none of them",
        hint: EXPOSURE_HINT,
      },
    ]);
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
      explained(`  - id: grafana
    client:
      signIn: token
${PROCESSES("grafana")}`),
    ).toStrictEqual([
      {
        code: "E_CLIENT_EXPOSURE_UNRESOLVED",
        path: AT,
        message:
          "grafana declares 0 exposures, and the Client names none of them",
        hint: EXPOSURE_HINT,
      },
    ]);
  });

  it("is refused once, on a gated Application that declares no exposure", () => {
    expect(
      refusals(`  - id: grafana
    client:
      signIn: gated
      label: Sonarr
${PROCESSES("grafana")}`),
    ).toStrictEqual([{ code: "E_CLIENT_EXPOSURE_UNRESOLVED", path: AT }]);
  });

  it("refuses a field its mode does not take", () => {
    expect(
      explained(grafana("signIn: gated\nlabel: Sonarr\ncredential: pkce")),
    ).toStrictEqual([
      {
        code: "E_CLIENT_FIELD_FOR_MODE",
        path: `${AT}/credential`,
        message: "a gated Client takes no credential",
        hint: FIELD_HINT,
      },
    ]);
  });

  it("refuses a field its mode requires and it leaves out", () => {
    expect(
      explained(grafana("signIn: native\nlabel: Grafana\ncredential: pkce")),
    ).toStrictEqual([
      {
        code: "E_CLIENT_FIELD_FOR_MODE",
        path: AT,
        message: "a native Client requires redirectPaths, protectedPath",
        hint: "Declare every field the Sign-in Mode requires.",
      },
    ]);
  });

  it("refuses a label on a token Client, which has no tile to show", () => {
    expect(
      explained(
        grafana("signIn: token\nlabel: API", exposureOf("api", "internal")),
      ),
    ).toStrictEqual([
      {
        code: "E_CLIENT_FIELD_FOR_MODE",
        path: `${AT}/label`,
        message: "a token Client takes no label",
        hint: FIELD_HINT,
      },
    ]);
  });

  it("refuses an audience its mode cannot serve", () => {
    expect(
      explained(grafana(NATIVE, exposureOf("public", "internal"))),
    ).toStrictEqual([
      {
        code: "E_CLIENT_AUDIENCE",
        path: AT,
        message:
          "a native Client cannot sign people in on the internal exposure public",
        hint: "A native or gated Client's exposure is authenticated; a token Client's is authenticated or internal.",
      },
    ]);
  });

  it("refuses a role listed twice", () => {
    expect(
      explained(grafana(`${NATIVE}\nroles: [viewer, admin, viewer]`)),
    ).toStrictEqual([
      {
        code: "E_DUPLICATE_APP_ROLE",
        path: `${AT}/roles/2`,
        message: "the role viewer is listed twice",
        hint: ROLE_HINT,
      },
    ]);
  });

  it("refuses the user role, which every Client already has", () => {
    expect(explained(grafana(`${NATIVE}\nroles: [user]`))).toStrictEqual([
      {
        code: "E_DUPLICATE_APP_ROLE",
        path: `${AT}/roles/0`,
        message: "every Client has the user role already",
        hint: ROLE_HINT,
      },
    ]);
  });

  it.each(["/.auth/", "/.auth/callback", "/.auth"])(
    "refuses a gated Application's own route at %s",
    (path) => {
      expect(
        explained(
          grafana(
            "signIn: gated\nlabel: Sonarr",
            exposureOf("public", "authenticated", path),
          ),
        ),
      ).toStrictEqual([
        {
          code: "E_GATE_PATH_CLAIMED",
          path: "/applications/0/exposure/0/routes/0",
          message: `${path} is the Gate's own on a gated host`,
          hint: "Move the route out from under /.auth/: the Gate receives its sign-in there.",
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

describe("the Client kind", () => {
  it("is refused where the bootstrap set does not list it, since no cluster could apply a Client then", () => {
    expect(
      refusals(grafana(NATIVE), { platform: platformOf(SIGN_IN, "") }),
    ).toStrictEqual([{ code: "E_CLIENT_CRD_NOT_BOOTSTRAPPED", path: AT }]);
  });

  it("is refused for every mode, a token Client's too", () => {
    expect(
      refusals(grafana("signIn: token", exposureOf("api", "internal")), {
        platform: platformOf(SIGN_IN, ""),
      }),
    ).toStrictEqual([{ code: "E_CLIENT_CRD_NOT_BOOTSTRAPPED", path: AT }]);
  });
});

describe("a Client holding a secret", () => {
  const storeless = platformOf().replace(
    "secretStore: signin/edge-proxy\n",
    "",
  );

  it("is refused where the platform names no Secret Store to hold the secret", () => {
    expect(refusals(grafana(NATIVE), { platform: storeless })).toStrictEqual([
      { code: "E_NO_SECRET_STORE", path: "/applications/0" },
    ]);
  });

  it("is not refused for a PKCE Client, which holds no secret", () => {
    expect(
      refusals(grafana(NATIVE.replace("secret", "pkce")), {
        platform: storeless,
      }),
    ).toStrictEqual([]);
  });
});

describe("the sign-in provider", () => {
  it("is an Application its Project declares", () => {
    expect(
      explained(grafana(NATIVE), {
        platform: platformOf(SIGN_IN.replace("signin/identity", "signin/gone")),
      }),
    ).toStrictEqual([
      {
        code: "E_UNKNOWN_SIGN_IN_PROVIDER",
        path: "/signIn",
        message: "no project file declares the sign-in provider signin/gone",
        hint: "Name the Identity Provider as `<project>/<application>`, an Application its Project declares.",
      },
    ]);
  });
});

/** E_UNRESOLVED_PLACEHOLDER on grafana's Process, for the reason it gives. */
const unresolvedBecause = (why: string) => ({
  code: "E_UNRESOLVED_PLACEHOLDER",
  path: "/applications/0/processes/0",
  message: expect.stringContaining(why) as string,
  hint: expect.any(String) as string,
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

  it("refuses ${client:secret} where the Client holds none, with no Platform document read", () => {
    const result = checkIntentSet([
      {
        name: "signin.project.yml",
        text: project(grafana(NATIVE.replace("secret", "pkce"))),
      },
      { name: "env/grafana/base.env", text: "X=${client:secret}\n" },
    ]);
    expect(
      result.ok ? [] : result.diagnostics.map(({ code }) => code),
    ).toStrictEqual(["E_CLIENT_PLACEHOLDER_WITHOUT_SECRET"]);
  });

  it("refuses a field a Client hands out none of", () => {
    expect(
      explained(grafana(NATIVE), { env: "X=${client:label}\n" }),
    ).toStrictEqual([unresolvedBecause("a Client hands out no label")]);
  });

  it("refuses the secret as part of a value", () => {
    expect(
      explained(grafana(NATIVE), { env: "X=${client:secret}-suffix\n" }),
    ).toStrictEqual([
      unresolvedBecause("a secret is a whole value, never part of one"),
    ]);
  });

  it("is unresolved in an Application that declares no Client", () => {
    expect(
      explained(
        `  - id: grafana
${PROCESSES("grafana")}`,
        { env: "X=${client:id}\n" },
      ),
    ).toStrictEqual([unresolvedBecause("grafana declares no Client")]);
  });
});
