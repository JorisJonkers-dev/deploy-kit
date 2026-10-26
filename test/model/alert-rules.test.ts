// REQ-093 (docs/requirements.md): a rule-group file holds a non-empty
// `groups` list, or holds no groups.
import { describe, expect, it } from "vitest";
import { ruleGroupsOf } from "../../src/model/alert-rules.ts";

describe("a rule-group file's groups", () => {
  it("are the list it holds under `groups`", () => {
    expect(
      ruleGroupsOf("groups:\n  - name: platform\n    rules: []\n"),
    ).toStrictEqual([{ name: "platform", rules: [] }]);
  });

  it.each([
    ["YAML that does not parse", "groups: [\n"],
    ["an empty file", ""],
    ["a null", "null\n"],
    ["a scalar", "just text\n"],
    ["a list", "- name: platform\n"],
    ["no groups", "rules: []\n"],
    ["groups that are no list", "groups: platform\n"],
    ["an empty list of groups", "groups: []\n"],
  ])("are none for %s", (_, content) => {
    expect(ruleGroupsOf(content)).toBeUndefined();
  });
});
