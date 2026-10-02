// Authored YAML in, a plain value out. Only the subset the model's files use is
// read: one document, no anchors, aliases or explicit tags. Anything else is
// refused rather than interpreted.
import { isAlias, isNode, parseAllDocuments, visit } from "yaml";
import type { Diagnostic, Result } from "../model/diagnostic.ts";

const HINT =
  "Write plain block or flow YAML: one document, no anchors, aliases or tags.";

function refusal(message: string): Diagnostic {
  return { code: "schema", path: "", message, hint: HINT };
}

export function readYaml(text: string): Result<unknown> {
  const documents = parseAllDocuments(text);
  if (documents.length !== 1)
    return {
      ok: false,
      diagnostics: [
        refusal(`expected one YAML document, found ${documents.length}`),
      ],
    };
  const [document] = documents as [(typeof documents)[number]];
  const reasons = [...document.errors, ...document.warnings].map(
    ({ message }) => message,
  );
  visit(document, (_key, node) => {
    if (isAlias(node)) reasons.push("an alias is not read");
    else if (isNode(node) && node.anchor !== undefined)
      reasons.push("an anchor is not read");
    else if (isNode(node) && node.tag !== undefined)
      reasons.push("an explicit tag is not read");
  });
  // Refused once, at the root, however often the text breaks the subset
  // (spec/v1/10-project-intent.md#the-yaml-subset-that-is-read).
  return reasons.length > 0
    ? { ok: false, diagnostics: [refusal(reasons.join("; "))] }
    : { ok: true, value: document.toJS() as unknown };
}
