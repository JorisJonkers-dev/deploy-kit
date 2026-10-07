// REQ-054 (docs/requirements.md): every estate-wide invariant over the composed
// union fires on its own negative fixture, at the code, the document and the
// path the fixture's committed diagnostics name, in whatever order the
// fragments are read; a fixture is read by the `kind: Project` its documents
// declare, not by a `.project.yml` they deliberately do not carry.
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
  INVARIANTS,
  type Fragment,
  type Invariant,
} from "../../src/check/union.ts";
import type { PlatformIntentDocument } from "../../src/model/platform-intent.ts";

const EXAMPLES = join(
  import.meta.dirname,
  "..",
  "..",
  "spec",
  "v1",
  "examples",
);
const NEGATIVE = join(EXAMPLES, "negative");

/** The Platform document, its pinned inputs and the foundation every set composes with. */
const FOUNDATION: AuthoredFile[] = [
  "platform/platform.intent.yml",
  "platform/node-contract.yml",
  "platform/images.lock.yml",
  "platform/cluster-state.yml",
  "delivery/delivery.project.yml",
  "edge/edge.project.yml",
  "observability/observability.project.yml",
  "secrets/secrets.project.yml",
].map((name) => ({ name, text: readFileSync(join(EXAMPLES, name), "utf8") }));

const fixtures = readdirSync(NEGATIVE)
  .filter((name) => statSync(join(NEGATIVE, name)).isDirectory())
  .sort();

/** A fixture's fragments, by their path below it. */
const fragmentsOf = (fixture: string): AuthoredFile[] =>
  readdirSync(join(NEGATIVE, fixture), { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".yml"))
    .sort()
    .map((name) => ({
      name: name.split(sep).join("/"),
      text: readFileSync(join(NEGATIVE, fixture, name), "utf8"),
    }));

interface Triple {
  readonly code: string;
  readonly document?: string | undefined;
  readonly path: string;
}

const sorted = (triples: readonly Triple[]): Triple[] =>
  triples
    .map(({ code, document, path }) => ({ code, document, path }))
    .sort((a, b) =>
      `${String(a.document)} ${a.path} ${a.code}` <
      `${String(b.document)} ${b.path} ${b.code}`
        ? -1
        : 1,
    );

const refusalsOf = (files: readonly AuthoredFile[]): Triple[] => {
  const result = checkIntentSet(files);
  return result.ok ? [] : sorted(result.diagnostics);
};

describe("the negative fixtures", () => {
  it("and the refusal fixtures cover every invariant the registry answers over the union", () => {
    const REFUSALS = join(EXAMPLES, "refusals");
    const oracles = [
      ...fixtures.map((fixture) =>
        join(NEGATIVE, `${fixture}.diagnostics.json`),
      ),
      ...readdirSync(REFUSALS)
        .filter((name) => name.endsWith(".diagnostics.json"))
        .map((name) => join(REFUSALS, name)),
    ];
    const fired = new Set(
      oracles.flatMap((oracle) =>
        (JSON.parse(readFileSync(oracle, "utf8")) as Triple[]).map(
          ({ code }) => code,
        ),
      ),
    );

    for (const { code } of INVARIANTS) expect(fired, code).toContain(code);
  });

  it.each(fixtures)(
    "refuse %s with its committed diagnostics, byte for byte",
    (fixture) => {
      expect(
        canonicalJson(refusalsOf([...FOUNDATION, ...fragmentsOf(fixture)])),
      ).toBe(
        readFileSync(join(NEGATIVE, `${fixture}.diagnostics.json`), "utf8"),
      );
    },
  );

  it.each(fixtures)(
    "refuse %s the same in every order the fragments are read in",
    (fixture) => {
      const forwards = refusalsOf([...FOUNDATION, ...fragmentsOf(fixture)]);

      expect(
        refusalsOf([...fragmentsOf(fixture).reverse(), ...FOUNDATION]),
      ).toStrictEqual(forwards);
      expect(
        refusalsOf([...FOUNDATION.slice().reverse(), ...fragmentsOf(fixture)]),
      ).toStrictEqual(forwards);
    },
  );

  it("each fire nothing but their own code", () => {
    for (const fixture of fixtures)
      expect(
        new Set(
          refusalsOf([...FOUNDATION, ...fragmentsOf(fixture)]).map(
            ({ code }) => code,
          ),
        ).size,
        fixture,
      ).toBe(1);
  });
});

describe("reading a fixture", () => {
  const [fragment] = fragmentsOf("unresolved-application") as [AuthoredFile];

  it("reads a YAML file that says it is a Project as one, whatever its name", () => {
    expect(refusalsOf([...FOUNDATION, fragment])).not.toStrictEqual([]);
  });

  it("reads nothing from a YAML file that says it is something else, or nothing", () => {
    for (const text of [
      fragment.text.replace("kind: Project", "kind: Asset"),
      "just: a value\n",
      "~\n",
      "- a\n- list\n",
      "a: [\n",
    ])
      expect(refusalsOf([...FOUNDATION, { ...fragment, text }])).toStrictEqual(
        [],
      );
  });

  it("reads a file by kind only where it is YAML", () => {
    expect(
      refusalsOf([...FOUNDATION, { ...fragment, name: "notes.txt" }]),
    ).toStrictEqual([]);
  });
});

describe("the invariants, with no Platform document read", () => {
  it.each([
    "duplicate-project",
    "duplicate-application-id",
    "duplicate-process-name",
    "duplicate-exposure-name",
    "duplicate-host",
  ])("still refuse %s: identity needs no platform", (fixture) => {
    expect(canonicalJson(refusalsOf(fragmentsOf(fixture)))).toBe(
      readFileSync(join(NEGATIVE, `${fixture}.diagnostics.json`), "utf8"),
    );
  });

  it.each(["unresolved-application", "unknown-surface", "dependency-cycle"])(
    "leave %s unanswered, a reference answered beside the platform's providers",
    (fixture) => {
      expect(refusalsOf(fragmentsOf(fixture))).toStrictEqual([]);
    },
  );
});

/** What each fixture's first refusal tells its author. */
const TOLD: Readonly<Record<string, { message: string; hint: string }>> = {
  "dependency-cycle": {
    message:
      "this required edge to notes-search closes a cycle of required edges, so no Process on it can start first",
    hint: "Mark one edge on the cycle `required: false`, if its Process starts without that peer, or remove it.",
  },
  "duplicate-application-id": {
    message:
      "more than one Application carries the id search, so an edge to it names none of them",
    hint: "Application ids are unique across the estate: rename one of them.",
  },
  "duplicate-exposure-name": {
    message: "more than one exposure of notes is named public",
    hint: "Exposure names are unique within their Application: rename one of them.",
  },
  "duplicate-host": {
    message: "more than one exposure claims the host notes.jorisjonkers.dev",
    hint: "A host is unique across the estate: route the paths of one host from one exposure, or choose another host.",
  },
  "duplicate-process-name": {
    message:
      "more than one Process of project notes is named api, and the name is its identity in the namespace",
    hint: "Process names are unique within their project: rename one of them.",
  },
  "duplicate-project": {
    message: "more than one fragment declares the project notes",
    hint: "A project sits in exactly one repository: rename one of them, or merge the two files.",
  },
  "unknown-surface": {
    message: "notes-search provides no surface grpc",
    hint: "Name a surface a Process of that Application provides, or one the provider lists.",
  },
  "unresolved-application": {
    message:
      "no fragment declares an Application search, and the platform names no provider of that name",
    hint: "Name an Application a fragment declares, or a provider the Platform document lists.",
  },
};

describe("what a refusal tells its author", () => {
  it.each(fixtures)(
    "names the value %s collides on or misses, and what to do",
    (fixture) => {
      const result = checkIntentSet([...FOUNDATION, ...fragmentsOf(fixture)]);
      const [first] = result.ok ? [] : result.diagnostics;

      expect({ message: first?.message, hint: first?.hint }).toStrictEqual(
        TOLD[fixture],
      );
    },
  );
});

describe("the reference invariants, read against the platform's providers", () => {
  const PLATFORM = {
    providers: [
      { name: "smtp-relay", address: "relay.example", surfaces: { smtp: 25 } },
      { name: "stalwart", address: "mail.example", surfaces: { smtp: 587 } },
    ],
  } as unknown as PlatformIntentDocument;
  const consumer = (edge: string): Fragment => {
    const result = parseProjectIntent(
      fragmentsOf("unresolved-application")[0]?.text.replace(
        "application: search, surface: http",
        edge,
      ) as string,
    );
    if (!result.ok) throw new Error("the consumer does not parse");
    return {
      name: "notes.yml",
      document: result.value.document,
      effective: result.value.effective,
    };
  };
  const answered = (code: string, edge: string) =>
    (
      INVARIANTS.find((invariant) => invariant.code === code) as Extract<
        Invariant,
        { needsPlatform: true }
      >
    ).answer([consumer(edge)], PLATFORM);

  it("resolve an edge to any provider the platform lists, not only the first", () => {
    expect(
      answered(
        "E_UNRESOLVED_APPLICATION",
        "application: stalwart, surface: smtp",
      ),
    ).toStrictEqual([]);
    expect(
      answered("E_UNKNOWN_SURFACE", "application: stalwart, surface: smtp"),
    ).toStrictEqual([]);
  });

  it("refuse a surface the provider does not list", () => {
    expect(
      answered("E_UNKNOWN_SURFACE", "application: stalwart, surface: imap").map(
        ({ code, path }) => ({ code, path }),
      ),
    ).toStrictEqual([
      {
        code: "E_UNKNOWN_SURFACE",
        path: "/applications/0/processes/0/dependsOn/0/surface",
      },
    ]);
  });
});

describe("the cycle check", () => {
  /** A project whose Processes require each other as `edges` says, each named for its Application. */
  const project = (edges: Readonly<Record<string, readonly string[]>>) =>
    `apiVersion: intent.jorisjonkers.dev/v1
kind: Project
schemaVersion: 1.0.0
project: notes
owner: joris
cutover: interrupted
applications:
${Object.entries(edges)
  .map(
    ([name, to]) => `  - id: ${name}
    processes:
      - name: ${name}
        lifecycle: application
        image: notes-api
        runtime: node
        provides: { http: 8080 }
        placement: { memory: 64Mi, cpu: 10m }
${to.length === 0 ? "" : `        dependsOn:\n${to.map((peer) => `          - { application: ${peer}, surface: http }\n`).join("")}`}`,
  )
  .join("")}`;

  it("refuses only the edges on the cycle, not one that leads into it", () => {
    expect(
      refusalsOf([
        ...FOUNDATION,
        {
          name: "notes.yml",
          text: project({
            start: ["into"],
            into: ["round"],
            round: ["about"],
            about: ["round"],
          }),
        },
      ]).map(({ path }) => path),
    ).toStrictEqual([
      "/applications/2/processes/0/dependsOn/0",
      "/applications/3/processes/0/dependsOn/0",
    ]);
  });

  it("refuses no edge an optional one would close", () => {
    expect(
      refusalsOf([
        ...FOUNDATION,
        {
          name: "notes.yml",
          text: project({ there: ["back"], back: ["there"] }).replace(
            "{ application: there, surface: http }",
            "{ application: there, surface: http, required: false }",
          ),
        },
      ]),
    ).toStrictEqual([]);
  });
});
