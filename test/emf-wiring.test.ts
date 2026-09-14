// The model-driven build under emf/ has no npm script, so the pipeline wiring
// test cannot see it: a workflow step running the Maven wrapper against a
// directory with no build, or a reactor naming a module that is not on disk,
// would pass every other check and fail only in CI, or not at all. This test
// holds the Maven side to the same rule 0102 states for npm: the job CI runs is
// the build the tree contains. It also holds CodeQL to scanning that build.
//
// Deleted with emf/ at its sunset (emf/docs/adr/emf/0107).
//
// REQ-015 (docs/requirements.md): the model-driven build CI runs is the build
// in the tree.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { temporary } from "./setup.ts";

const REPOSITORY = join(import.meta.dirname, "..");

interface Workflow {
  readonly name: string;
  readonly text: string;
}

function workflows(): Workflow[] {
  const dir = join(REPOSITORY, ".github", "workflows");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yml"))
    .map((name) => ({ name, text: readFileSync(join(dir, name), "utf8") }));
}

/**
 * Every workflow step that runs the Maven wrapper, as the directory it runs
 * in. A step is the text between two list markers at the same indent, and the
 * directory is its `working-directory`, or the repository root without one.
 */
function mavenSteps(files: readonly Workflow[]): string[] {
  return files.flatMap((file) =>
    file.text
      .split(/\n(?= {6}- )/)
      .filter((step) => /\bmvnw\b/.test(step))
      .map((step) => /'working-directory':\s*'([^']+)'/.exec(step)?.[1] ?? "."),
  );
}

/** Every problem with the Maven steps and the reactor under `root`. */
function mavenWiringErrors(files: readonly Workflow[], root: string): string[] {
  const errors: string[] = [];
  for (const dir of mavenSteps(files)) {
    if (!existsSync(join(root, dir, "pom.xml")))
      errors.push(
        `a step runs the Maven wrapper in ${dir}, which names a POM that does not exist`,
      );
    if (!existsSync(join(root, dir, "mvnw")))
      errors.push(
        `a step runs the Maven wrapper in ${dir}, which holds no mvnw`,
      );
  }
  const reactor = join(root, "emf", "pom.xml");
  const modules = existsSync(reactor)
    ? [
        ...readFileSync(reactor, "utf8").matchAll(/<module>([^<]+)<\/module>/g),
      ].map((match) => match[1] ?? "")
    : [];
  for (const module of modules)
    if (!existsSync(join(root, "emf", module, "pom.xml")))
      errors.push(`emf/pom.xml names module ${module}, which is not on disk`);
  return errors;
}

function workflow(name: string, text: string): Workflow {
  return { name, text };
}

const MAVEN_STEP = [
  "    'steps':",
  "      - 'uses': 'actions/checkout@abc' # v7",
  "      - 'name': 'Verify'",
  "        'working-directory': 'emf'",
  "        'run': './mvnw -B -ntp verify'",
].join("\n");

describe("the model-driven build CI runs is the build in the tree", () => {
  it("passes over this repository's workflows and reactor", () => {
    const files = workflows();

    expect(mavenSteps(files)).toContain("emf");
    expect(mavenWiringErrors(files, REPOSITORY)).toEqual([]);
  });

  it("fails a step whose directory names a POM that does not exist", () => {
    const moved = workflow("ci.yml", MAVEN_STEP.replace("'emf'", "'java'"));

    expect(mavenWiringErrors([moved], REPOSITORY)).toEqual([
      "a step runs the Maven wrapper in java, which names a POM that does not exist",
      "a step runs the Maven wrapper in java, which holds no mvnw",
    ]);
  });

  it("fails a step with no working directory, since the root holds no build", () => {
    const rooted = workflow(
      "ci.yml",
      MAVEN_STEP.replace("        'working-directory': 'emf'\n", ""),
    );

    expect(mavenWiringErrors([rooted], REPOSITORY)).toEqual([
      "a step runs the Maven wrapper in ., which names a POM that does not exist",
      "a step runs the Maven wrapper in ., which holds no mvnw",
    ]);
  });

  it("fails a reactor that names a module which is not on disk", () => {
    const root = temporary();
    mkdirSync(join(root, "emf", "parity"), { recursive: true });
    writeFileSync(join(root, "emf", "parity", "pom.xml"), "<project/>");
    writeFileSync(
      join(root, "emf", "pom.xml"),
      "<modules><module>parity</module><module>gone</module></modules>",
    );

    expect(mavenWiringErrors([], root)).toEqual([
      "emf/pom.xml names module gone, which is not on disk",
    ]);
  });
});

describe("CodeQL scans the model-driven build", () => {
  const codeql = readFileSync(
    join(REPOSITORY, ".github", "workflows", "codeql.yml"),
    "utf8",
  );
  const config = readFileSync(
    join(REPOSITORY, ".github", "codeql", "codeql-config.yml"),
    "utf8",
  );

  it("analyses java-kotlin without a build, with the shared configuration", () => {
    expect(codeql).toContain("'language': 'java-kotlin'");
    expect(codeql).toContain("'build-mode': 'none'");
    expect(codeql).toContain(
      "'config-file': './.github/codeql/codeql-config.yml'",
    );
  });

  it("ignores build output and generated sources", () => {
    expect(config).toContain("- '**/target/**'");
    expect(config).toContain("- '**/src-gen/**'");
  });
});
