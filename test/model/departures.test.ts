// REQ-115 (docs/requirements.md): an Application two Projects declare is held
// once, as the declaration outside the namespace its active Instance runs in,
// and the Project it moves out of may not stop declaring it while the Move is
// open.
import { describe, expect, it } from "vitest";
import {
  departuresOf,
  moveOpenDiagnostics,
  restored,
} from "../../src/check/departures.ts";
import type { ClusterStateDocument } from "../../src/model/cluster-state.ts";
import type { PlatformIntentDocument } from "../../src/model/platform-intent.ts";
import { checkIntentSet } from "../../src/index.ts";

const PLATFORM = {
  delivery: { move: { retention: "7d" } },
} as unknown as PlatformIntentDocument;
const SOURCE = {
  application: "vault",
  instance: "vault",
  version: "1.18.0",
  namespace: "data-system",
  node: "enschede-t1000-1",
};
const state = (instance: object = SOURCE): ClusterStateDocument =>
  ({
    capturedAt: "2026-10-30T00:00:00Z",
    bindings: [],
    instances: [instance],
  }) as unknown as ClusterStateDocument;
const DATA = {
  name: "data.yml",
  project: "data",
  applications: ["pg", "vault"],
};
const SECRETS = {
  name: "secrets.yml",
  project: "secrets",
  applications: ["vault"],
};
const FLIPPED = {
  ...SOURCE,
  phase: "retire",
  target: { name: "vault", version: "1.18.0", namespace: "secrets-system" },
};

describe("an Application two Projects declare", () => {
  it("moves out of the declaration in the namespace its active Instance runs in", () => {
    expect(departuresOf([SECRETS, DATA], state(), PLATFORM)).toStrictEqual([
      {
        name: "data.yml",
        project: "data",
        application: "vault",
        index: 1,
        retired: false,
      },
    ]);
  });

  it("is settled by no Instance in neither namespace, by three declarations, or by no record", () => {
    expect(
      departuresOf(
        [SECRETS, DATA],
        state({ ...SOURCE, namespace: "vault-system" }),
        PLATFORM,
      ),
    ).toStrictEqual([]);
    expect(
      departuresOf(
        [SECRETS, DATA, { ...SECRETS, name: "x.yml", project: "x" }],
        state(),
        PLATFORM,
      ),
    ).toStrictEqual([]);
    expect(
      departuresOf(
        [SECRETS, DATA],
        state({ ...SOURCE, application: "other" }),
        PLATFORM,
      ),
    ).toStrictEqual([]);
  });

  it("has retired once the flip has held past the platform's retention, and not under none", () => {
    const flipped = { ...FLIPPED, flippedAt: "2026-10-01T00:00:00Z" };

    expect(
      departuresOf([SECRETS, DATA], state(flipped), PLATFORM)[0]?.retired,
    ).toBe(true);
    expect(
      departuresOf(
        [SECRETS, DATA],
        state(flipped),
        {} as PlatformIntentDocument,
      )[0]?.retired,
    ).toBe(false);
  });
});

describe("the Project an Application moves out of", () => {
  const dropped = { ...DATA, applications: ["pg"] };

  it("may not stop declaring it while its source serves from there", () => {
    expect(
      moveOpenDiagnostics([dropped, SECRETS], state(), PLATFORM),
    ).toStrictEqual([
      {
        code: "E_MOVE_OPEN",
        document: "data.yml",
        path: "/applications",
        message:
          "data stops declaring vault, whose source Instance still serves from data-system while it moves to secrets",
        hint: "Keep declaring the Application here until its Move's source has retired, then remove it.",
      },
    ]);
  });

  it("may stop once the source has retired, while it still declares it, or where nothing else does", () => {
    expect(
      moveOpenDiagnostics(
        [dropped, SECRETS],
        state({ ...FLIPPED, flippedAt: "2026-10-01T00:00:00Z" }),
        PLATFORM,
      ),
    ).toStrictEqual([]);
    // Under a platform that bounds no retention, a flipped source never retires.
    expect(
      moveOpenDiagnostics(
        [dropped, SECRETS],
        state({ ...FLIPPED, flippedAt: "2026-10-01T00:00:00Z" }),
        {} as PlatformIntentDocument,
      ).map(({ code }) => code),
    ).toStrictEqual(["E_MOVE_OPEN"]);
    expect(
      moveOpenDiagnostics([DATA, SECRETS], state(), PLATFORM),
    ).toStrictEqual([]);
    expect(moveOpenDiagnostics([dropped], state(), PLATFORM)).toStrictEqual([]);
    expect(
      moveOpenDiagnostics(
        [{ ...SECRETS, name: "other.yml", project: "other" }, SECRETS],
        state(),
        PLATFORM,
      ),
    ).toStrictEqual([]);
    expect(
      moveOpenDiagnostics(
        [dropped, SECRETS],
        { ...state(), instances: undefined } as unknown as ClusterStateDocument,
        PLATFORM,
      ),
    ).toStrictEqual([]);
  });
});

describe("a refusal of a Project composition set a declaration aside of", () => {
  const at = (path: string, document = "data.yml") =>
    restored({ code: "E_X", document, path, message: "", hint: "" } as never, [
      {
        name: "data.yml",
        project: "data",
        application: "b",
        index: 2,
        retired: false,
      },
      {
        name: "data.yml",
        project: "data",
        application: "a",
        index: 0,
        retired: false,
      },
    ]).path;

  it("is pointed past each declaration set aside at or before it", () => {
    expect(at("/applications/0/processes/1")).toBe(
      "/applications/1/processes/1",
    );
    expect(at("/applications/1")).toBe("/applications/3");
    expect(at("/applications/0", "secrets.yml")).toBe("/applications/0");
    expect(at("/applications")).toBe("/applications");
    expect(at("/applications/12")).toBe("/applications/14");
    expect(at("/x/applications/0")).toBe("/x/applications/0");
  });
});

describe("two Projects declaring one Id beside no Platform document", () => {
  it("are a duplicate, whatever ClusterState records", () => {
    const project = (name: string) => ({
      name: `${name}.project.yml`,
      text: `apiVersion: intent.jorisjonkers.dev/v1
kind: Project
schemaVersion: 1.0.0
project: ${name}
owner: joris
applications:
  - id: vault
    processes:
      - name: vault
        lifecycle: application
        image: vault
        runtime: none
        placement: { memory: 64Mi, cpu: 10m }
        cutover: interrupted
`,
    });
    const result = checkIntentSet([
      project("data"),
      project("secrets"),
      {
        name: "cluster-state.yml",
        text: `apiVersion: state.jorisjonkers.dev/v1
kind: ClusterState
schemaVersion: 1.0.0
cluster: production
capturedAt: "2026-10-30T00:00:00Z"
bindings: []
placements: []
instances:
  - {application: vault, instance: vault, version: 1.18.0, namespace: data-system, node: enschede-t1000-1}
`,
      },
    ]);

    expect(
      result.ok ? [] : result.diagnostics.map(({ code }) => code),
    ).toStrictEqual([
      "E_DUPLICATE_APPLICATION_ID",
      "E_DUPLICATE_APPLICATION_ID",
    ]);
  });
});
