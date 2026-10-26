// REQ-101 (docs/requirements.md), at the step: what an identity file cannot
// say in a language, and how a long role list is laid out so a formatter
// leaves it alone.
import { describe, expect, it } from "vitest";
import {
  generateIdentity,
  type IdentityDeclaration,
} from "../../src/generate/identity.ts";

const declared = (...roles: string[]): IdentityDeclaration => ({
  client: "notes",
  roles: ["user", ...roles],
  contract: "1.2",
});

/** The written file, where the declaration can be written. */
function written(...args: Parameters<typeof generateIdentity>): string {
  const out = generateIdentity(...args);
  if (typeof out !== "string") throw new Error(out.message);
  return out;
}

describe("an identity file", () => {
  it("names each role in the language's own case", () => {
    const roles = declared("release-manager", "admin2");

    expect(written(roles, "go")).toContain(
      '\tRoleReleaseManager Role = "release-manager"\n\tRoleAdmin2         Role = "admin2"\n',
    );
    expect(written(roles, "kotlin", { package: "dev.notes" })).toContain(
      '    RELEASE_MANAGER("release-manager"),\n    ADMIN2("admin2"),\n',
    );
    expect(written(roles, "python")).toContain(
      '    RELEASE_MANAGER = "release-manager"\n    ADMIN2 = "admin2"\n',
    );
    expect(written(roles, "rust")).toContain(
      '            AppRole::ReleaseManager => "release-manager",\n',
    );
    expect(written(roles, "typescript")).toContain(
      'export const APP_ROLES = ["user", "release-manager", "admin2"] as const;',
    );
  });

  it("is refused where two roles spell one identifier, in the languages that would", () => {
    const roles = declared("a-b", "a--b");
    const message =
      "the roles a-b and a--b are both AB; rename one in the client block";

    expect(generateIdentity(roles, "go")).toStrictEqual({ message });
    expect(generateIdentity(roles, "rust")).toStrictEqual({ message });
    // A constant keeps every hyphen, and a string is a string.
    expect(
      typeof generateIdentity(roles, "kotlin", { package: "dev.notes" }),
    ).toBe("string");
    expect(typeof generateIdentity(roles, "python")).toBe("string");
    expect(typeof generateIdentity(roles, "typescript")).toBe("string");
  });

  it("is refused in Rust for a role that is a keyword there", () => {
    expect(generateIdentity(declared("self"), "rust")).toStrictEqual({
      message:
        "the role self is Self, a Rust keyword; rename it in the client block",
    });
    expect(typeof generateIdentity(declared("self"), "go")).toBe("string");
  });

  it("is refused in Kotlin without a package, or with one that is not a package name", () => {
    expect(generateIdentity(declared(), "kotlin")).toStrictEqual({
      message: "a Kotlin identity file needs --package",
    });
    for (const name of ["dev..notes", "1dev.notes", "dev.notes.", "dev-notes"])
      expect(
        generateIdentity(declared(), "kotlin", { package: name }),
      ).toStrictEqual({
        message: `${name} is not a Kotlin package name`,
      });
    expect(written(declared(), "kotlin", { package: "Dev_1.notes" })).toContain(
      "\n\npackage Dev_1.notes\n",
    );
  });

  describe("lays a role list out as its formatter would", () => {
    /** `count` roles after `user`, each `r` and a number. */
    const roles = (count: number) =>
      declared(...Array.from({ length: count }, (_, i) => `r${String(i)}`));
    const oneLine = (items: readonly string[]) => items.join(", ");

    it("keeps a line of exactly 80 columns in TypeScript, and a literal of exactly 60 in Rust", () => {
      // `export const APP_ROLES = ["user", "<33>"] as const;` is 80 columns.
      expect(written(declared("a".repeat(33)), "typescript")).toContain(
        `export const APP_ROLES = ["user", "${"a".repeat(33)}"] as const;\n`,
      );
      expect(written(declared("a".repeat(34)), "typescript")).toContain(
        "export const APP_ROLES = [\n",
      );
      // `[AppRole::User, AppRole::<34>]` is 60 columns.
      const variant = `A${"a".repeat(33)}`;
      expect(written(declared("a".repeat(34)), "rust")).toContain(
        `= [AppRole::User, AppRole::${variant}];\n`,
      );
      expect(written(declared("a".repeat(35)), "rust")).toContain(
        "    pub const ALL: [AppRole; 2] = [\n        AppRole::User,\n",
      );
    });

    it("keeps a TypeScript list on one line exactly while the line fits 80 columns", () => {
      for (let count = 0; count <= 20; count++) {
        const declaration = roles(count);
        const items = declaration.roles.map((role) => `"${role}"`);
        const line = `export const APP_ROLES = [${oneLine(items)}] as const;`;
        const out = written(declaration, "typescript");
        if (line.length <= 80) expect(out).toContain(`\n${line}\n`);
        else
          expect(out).toContain(
            `export const APP_ROLES = [\n${items.map((item) => `  ${item},`).join("\n")}\n] as const;\n`,
          );
      }
      // Both layouts occur in that range.
      expect(written(roles(1), "typescript")).toContain(
        '= ["user", "r0"] as const;',
      );
      expect(written(roles(20), "typescript")).toContain('= [\n  "user",\n');
    });

    it("keeps a Rust array on one line exactly while the literal fits 60 columns", () => {
      for (let count = 0; count <= 20; count++) {
        const declaration = roles(count);
        const items = declaration.roles.map(
          (role) => `AppRole::${role.charAt(0).toUpperCase()}${role.slice(1)}`,
        );
        const opening = `    pub const ALL: [AppRole; ${String(items.length)}] = [`;
        const literal = `[${oneLine(items)}]`;
        const out = written(declaration, "rust");
        if (literal.length <= 60)
          expect(out).toContain(`\n${opening}${oneLine(items)}];\n`);
        else
          expect(out).toContain(
            `\n${opening}\n${items.map((item) => `        ${item},`).join("\n")}\n    ];\n`,
          );
      }
      expect(written(roles(2), "rust")).toContain(
        "[AppRole::User, AppRole::R0, AppRole::R1];",
      );
      expect(written(roles(4), "rust")).toContain(
        "= [\n        AppRole::User,\n",
      );
    });
  });
});
