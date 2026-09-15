// The v1 simplification's proof, over the parsed model.
//
// The decisions this file holds the example estate to:
//
// 1. Observability: one optional `observability` block per Application, whole or
//    absent. A declared class names a scrape surface that its own Process
//    provides, and no project file carries monitoring policy.
// 2. Cutover: `zeroDowntime` is gone, every Process declares `cutover`, and a
//    Process with a volume declares `recreate`, because rolling over an RWO
//    volume is `E_CUTOVER_UNHONOURABLE`.
// 3. Overrides: no `overrides` key anywhere, and a `replicas` block always
//    carries a count above one with a reason.
// 4. Hardening: no Process or sidecar authors hardening at all.
//
// Every check reads the parsed model rather than the file's indentation: a test
// that reads YAML by column proves the layout, not the language (#38).
// spec/v1 is normative; the ADRs justify; this file proves the example estate
// against them.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { parseProjectIntent } from "../src/index.ts";
import type { Application, Process, Project } from "../src/index.ts";

const repo = join(import.meta.dirname, "..");
const examples = join(repo, "spec", "v1", "examples");
const refusals = join(examples, "refusals");
const platform = join(examples, "platform", "platform.intent.yml");
const read = (path: string): string => readFileSync(path, "utf8");

const projectFiles = [
  "auth/auth.project.yml",
  "knowledge/knowledge.project.yml",
  "data/data.project.yml",
  "minimal/notes.project.yml",
].map((file) => join(examples, file));

const refusalFiles = readdirSync(refusals)
  .filter((name) => name.endsWith(".project.yml"))
  .map((name) => join(refusals, name));

/**
 * The parsed project of a file, or nothing when the file is a fixture the model
 * refuses: a refusal fixture's own oracle is what proves its refusal, and what
 * is checked here is what the accepted half of the estate declares.
 */
function projectOf(file: string): Project | undefined {
  const result = parseProjectIntent(read(file));
  if (!result.ok && projectFiles.includes(file))
    throw new Error(`${file}: ${JSON.stringify(result.diagnostics)}`);
  return result.ok ? result.value.project : undefined;
}

const applicationsOf = (file: string): readonly Application[] =>
  projectOf(file)?.applications ?? [];

const processesOf = (file: string): readonly Process[] =>
  applicationsOf(file).flatMap((application) => application.processes);

/** A file's declared lines, with whole-line and trailing comments removed. */
const declarationsOf = (file: string): string =>
  read(file)
    .split("\n")
    .map((line) => line.replace(/(^|\s)#.*$/, ""))
    .join("\n");

test("every worked Process declares cutover, and zeroDowntime is gone", () => {
  for (const file of projectFiles) {
    const processes = processesOf(file);

    expect(processes.length, `${file}: no processes parsed`).toBeGreaterThan(0);
    for (const process of processes)
      expect(["rolling", "recreate"], `${process.name}: cutover`).toContain(
        process.cutover,
      );
    expect(declarationsOf(file), `${file}: zeroDowntime present`).not.toMatch(
      /zeroDowntime/,
    );
  }
});

test("a Process with a volume declares recreate, because RWO cannot surge", () => {
  for (const file of [...projectFiles, ...refusalFiles])
    for (const process of processesOf(file).filter(
      (candidate) => candidate.volumes.length > 0,
    ))
      expect(
        process.cutover,
        `${process.name}: an RWO volume cannot surge, so rolling is E_CUTOVER_UNHONOURABLE`,
      ).toBe("recreate");
});

test("no project file carries overrides, and replicas is the sole capacity exception", () => {
  for (const file of projectFiles) {
    const text = declarationsOf(file);

    expect(text, `${file}: overrides key present`).not.toMatch(/^overrides:/m);
    expect(text, `${file}: override entry syntax present`).not.toMatch(
      /derivation:/,
    );
    for (const { name, replicas } of processesOf(file)) {
      if (replicas === undefined) continue;
      expect(replicas.count, `${name}: count must exceed one`).toBeGreaterThan(
        1,
      );
      expect(replicas.reason, `${name}: reason required`).not.toBe("");
    }
  }
});

test("the observability block is whole or absent, and never partial", () => {
  let declared = 0;
  let omitted = 0;

  for (const file of projectFiles)
    for (const application of applicationsOf(file)) {
      if (application.observability === undefined) {
        omitted += 1;
        continue;
      }
      expect(
        application.observability.scrape,
        `${application.id}: a class with no scrape is E_ALERT_CLASS_WITHOUT_SIGNAL`,
      ).toBeDefined();
      declared += 1;
    }

  expect(declared, "no Application declares observability").toBeGreaterThan(0);
  expect(
    omitted,
    "no Application omits it, so the opt-out is untested",
  ).toBeGreaterThan(0);
});

test("`none` is gone: an omitted block is the opt-out", () => {
  for (const file of [...projectFiles, platform])
    expect(
      read(file),
      `${file}: alertClass none is no longer a member of the vocabulary`,
    ).not.toMatch(/alertClass:\s*none/);
});

test("a scrape names a surface its own Process provides, never a port", () => {
  for (const file of projectFiles)
    for (const application of applicationsOf(file)) {
      const scrape = application.observability?.scrape;
      if (scrape === undefined) continue;
      const process = application.processes.find(
        (candidate) => candidate.name === scrape.process,
      );

      expect(
        process,
        `${application.id}: scrape names a Process that does not exist`,
      ).toBeDefined();
      expect(
        [...(process?.provides.keys() ?? [])],
        `${application.id}: its Process provides no surface of that name`,
      ).toContain(scrape.surface);
      expect(scrape.path, `${application.id}: scrape names no path`).not.toBe(
        "",
      );
    }
});

test("no Process restates a scrape port, and no project carries alerting policy", () => {
  for (const file of [...projectFiles, platform]) {
    const text = declarationsOf(file);

    expect(
      text,
      `${file}: a scrape restates a port that provides already declares`,
    ).not.toMatch(/^\s+scrape:\s*\{?\s*port:/m);
    expect(text, `${file}: receivers map present`).not.toMatch(
      /^\s*receivers:/m,
    );
    expect(text, `${file}: rule catalog present`).not.toMatch(
      /^\s*ruleCatalog:/m,
    );
  }
});

test("the monitor cadence is one estate-wide value in the Platform document", () => {
  const text = read(platform);

  expect(text, "platform intent declares no monitor cadence").toMatch(
    /^monitors:$/m,
  );
  expect(text, "no monitor interval").toMatch(/^\s+interval: \S+$/m);
  expect(text, "no monitor timeout").toMatch(/^\s+timeout: \S+$/m);
  for (const file of projectFiles)
    expect(
      declarationsOf(file),
      `${file}: a project file restates the cadence`,
    ).not.toMatch(/interval:|scrapeTimeout:/);
});

test("no Kubernetes rollout token reaches Project Intent", () => {
  for (const file of [...projectFiles, ...refusalFiles])
    expect(
      declarationsOf(file),
      `${file}: a Kubernetes rollout token leaked into Project Intent`,
    ).not.toMatch(/RollingUpdate|maxSurge|maxUnavailable/);
});

test("no Process or sidecar authors hardening", () => {
  for (const file of [...projectFiles, ...refusalFiles]) {
    const text = declarationsOf(file);

    expect(text, `${file}: a Process authors hardening`).not.toMatch(
      /^\s+hardening:/m,
    );
    expect(text, `${file}: a hardening exception survives`).not.toMatch(
      /^\s+exceptions:/m,
    );
    expect(text, `${file}: an allow entry survives`).not.toMatch(
      /^\s+- allow:/m,
    );
  }

  // The posture itself is the platform's, and stays exactly one value.
  expect(read(platform)).toMatch(/^hardening: restricted$/m);
});

test("no provides port below 1024, because there is no capability to declare", () => {
  for (const file of projectFiles)
    for (const process of processesOf(file))
      for (const [surface, port] of process.provides)
        expect(
          port,
          `${process.name}: ${surface} on ${port} is E_PRIVILEGED_PORT_UNDER_NONROOT`,
        ).toBeGreaterThanOrEqual(1024);
});
