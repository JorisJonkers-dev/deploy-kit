// The v1 simplification's fixture-level proof.
//
// The compiler does not exist yet, so the handoff asks for executable
// fixture-level checks at the narrowest layer available, with any renderer
// proof reported as a blocker. This file is that check, per decision:
//
// 1. Observability: one optional `observability` block per Service, whole or
//    absent. A declared class names a scrape surface that its own Workload
//    provides, and no domain file carries monitoring policy.
// 2. Cutover: `zeroDowntime` is gone, every Workload declares `cutover`, and an
//    RWO Workload must declare `recreate` (rolling over RWO is the
//    E_CUTOVER_UNHONOURABLE case; there is no renderer yet to run it in).
// 3. Overrides: no `overrides` key anywhere, and a `replicas` block always
//    carries a count above one with a reason.
// 4. Hardening: no Workload or sidecar authors hardening at all.
//
// spec/v1 is normative; the ADRs justify; this file proves the example estate
// against them at the fixture layer.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const repo = join(import.meta.dirname, "..");
const examples = join(repo, "spec", "v1", "examples");
const read = (path: string): string => readFileSync(path, "utf8");

const domainFiles = [
  "auth/auth.domain.yml",
  "knowledge/knowledge.domain.yml",
  "data/data.domain.yml",
  "minimal/notes.domain.yml",
].map((file) => join(examples, file));

interface Slice {
  readonly name: string;
  text: string;
}

/**
 * The workloads of a domain file as {name, text} slices. Indentation-keyed:
 * a workload starts at `      - name:` (six spaces) and runs to the next one.
 * Exposure `routes` and negative-fixture files do not reach six spaces with
 * `- name:`, but a Service's `exposure` entry is `      - name: public`, which
 * collides, so a slice that would open inside an `exposure:` block is skipped.
 */
const WORKLOAD_RE = /^ {6}- name: (\S+)/;

function workloadsOf(file: string): Slice[] {
  const out: Slice[] = [];
  let current: Slice | null = null;
  let inExposure = false;
  for (const line of read(file).split("\n")) {
    if (/^ {4}[a-zA-Z]/.test(line)) inExposure = /^ {4}exposure:/.test(line);
    const m = WORKLOAD_RE.exec(line);
    // A Service-level `exposure` entry sits at the same indent as a Workload
    // under `workloads:`; only slices opened outside the exposure block are
    // workloads.
    if (m && !inExposure) {
      if (current) out.push(current);
      current = { name: m[1] ?? "", text: "" };
    } else if (current) {
      current.text += `${line}\n`;
    }
  }
  if (current) out.push(current);
  return out;
}

test("every worked Workload declares cutover, and zeroDowntime is gone", () => {
  for (const file of domainFiles) {
    const workloads = workloadsOf(file);
    expect(workloads.length, `${file}: no workloads parsed`).toBeGreaterThan(0);
    for (const w of workloads) {
      const rel = `${file.split("/").pop() ?? file}#${w.name}`;
      expect(w.text, `${rel}: no cutover declaration`).toMatch(
        /^\s+cutover: (rolling|recreate)$/m,
      );
      expect(w.text, `${rel}: zeroDowntime present`).not.toMatch(
        /zeroDowntime/,
      );
    }
  }
});

test("RWO Workloads declare recreate; volume-free Workloads declare rolling", () => {
  for (const file of domainFiles) {
    for (const w of workloadsOf(file)) {
      const hasVolume = /^\s+volumes:$/m.test(w.text);
      const cutover = /^\s+cutover: (rolling|recreate)$/m.exec(w.text)?.[1];
      expect(cutover, `${w.name}: cutover missing`).toBeDefined();
      if (hasVolume)
        expect(
          cutover,
          `${w.name}: an RWO volume cannot surge, so rolling is E_CUTOVER_UNHONOURABLE`,
        ).toBe("recreate");
    }
  }
});

test("no domain file carries overrides, and replicas is the sole capacity exception", () => {
  for (const file of domainFiles) {
    const text = read(file);
    expect(text, `${file}: overrides key present`).not.toMatch(/^overrides:/m);
    expect(text, `${file}: override entry syntax present`).not.toMatch(
      /derivation:/,
    );
    for (const w of workloadsOf(file)) {
      const replicas =
        /^\s+replicas:\s*$\n\s+count: (\d+)(?:\n\s+reason: (.+))?/m.exec(
          w.text,
        );
      if (!replicas) continue;
      expect(
        Number(replicas[1]),
        `${w.name}: count must exceed one`,
      ).toBeGreaterThan(1);
      expect(
        replicas[2]?.trim() ?? "",
        `${w.name}: reason required with replicas`,
      ).not.toBe("");
    }
  }
});

/** A file's declared lines, with whole-line and trailing comments removed. */
const declarationsOf = (file: string): string =>
  read(file)
    .split("\n")
    .map((line) => line.replace(/(^|\s)#.*$/, ""))
    .join("\n");

const refusals = join(examples, "refusals");
const platform = join(examples, "platform", "platform.intent.yml");

interface Service {
  readonly id: string;
  text: string;
}

/**
 * The Services of a domain file as {id, text} slices. A Service starts at
 * `  - id:` (two spaces) and runs to the next one, so a Service's
 * `observability` block and its Workloads are read together.
 */
function servicesOf(file: string): Service[] {
  const out: Service[] = [];
  let current: Service | null = null;
  for (const line of read(file).split("\n")) {
    const m = /^ {2}- id: (\S+)/.exec(line);
    if (m) {
      if (current) out.push(current);
      current = { id: m[1] ?? "", text: "" };
    } else if (current) {
      current.text += `${line}\n`;
    }
  }
  if (current) out.push(current);
  return out;
}

interface Observability {
  readonly alertClass: string | null;
  readonly hasScrape: boolean;
  readonly workload: string | null;
  readonly surface: string | null;
  readonly path: string | null;
}

/** The `observability` block of a Service slice, or null when it declares none. */
function observabilityOf(serviceText: string): Observability | null {
  const lines = serviceText.split("\n");
  const start = lines.findIndex((line) => /^ {4}observability:\s*$/.test(line));
  if (start === -1) return null;
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    if (!/^ {6}/.test(line)) break;
    body.push(line);
  }
  const value = (key: string): string | null => {
    const line = body.find((l) => l.trim().startsWith(`${key}:`));
    return line === undefined
      ? null
      : line.split(":").slice(1).join(":").replace(/#.*$/, "").trim();
  };
  return {
    alertClass: value("alertClass"),
    hasScrape: body.some((line) => /^ {6}scrape:\s*$/.test(line)),
    workload: value("workload"),
    surface: value("surface"),
    path: value("path"),
  };
}

/** The surface names a Workload slice declares under `provides`. */
function surfacesOf(workloadText: string): string[] {
  const lines = workloadText.split("\n");
  const start = lines.findIndex((line) => /^ {8}provides:\s*$/.test(line));
  if (start === -1) return [];
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const m = /^ {10}([a-zA-Z0-9-]+):\s*(\d+)/.exec(line);
    if (!m) break;
    out.push(m[1] ?? "");
  }
  return out;
}

const ALERT_CLASSES = ["business-hours", "urgent", "page"];

test("the observability block is whole or absent, and never partial", () => {
  let declared = 0;
  let omitted = 0;
  for (const file of domainFiles) {
    for (const s of servicesOf(file)) {
      const o = observabilityOf(s.text);
      if (o === null) {
        expect(
          s.text,
          `${s.id}: alertClass outside an observability block`,
        ).not.toMatch(/^\s+alertClass:/m);
        omitted += 1;
        continue;
      }
      expect(
        o.alertClass,
        `${s.id}: observability block with no alertClass`,
      ).toBeTruthy();
      expect(
        o.hasScrape,
        `${s.id}: a class with no scrape is E_ALERT_CLASS_WITHOUT_SIGNAL`,
      ).toBe(true);
      expect(ALERT_CLASSES, `${s.id}: not a member of AlertClass`).toContain(
        o.alertClass,
      );
      declared += 1;
    }
  }
  expect(declared, "no Service declares observability").toBeGreaterThan(0);
  expect(
    omitted,
    "no Service omits it, so the opt-out is untested",
  ).toBeGreaterThan(0);
});

test("`none` is gone: an omitted block is the opt-out", () => {
  for (const file of [...domainFiles, platform])
    expect(
      read(file),
      `${file}: alertClass none is no longer a member of the vocabulary`,
    ).not.toMatch(/alertClass:\s*none/);
});

test("a scrape names a surface its own Workload provides, never a port", () => {
  for (const file of domainFiles) {
    for (const s of servicesOf(file)) {
      const o = observabilityOf(s.text);
      if (o === null) continue;
      expect(o.workload, `${s.id}: scrape names no workload`).toBeTruthy();
      expect(o.surface, `${s.id}: scrape names no surface`).toBeTruthy();
      expect(o.path, `${s.id}: scrape names no path`).toBeTruthy();
      const w = workloadsOf(file).find((x) => x.name === o.workload);
      expect(
        w,
        `${s.id}: scrape names a Workload that does not exist`,
      ).toBeDefined();
      expect(
        surfacesOf(w?.text ?? ""),
        `${s.id}: its Workload provides no surface of that name`,
      ).toContain(o.surface);
    }
  }
});

test("no Workload restates a scrape port, and no domain carries alerting policy", () => {
  for (const file of [...domainFiles, platform]) {
    const text = read(file);
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
  for (const file of domainFiles)
    expect(
      read(file),
      `${file}: a domain file restates the cadence`,
    ).not.toMatch(/interval:|scrapeTimeout:/);
});

test("a class with no signal is refused, and an unknown class is not a member", () => {
  const noSignal = join(refusals, "alert-class-without-signal.domain.yml");
  expect(read(noSignal)).toMatch(/^expect: E_ALERT_CLASS_WITHOUT_SIGNAL$/m);
  const a = observabilityOf(servicesOf(noSignal)[0]?.text ?? "");
  expect(a?.alertClass, "the fixture must declare a class").toBeTruthy();
  expect(
    a?.hasScrape,
    "the fixture must declare no scrape: that is the refusal",
  ).toBe(false);
  expect(
    ALERT_CLASSES,
    "the class must be a valid member, so the missing signal is the only defect",
  ).toContain(a?.alertClass);

  const unknown = join(refusals, "alert-class-unknown.domain.yml");
  expect(read(unknown)).toMatch(/^expect: schema\b/m);
  const b = observabilityOf(servicesOf(unknown)[0]?.text ?? "");
  expect(b?.hasScrape, "the fixture must publish a signal").toBe(true);
  expect(
    ALERT_CLASSES,
    "a valid member would make this something other than the unknown-class case",
  ).not.toContain(b?.alertClass);
});

test("rolling over RWO is refused and recreate over RWO is accepted", () => {
  const refused = join(refusals, "cutover-rolling-over-rwo.domain.yml");
  const accepted = join(refusals, "cutover-recreate-over-rwo.domain.yml");
  expect(read(refused)).toMatch(/^expect: E_CUTOVER_UNHONOURABLE$/m);
  expect(read(accepted)).toMatch(/^expect: accepted$/m);

  const only = (file: string): Slice => {
    const workloads = workloadsOf(file);
    expect(
      workloads,
      `${file}: a refusal fixture carries one Workload`,
    ).toHaveLength(1);
    const [workload] = workloads;
    if (workload === undefined) throw new Error(`${file}: no Workload`);
    return workload;
  };
  const bad = only(refused);
  const good = only(accepted);
  for (const w of [bad, good])
    expect(w.text, `${w.name}: the pair must both hold an RWO volume`).toMatch(
      /^\s+volumes:$/m,
    );
  expect(bad.text).toMatch(/^\s+cutover: rolling$/m);
  expect(good.text).toMatch(/^\s+cutover: recreate$/m);

  // The refusal is the model's, not Kubernetes'. No Kubernetes rollout token
  // may appear as a declared value in either file: the adapter derives the
  // strategy. Comments may name the tokens to say who owns them.
  for (const file of [refused, accepted])
    expect(
      declarationsOf(file),
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
    const text = declarationsOf(file);
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
  for (const file of domainFiles) {
    for (const w of workloadsOf(file)) {
      const lines = w.text.split("\n");
      const start = lines.findIndex((line) => /^ {8}provides:\s*$/.test(line));
      if (start === -1) continue;
      for (const line of lines.slice(start + 1)) {
        if (line.trim() === "" || line.trim().startsWith("#")) continue;
        const m = /^ {10}([a-zA-Z0-9-]+):\s*(\d+)/.exec(line);
        if (!m) break;
        expect(
          Number(m[2]),
          `${w.name}: ${m[1] ?? ""} on ${m[2] ?? ""} is E_PRIVILEGED_PORT_UNDER_NONROOT`,
        ).toBeGreaterThanOrEqual(1024);
      }
    }
  }
});
