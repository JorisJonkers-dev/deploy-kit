// REQ-036 (docs/requirements.md): what makes two declarations of a Shared
// Intent family the same one, and what makes a second one a duplicate rather
// than a replacement.
import { describe, expect, it } from "vitest";
import {
  assetIdentity,
  declared,
  dependencyIdentity,
  derivedReadPath,
  sameDeclaration,
} from "../../src/domain/project-intent/declaration.ts";

describe("the derived read path", () => {
  it("is the path a grant of each engine is actually read from", () => {
    expect(
      derivedReadPath({
        path: "platform/postgres/kb",
        keys: ["user"],
        access: "read",
        delivery: "env",
      }),
    ).toBe("secret/data/platform/postgres/kb");
    expect(
      derivedReadPath({ engine: "database", role: "kb", delivery: "self" }),
    ).toBe("database/creds/kb");
    expect(
      derivedReadPath({
        engine: "transit",
        key: "jwt",
        operations: ["sign"],
        delivery: "self",
      }),
    ).toBe("transit/jwt");
  });

  it("keeps three engines apart where all three name one string", () => {
    const paths = [
      derivedReadPath({
        path: "x",
        keys: ["k"],
        access: "read",
        delivery: "env",
      }),
      derivedReadPath({ engine: "database", role: "x", delivery: "self" }),
      derivedReadPath({
        engine: "transit",
        key: "x",
        operations: ["sign"],
        delivery: "self",
      }),
    ];

    expect(new Set(paths).size).toBe(3);
  });
});

describe("the identity of an edge and of an Asset", () => {
  it("is what two of them may not share", () => {
    expect(
      dependencyIdentity({
        application: "platform-postgres",
        surface: "postgres",
        required: true,
      }),
    ).toBe("platform-postgres#postgres");
    // `required` is a term, not part of the identity.
    expect(
      dependencyIdentity({
        application: "platform-postgres",
        surface: "postgres",
        required: false,
      }),
    ).toBe("platform-postgres#postgres");
    expect(assetIdentity({ from: "a.conf", mountAt: "/etc/c.conf" })).toBe(
      "/etc/c.conf",
    );
  });
});

describe("what a level declared", () => {
  it("is none of it where the level left it out", () => {
    expect(declared(undefined)).toStrictEqual([]);
    expect(declared(["/tmp"])).toStrictEqual(["/tmp"]);
  });
});

describe("whether two declarations state the same thing", () => {
  it("does not depend on the order the terms were written in", () => {
    expect(sameDeclaration({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it("reads a term left out and a term set to nothing as the same", () => {
    expect(sameDeclaration({ a: 1 }, { a: 1, b: undefined })).toBe(true);
  });

  it("separates a term that differs, however deep it sits", () => {
    expect(sameDeclaration({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameDeclaration({ a: { b: [1] } }, { a: { b: [2] } })).toBe(false);
    expect(sameDeclaration({ a: { b: [1] } }, { a: { b: [1] } })).toBe(true);
    // An array's order is part of what it says.
    expect(sameDeclaration([1, 2], [2, 1])).toBe(false);
  });

  it("separates a list from an object, however few terms either holds", () => {
    expect(sameDeclaration([], {})).toBe(false);
  });

  it("separates a term set to nothing from one set to null", () => {
    expect(sameDeclaration({ a: null }, { a: undefined })).toBe(false);
    expect(sameDeclaration(null, null)).toBe(true);
    expect(sameDeclaration("x", "x")).toBe(true);
    expect(sameDeclaration("x", "y")).toBe(false);
  });
});
