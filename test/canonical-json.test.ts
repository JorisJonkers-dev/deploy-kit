// REQ-020 (docs/requirements.md). The same cases as emf/parity CanonicalJsonTest.
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../src/index.ts";

const u = (...codes: number[]): string => String.fromCharCode(...codes);
const EURO = u(0x20ac);
const DALET = u(0xfb33);
const GRIN = u(0xd83d, 0xde00);
const CONTROL = u(0x80);
const O_UMLAUT = u(0xf6);

describe("canonicalJson", () => {
  it("sorts object keys by UTF-16 code units at every depth", () => {
    const inner = {
      [EURO]: "Euro Sign",
      "\r": "Carriage Return",
      [DALET]: "Hebrew Letter Dalet With Dagesh",
      "1": "One",
      [GRIN]: "Emoji: Grinning Face",
      [CONTROL]: "Control",
      [O_UMLAUT]: "Latin Small Letter O With Diaeresis",
    };

    expect(canonicalJson(inner)).toBe(
      `{"\\r":"Carriage Return","1":"One","${CONTROL}":"Control",` +
        `"${O_UMLAUT}":"Latin Small Letter O With Diaeresis","${EURO}":"Euro Sign",` +
        `"${GRIN}":"Emoji: Grinning Face","${DALET}":"Hebrew Letter Dalet With Dagesh"}`,
    );
  });

  it("writes nested structures without insignificant whitespace", () => {
    const document = {
      processes: [{ name: "api" }, {}],
      applications: [],
      enabled: true,
      disabled: false,
    };

    expect(canonicalJson(document)).toBe(
      '{"applications":[],"disabled":false,"enabled":true,"processes":[{"name":"api"},{}]}',
    );
  });

  it("escapes only what the specification escapes", () => {
    const kept = `slash/ del${u(0x7f)} line${u(0x2028)} euro${EURO}`;
    const text = `quote" backslash\\ controls\b\f\n\r\t${u(0x0f, 0x1f)} ${kept}`;

    expect(canonicalJson(text)).toBe(
      `"quote\\" backslash\\\\ controls\\b\\f\\n\\r\\t\\u000f\\u001f ${kept}"`,
    );
  });

  it.each([
    ["0.0", "0"],
    ["-0.0", "0"],
    ["1.0", "1"],
    ["-1.5", "-1.5"],
    ["4.50", "4.5"],
    ["0.002", "0.002"],
    ["0.5", "0.5"],
    ["-0.000001", "-0.000001"],
    ["10.0", "10"],
    ["1.0E-6", "0.000001"],
    ["0.000001", "0.000001"],
    ["0.0000001", "1e-7"],
    ["1.0E-27", "1e-27"],
    ["123456789012345680000", "123456789012345680000"],
    ["1.0E21", "1e+21"],
    ["1.0E30", "1e+30"],
    ["1.2345E25", "1.2345e+25"],
    ["333333333.33333329", "333333333.3333333"],
    ["9007199254740991.0", "9007199254740991"],
    ["-9007199254740991.0", "-9007199254740991"],
    ["1.7976931348623157E308", "1.7976931348623157e+308"],
    ["4.9E-324", "5e-324"],
    ["295147905179352830000", "295147905179352830000"],
  ])("formats %s as %s", (literal, expected) => {
    expect(canonicalJson(Number(literal))).toBe(expected);
  });

  it("refuses an absent value written as null or undefined, and says where", () => {
    expect(() =>
      canonicalJson({ applications: [{ id: "auth" }, null] }),
    ).toThrow(
      "null at /applications/1: an absent optional field is absent, never null",
    );
    expect(() => canonicalJson({ x: undefined })).toThrow(
      "undefined at /x: an absent optional field is absent, never null",
    );
    expect(() => canonicalJson(null)).toThrow("null at :");
  });

  it("escapes pointer segments in messages", () => {
    expect(() => canonicalJson({ x: { "a/b~c": null } })).toThrow(
      "null at /x/a~1b~0c:",
    );
  });

  it("refuses numbers JSON cannot carry", () => {
    expect(() => canonicalJson(Number.NaN)).toThrow(
      "NaN at  is not a JSON number",
    );
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow(
      "Infinity at  is not a JSON number",
    );
  });

  it("refuses values that are not JSON", () => {
    expect(() => canonicalJson(1n)).toThrow("bigint at  is not a JSON value");
    expect(() => canonicalJson(() => 1)).toThrow(
      "function at  is not a JSON value",
    );
    expect(() => canonicalJson(new Date(0))).toThrow(
      "Date at  is not a JSON value",
    );
    expect(() => canonicalJson({ m: new Map() })).toThrow(
      "Map at /m is not a JSON value",
    );
  });

  it("refuses strings that are not well-formed Unicode", () => {
    expect(() => canonicalJson("lone \ud800 high")).toThrow(
      "string at  holds a lone surrogate at index 5",
    );
    expect(() => canonicalJson("lone \udc00 low")).toThrow(
      "string at  holds a lone surrogate at index 5",
    );
    expect(() => canonicalJson("ends \ud800")).toThrow(
      "string at  holds a lone surrogate at index 5",
    );
    expect(() => canonicalJson({ "bad \ud800": 1 })).toThrow(
      "string at  holds a lone surrogate at index 4",
    );
  });
});
