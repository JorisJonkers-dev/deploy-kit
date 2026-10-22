// The name a consumer label carries (spec/v1/16-dependencies.md#the-consumer-label):
// a label's name, so 63 characters at most, starting and ending alphanumeric.
import { describe, expect, it } from "vitest";
import { consumedOf, isLabelName } from "../../src/model/consumer-label.ts";

describe("a consumer label's name", () => {
  it("is the Application's id and the surface, joined by a dot", () => {
    expect(consumedOf("platform-postgres", "postgres")).toBe(
      "platform-postgres.postgres",
    );
  });

  it("holds 63 characters and refuses a 64th", () => {
    expect(isLabelName(consumedOf("a".repeat(58), "http"))).toBe(true);
    expect(isLabelName(consumedOf("a".repeat(59), "http"))).toBe(false);
  });

  it("starts and ends with a letter or digit, and holds only letters, digits, '-', '_' and '.'", () => {
    expect(isLabelName("a")).toBe(true);
    expect(isLabelName("a-b_c.d")).toBe(true);
    expect(isLabelName("-a.http")).toBe(false);
    expect(isLabelName("a.http-")).toBe(false);
    expect(isLabelName("a/b.http")).toBe(false);
    expect(isLabelName("")).toBe(false);
  });
});
