// The v1 simplification, proved over the parsed model.
//
// This file used to read YAML by indentation: a six-space `- name:` was a
// Workload unless it was an exposure entry, a `provides` map was ten spaces and
// a digit, and an `observability` block was whatever sat under a six-space
// prefix until something else did. Every one of those checks was a second,
// weaker parser for a language that now has one, and none of them could see a
// closed vocabulary, a discriminated union, or where in the document a defect
// was. They are replaced by checks over `parseServiceIntent`, and the closed
// vocabularies are read from the metamodel rather than re-typed here.
//
// What it proves is unchanged, per decision:
//
// 1. Observability: one optional `observability` block per Service, whole or
//    absent. A declared class names a scrape surface that its own Workload
//    provides, and no domain file carries monitoring policy.
// 2. Cutover: `zeroDowntime` is gone, every Workload declares `cutover`, and an
//    RWO Workload must declare `recreate`.
// 3. Overrides: no `overrides` key anywhere, and a `replicas` block always
//    carries a count above one with a reason.
// 4. Hardening: no Workload or sidecar authors hardening at all.
//
// spec/v1 is normative; the ADRs justify; this file proves the example estate
// against them, now at the layer the metamodel defines.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { parseServiceIntent } from "../src/application/parse-service-intent.ts";
import type {
  Domain,
  Service,
  Workload,
} from "../src/domain/service-intent/model.ts";
import { expectationOf, withoutExpectation } from "../scripts/lint-intent.ts";
import { AlertClass } from "../src/wire/service-intent/vocabularies.ts";

const repo = join(import.meta.dirname, "..");
const examples = join(repo, "spec", "v1", "examples");
const read = (path: string): string => readFileSync(path, "utf8");

const domainFiles = [
  "auth/auth.domain.yml",
  "knowledge/knowledge.domain.yml",
  "data/data.domain.yml",
  "minimal/notes.domain.yml",
].map((file) => join(examples, file));

const refusals = join(examples, "refusals");
const platform = join(examples, "platform", "platform.intent.yml");

/** The parsed document, or a failure naming the first thing that refused it. */
function model(file: string): Domain {
  const result = parseServiceIntent(withoutExpectation(read(file)), file);
  if (!result.ok) {
    const first = result.diagnostics[0];
    throw new Error(`${file}: ${first?.at ?? ""}: ${first?.message ?? ""}`);
  }
  return result.value;
}

/** Every Workload of the worked set, with the file and Service that hold it. */
function worked(): {
  file: string;
  service: Service;
  workload: Workload;
}[] {
  return domainFiles.flatMap((file) =>
    model(file).services.flatMap((service) =>
      service.workloads.map((workload) => ({ file, service, workload })),
    ),
  );
}

test("every worked Workload declares cutover, and zeroDowntime is gone", () => {
  const all = worked();
  expect(all.length, "no workloads parsed").toBeGreaterThan(0);
  for (const { workload } of all)
    expect(["rolling", "recreate"], workload.name).toContain(workload.cutover);
  for (const file of domainFiles)
    expect(read(file), `${file}: zeroDowntime present`).not.toMatch(
      /zeroDowntime/,
    );
});

test("RWO Workloads declare recreate; volume-free Workloads may declare rolling", () => {
  let withVolume = 0;
  for (const { workload } of worked()) {
    if (workload.volumes.length === 0) continue;
    withVolume += 1;
    expect(
      workload.cutover,
      `${workload.name}: an RWO volume cannot surge, so rolling is E_CUTOVER_UNHONOURABLE`,
    ).toBe("recreate");
  }
  expect(withVolume, "no worked Workload holds a volume").toBeGreaterThan(0);
});

test("no domain file carries overrides, and replicas is the sole capacity exception", () => {
  for (const file of domainFiles) {
    const text = read(file);
    expect(text, `${file}: overrides key present`).not.toMatch(/^overrides:/m);
    expect(text, `${file}: override entry syntax present`).not.toMatch(
      /derivation:/,
    );
  }
  let declared = 0;
  for (const { workload } of worked()) {
    const replicas = workload.replicas;
    if (replicas === undefined) continue;
    declared += 1;
    expect(
      replicas.count,
      `${workload.name}: count must exceed one`,
    ).toBeGreaterThan(1);
    expect(
      replicas.reason.trim(),
      `${workload.name}: reason required with replicas`,
    ).not.toBe("");
  }
  expect(
    declared,
    "no worked Workload exercises the capacity exception",
  ).toBeGreaterThan(0);
});

test("the observability block is whole or absent, and never partial", () => {
  let declared = 0;
  let omitted = 0;
  for (const file of domainFiles)
    for (const service of model(file).services) {
      const block = service.observability;
      if (block === undefined) {
        omitted += 1;
        continue;
      }
      // A half-declared block is E_ALERT_CLASS_WITHOUT_SIGNAL, so a document
      // that parsed at all already has a whole one; this is what says so.
      expect(
        block.scrape,
        `${service.id}: a class with no scrape is E_ALERT_CLASS_WITHOUT_SIGNAL`,
      ).toBeDefined();
      expect(
        AlertClass.options,
        `${service.id}: not a member of AlertClass`,
      ).toContain(block.alertClass);
      declared += 1;
    }
  expect(declared, "no Service declares observability").toBeGreaterThan(0);
  expect(
    omitted,
    "no Service omits it, so the opt-out is untested",
  ).toBeGreaterThan(0);
});

test("`none` is gone: an omitted block is the opt-out", () => {
  // The vocabulary is the metamodel's, read from it rather than re-typed.
  expect(AlertClass.options).not.toContain("none");
  for (const file of [...domainFiles, platform])
    expect(
      read(file),
      `${file}: alertClass none is no longer a member of the vocabulary`,
    ).not.toMatch(/alertClass:\s*none/);
});

test("a scrape names a surface its own Workload provides, never a port", () => {
  let checked = 0;
  for (const file of domainFiles)
    for (const service of model(file).services) {
      const scrape = service.observability?.scrape;
      if (scrape === undefined) continue;
      checked += 1;
      const workload = service.workloads.find(
        (w) => w.name === scrape.workload,
      );
      expect(
        workload,
        `${service.id}: scrape names a Workload this Service does not hold`,
      ).toBeDefined();
      expect(
        workload?.provides.map((surface) => surface.name),
        `${service.id}: its Workload provides no surface of that name`,
      ).toContain(scrape.surface);
      expect(scrape.path, `${service.id}: scrape names no path`).toMatch(/^\//);
    }
  expect(checked, "no scrape was checked").toBeGreaterThan(0);
});

test("no Workload restates a scrape port, and no domain carries alerting policy", () => {
  for (const file of [...domainFiles, platform]) {
    const text = read(file);
    // A scrape is `{workload, surface, path}` and the metamodel carries no
    // `port`, so a document restating one no longer parses at all; this keeps
    // the older spellings out of the platform document too.
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
  // Platform Intent has no metamodel until #41, so this stays a text check and
  // says so rather than pretending otherwise.
  const text = read(platform);
  expect(text, "platform intent declares no monitor cadence").toMatch(
    /^monitors:$/m,
  );
  expect(text, "no monitor interval").toMatch(/^\s+interval: \S+$/m);
  expect(text, "no monitor timeout").toMatch(/^\s+timeout: \S+$/m);
  for (const file of domainFiles)
    expect(
      read(file),
      `${file}: a domain file restates the cadence`,
    ).not.toMatch(/interval:|scrapeTimeout:/);
});

test("a class with no signal is refused, and an unknown class is not a member", () => {
  const noSignal = join(refusals, "alert-class-without-signal.domain.yml");
  expect(expectationOf(read(noSignal))).toBe("E_ALERT_CLASS_WITHOUT_SIGNAL");
  const first = parseServiceIntent(
    withoutExpectation(read(noSignal)),
    noSignal,
  );
  expect(first.ok).toBe(false);
  if (!first.ok) {
    expect(first.diagnostics.map((d) => d.code)).toStrictEqual([
      "E_ALERT_CLASS_WITHOUT_SIGNAL",
    ]);
    // The class is a valid member, so the missing signal is the only defect.
    expect(first.diagnostics[0]?.message).toMatch(
      new RegExp(AlertClass.options.join("|")),
    );
  }

  const unknown = join(refusals, "alert-class-unknown.domain.yml");
  expect(expectationOf(read(unknown))).toBe("schema");
  const second = parseServiceIntent(withoutExpectation(read(unknown)), unknown);
  expect(second.ok).toBe(false);
  if (!second.ok) {
    expect(second.diagnostics).toHaveLength(1);
    expect(second.diagnostics[0]?.at).toBe(
      "services[0].observability.alertClass",
    );
  }
});

test("rolling over RWO is refused and recreate over RWO is accepted", () => {
  const refused = join(refusals, "cutover-rolling-over-rwo.domain.yml");
  const acceptedFixture = join(
    refusals,
    "cutover-recreate-over-rwo.domain.yml",
  );
  expect(expectationOf(read(refused))).toBe("E_CUTOVER_UNHONOURABLE");
  expect(expectationOf(read(acceptedFixture))).toBe("accepted");

  const bad = parseServiceIntent(withoutExpectation(read(refused)), refused);
  expect(bad.ok).toBe(false);
  if (!bad.ok) {
    expect(bad.diagnostics.map((d) => d.code)).toStrictEqual([
      "E_CUTOVER_UNHONOURABLE",
    ]);
    expect(bad.diagnostics[0]?.at).toBe("services[0].workloads[0].cutover");
  }

  const good = model(acceptedFixture);
  const pair = [good.services[0]?.workloads[0]];
  for (const workload of pair) {
    expect(
      workload?.volumes.length,
      "the pair must both hold an RWO volume",
    ).toBeGreaterThan(0);
    expect(workload?.cutover).toBe("recreate");
  }

  // The refusal is the model's, not Kubernetes'. A Kubernetes rollout token is
  // not a key any class carries, so a document authoring one no longer parses;
  // this holds the declared *values* to the same rule. Comments may name the
  // tokens to say who owns them.
  for (const file of [refused, acceptedFixture])
    expect(
      read(file)
        .split("\n")
        .map((line) => line.replace(/(^|\s)#.*$/, ""))
        .join("\n"),
      `${file}: a Kubernetes rollout token leaked into Service Intent`,
    ).not.toMatch(/RollingUpdate|maxSurge|maxUnavailable/);
});

test("no Workload or sidecar authors hardening", () => {
  const inputs = [
    ...domainFiles,
    ...[
      "alert-class-without-signal.domain.yml",
      "alert-class-unknown.domain.yml",
      "cutover-rolling-over-rwo.domain.yml",
      "cutover-recreate-over-rwo.domain.yml",
    ].map((file) => join(refusals, file)),
  ];
  for (const file of inputs) {
    const text = read(file)
      .split("\n")
      .map((line) => line.replace(/(^|\s)#.*$/, ""))
      .join("\n");
    expect(text, `${file}: a Workload authors hardening`).not.toMatch(
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
  let ports = 0;
  for (const { workload } of worked())
    for (const surface of workload.provides) {
      ports += 1;
      expect(
        surface.port,
        `${workload.name}: ${surface.name} on ${surface.port} is E_PRIVILEGED_PORT_UNDER_NONROOT`,
      ).toBeGreaterThanOrEqual(1024);
    }
  expect(ports, "no surface was checked").toBeGreaterThan(0);
});
