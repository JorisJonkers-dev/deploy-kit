// A rule-group file is read beside its project file and holds rule groups
// (spec/v1/10-project-intent.md#alert-rules).
import { ruleGroupsOf } from "../model/alert-rules.ts";
import type { Diagnostic } from "../model/diagnostic.ts";
import type { ProjectIntentDocument } from "../model/project-intent.ts";

/** Every rule-group file `document` names that `read` does not hold, or that holds no groups. */
export function alertRuleDiagnostics(
  document: ProjectIntentDocument,
  read: (from: string) => string | undefined,
): Diagnostic[] {
  return document.applications.flatMap((application, a) =>
    // A missing list and an empty one carry nothing alike.
    // Stryker disable next-line ArrayDeclaration
    (application.alertRules ?? []).flatMap(({ from }, r): Diagnostic[] => {
      const path = `/applications/${String(a)}/alertRules/${String(r)}/from`;
      const content = read(from);
      if (content === undefined)
        return [
          {
            code: "E_ALERT_RULES_NOT_FOUND",
            path,
            message: `no file ${from} is read beside the project file`,
            hint: "Commit the rule-group file at that path beside the project file, or correct `from`.",
          },
        ];
      return ruleGroupsOf(content) === undefined
        ? [
            {
              code: "E_ALERT_RULES_WITHOUT_GROUPS",
              path,
              message: `${from} holds no list of rule groups under \`groups\``,
              hint: "Write the file as Prometheus rule groups: a `groups` list, each with a name and rules.",
            },
          ]
        : [];
    }),
  );
}
