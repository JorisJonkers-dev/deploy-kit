// REQ-029 (docs/requirements.md): a route's and a scrape's names link to the
// Process and surface they mean, and a name that links to nothing is refused at
// the pointer of what wrote it.
import { describe, expect, it } from "vitest";
import { parseProjectIntent } from "../../src/index.ts";

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

const refusalsOf = (text: string): { code: string; path: string }[] => {
  const result = parseProjectIntent(text);
  return result.ok
    ? []
    : result.diagnostics.map(({ code, path }) => ({ code, path }));
};

describe("the linking step", () => {
  const withRoute = (process: string, surface: string): string =>
    DOCUMENT.replace(
      "GRANTS",
      `    exposure:\n      - name: public\n        host: batch.jorisjonkers.dev\n        audience: lan\n        routes:\n          - { path: /, match: prefix, process: ${process}, surface: ${surface} }\n`,
    ).replace(
      "        cutover: interrupted\n",
      "        provides: { http: 8080 }\n        cutover: interrupted\n",
    );

  const withScrape = (process: string, surface: string): string =>
    DOCUMENT.replace(
      "GRANTS",
      `    observability:\n      alertClass: urgent\n      scrape: { process: ${process}, surface: ${surface}, path: /metrics }\n`,
    ).replace(
      "        cutover: interrupted\n",
      "        provides: { http: 8080 }\n        cutover: interrupted\n",
    );

  it("refuses a route naming a Process the Application does not have, and reports its surface no further", () => {
    expect(refusalsOf(withRoute("elsewhere", "nothing"))).toStrictEqual([
      {
        code: "E_UNKNOWN_PROCESS",
        path: "/applications/0/exposure/0/routes/0",
      },
    ]);
  });

  it("refuses a scrape naming a surface its Process does not provide", () => {
    expect(refusalsOf(withScrape("worker", "metrics"))).toStrictEqual([
      {
        code: "E_UNKNOWN_SURFACE",
        path: "/applications/0/observability/scrape",
      },
    ]);
  });

  it("links a route and a scrape that name what the Application holds", () => {
    expect(refusalsOf(withRoute("worker", "http"))).toStrictEqual([]);
    expect(refusalsOf(withScrape("worker", "http"))).toStrictEqual([]);
  });

  it("says what did not link and how to fix it", () => {
    const result = parseProjectIntent(withRoute("elsewhere", "nothing"));
    const [process] = result.ok ? [] : result.diagnostics;
    const scraped = parseProjectIntent(withScrape("worker", "metrics"));
    const [surface] = scraped.ok ? [] : scraped.diagnostics;

    expect(process?.message).toBe(
      "no Process of this Application is named elsewhere",
    );
    expect(process?.hint).toBe("Name one of the Application's own Processes.");
    expect(surface?.message).toBe("worker provides no surface named metrics");
    expect(surface?.hint).toBe(
      "Name a surface the Process declares in its `provides`.",
    );
  });
});
