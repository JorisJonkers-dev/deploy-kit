// REQ-092 (docs/requirements.md): a dashboard file names its uid, a non-empty
// string at the top of its JSON, or names none.
import { describe, expect, it } from "vitest";
import { dashboardUidOf } from "../../src/model/dashboards.ts";

describe("a dashboard's uid", () => {
  it("is the string the JSON names at its top", () => {
    expect(dashboardUidOf('{"uid": "rabbitmq"}')).toBe("rabbitmq");
  });

  it.each([
    ["JSON that does not parse", "{uid: rabbitmq"],
    ["JSON that is no object", '"rabbitmq"'],
    ["a null", "null"],
    ["an object without one", '{"title": "Board"}'],
    ["a uid that is no string", '{"uid": 7}'],
    ["an empty uid", '{"uid": ""}'],
  ])("is none for %s", (_, content) => {
    expect(dashboardUidOf(content)).toBeUndefined();
  });
});
