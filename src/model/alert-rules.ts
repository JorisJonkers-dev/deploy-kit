// What a rule-group file says of itself (spec/v1/10-project-intent.md#alert-rules).
import { parseDocument } from "yaml";

/** The rule groups a file holds, where it is YAML whose `groups` is a list. */
export function ruleGroupsOf(content: string): unknown[] | undefined {
  const document = parseDocument(content);
  if (document.errors.length > 0) return undefined;
  const parsed: unknown = document.toJS();
  // A scalar or an empty file has no own `groups`.
  const groups = (parsed as { groups?: unknown } | null)?.groups;
  return Array.isArray(groups) && groups.length > 0 ? groups : undefined;
}
