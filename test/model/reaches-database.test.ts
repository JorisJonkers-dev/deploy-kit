// REQ-062 (docs/requirements.md): only an edge to a surface of a Process whose
// engine owns databases derives a credential.
import { describe, expect, it } from "vitest";
import { reachesDatabase } from "../../src/model/project-intent-queries.ts";

const union = [
  {
    applications: [
      {
        id: "platform-postgres",
        processes: [
          { engine: "postgres" as const, provides: { postgres: 5432 } },
          { provides: { metrics: 9187 } },
          { engine: "postgres" as const },
        ],
      },
      { id: "proxy", processes: [{ provides: { postgres: 6432 } }] },
    ],
  },
];

describe("reachesDatabase", () => {
  it.each([
    ["the database's own surface", "platform-postgres", "postgres", true],
    [
      "another Application's surface of the same name",
      "proxy",
      "postgres",
      false,
    ],
    [
      "a surface of the database's Application that no database Process provides",
      "platform-postgres",
      "metrics",
      false,
    ],
    ["a surface nothing provides", "platform-postgres", "replication", false],
  ])("holds for %s", (_, application, surface, reaches) => {
    expect(reachesDatabase({ application, surface }, union)).toBe(reaches);
  });
});
