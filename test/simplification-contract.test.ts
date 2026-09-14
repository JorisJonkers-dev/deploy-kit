// The v1 simplification's fixture-level proof.
//
// The compiler does not exist yet, so the handoff asks for executable
// fixture-level checks at the narrowest layer available, with any renderer
// proof reported as a blocker. This file is that check, per decision:
//
// 1. Observability: one optional `observability` block per Application, whole or
//    absent. A declared class names a scrape surface that its own Process
//    provides, and no project file carries monitoring policy.
// 2. Cutover: `zeroDowntime` is gone, every Process declares `cutover`, and an
//    RWO Process must declare `recreate` (rolling over RWO is the
//    E_CUTOVER_UNHONOURABLE case; there is no renderer yet to run it in).
// 3. Overrides: no `overrides` key anywhere, and a `replicas` block always
//    carries a count above one with a reason.
// 4. Hardening: no Process or sidecar authors hardening at all.
//
// spec/v1 is normative; the ADRs justify; this file proves the example estate
// against them at the fixture layer.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const repo = join(import.meta.dirname, "..");
const examples = join(repo, "spec", "v1", "examples");
const read = (path: string): string => readFileSync(path, "utf8");

const projectFiles = [
  "auth/auth.project.yml",
  "knowledge/knowledge.project.yml",
  "data/data.project.yml",
  "minimal/notes.project.yml",
].map((file) => join(examples, file));

interface Slice {
  readonly name: string;
  text: string;
}

/**
 * The processes of a project file as {name, text} slices. Indentation-keyed:
 * a process starts at `      - name:` (six spaces) and runs to the next one.
 * Exposure `routes` and negative-fixture files do not reach six spaces with
 * `- name:`, but an Application's `exposure` entry is `      - name: public`, which
 * collides, so a slice that would open inside an `exposure:` block is skipped.
 */
const PROCESS_RE = /^ {6}- name: (\S+)/;

function processesOf(file: string): Slice[] {
  const out: Slice[] = [];
  let current: Slice | null = null;
  let inExposure = false;
  for (const line of read(file).split("\n")) {
    if (/^ {4}[a-zA-Z]/.test(line)) inExposure = /^ {4}exposure:/.test(line);
    const m = PROCESS_RE.exec(line);
    // An Application-level `exposure` entry sits at the same indent as a Process
    // under `processes:`; only slices opened outside the exposure block are
    // processes.
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

test("every worked Process declares cutover, and zeroDowntime is gone", () => {
  for (const file of projectFiles) {
    const processes = processesOf(file);
    expect(processes.length, `${file}: no processes parsed`).toBeGreaterThan(0);
    for (const w of processes) {
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

test("RWO Processes declare recreate; volume-free Processes declare rolling", () => {
  for (const file of projectFiles) {
    for (const w of processesOf(file)) {
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

test("no project file carries overrides, and replicas is the sole capacity exception", () => {
  for (const file of projectFiles) {
    const text = read(file);
    expect(text, `${file}: overrides key present`).not.toMatch(/^overrides:/m);
    expect(text, `${file}: override entry syntax present`).not.toMatch(
      /derivation:/,
    );
    for (const w of processesOf(file)) {
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

interface Application {
  readonly id: string;
  text: string;
}

/**
 * The Applications of a project file as {id, text} slices. An Application starts at
 * `  - id:` (two spaces) and runs to the next one, so an Application's
 * `observability` block and its Processes are read together.
 */
function applicationsOf(file: string): Application[] {
  const out: Application[] = [];
  let current: Application | null = null;
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
  readonly process: string | null;
  readonly surface: string | null;
  readonly path: string | null;
}

/** The `observability` block of an Application slice, or null when it declares none. */
function observabilityOf(applicationText: string): Observability | null {
  const lines = applicationText.split("\n");
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
    process: value("process"),
    surface: value("surface"),
    path: value("path"),
  };
}

/** The surface names a Process slice declares under `provides`. */
function surfacesOf(processText: string): string[] {
  const lines = processText.split("\n");
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
  for (const file of projectFiles) {
    for (const s of applicationsOf(file)) {
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
  for (const file of projectFiles) {
    for (const s of applicationsOf(file)) {
      const o = observabilityOf(s.text);
      if (o === null) continue;
      expect(o.process, `${s.id}: scrape names no process`).toBeTruthy();
      expect(o.surface, `${s.id}: scrape names no surface`).toBeTruthy();
      expect(o.path, `${s.id}: scrape names no path`).toBeTruthy();
      const w = processesOf(file).find((x) => x.name === o.process);
      expect(
        w,
        `${s.id}: scrape names a Process that does not exist`,
      ).toBeDefined();
      expect(
        surfacesOf(w?.text ?? ""),
        `${s.id}: its Process provides no surface of that name`,
      ).toContain(o.surface);
    }
  }
});

test("no Process restates a scrape port, and no project carries alerting policy", () => {
  for (const file of [...projectFiles, platform]) {
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
  for (const file of projectFiles)
    expect(
      read(file),
      `${file}: a project file restates the cadence`,
    ).not.toMatch(/interval:|scrapeTimeout:/);
});

test("a class with no signal is refused, and an unknown class is not a member", () => {
  const noSignal = join(refusals, "alert-class-without-signal.project.yml");
  expect(read(noSignal)).toMatch(/^expect: E_ALERT_CLASS_WITHOUT_SIGNAL$/m);
  const a = observabilityOf(applicationsOf(noSignal)[0]?.text ?? "");
  expect(a?.alertClass, "the fixture must declare a class").toBeTruthy();
  expect(
    a?.hasScrape,
    "the fixture must declare no scrape: that is the refusal",
  ).toBe(false);
  expect(
    ALERT_CLASSES,
    "the class must be a valid member, so the missing signal is the only defect",
  ).toContain(a?.alertClass);

  const unknown = join(refusals, "alert-class-unknown.project.yml");
  expect(read(unknown)).toMatch(/^expect: schema\b/m);
  const b = observabilityOf(applicationsOf(unknown)[0]?.text ?? "");
  expect(b?.hasScrape, "the fixture must publish a signal").toBe(true);
  expect(
    ALERT_CLASSES,
    "a valid member would make this something other than the unknown-class case",
  ).not.toContain(b?.alertClass);
});

test("rolling over RWO is refused and recreate over RWO is accepted", () => {
  const refused = join(refusals, "cutover-rolling-over-rwo.project.yml");
  const accepted = join(refusals, "cutover-recreate-over-rwo.project.yml");
  expect(read(refused)).toMatch(/^expect: E_CUTOVER_UNHONOURABLE$/m);
  expect(read(accepted)).toMatch(/^expect: accepted$/m);

  const only = (file: string): Slice => {
    const processes = processesOf(file);
    expect(
      processes,
      `${file}: a refusal fixture carries one Process`,
    ).toHaveLength(1);
    const [process] = processes;
    if (process === undefined) throw new Error(`${file}: no Process`);
    return process;
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
      `${file}: a Kubernetes rollout token leaked into Project Intent`,
    ).not.toMatch(/RollingUpdate|maxSurge|maxUnavailable/);
});

test("no Process or sidecar authors hardening", () => {
  const inputs = [
    ...projectFiles,
    ...[
      "alert-class-without-signal.project.yml",
      "alert-class-unknown.project.yml",
      "cutover-rolling-over-rwo.project.yml",
      "cutover-recreate-over-rwo.project.yml",
    ].map((file) => join(refusals, file)),
  ];
  for (const file of inputs) {
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
  for (const file of projectFiles) {
    for (const w of processesOf(file)) {
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
