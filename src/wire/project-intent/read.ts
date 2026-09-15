// Authored YAML in, a plain value out. Only the subset the model's files use is
// read: one document, no anchors, aliases or explicit tags. Anything else is
// refused rather than interpreted.
import { isAlias, isNode, parseAllDocuments, visit } from "yaml";
import type { Diagnostic, Result } from "../../domain/diagnostic.ts";

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
  const diagnostics = [...document.errors, ...document.warnings].map((error) =>
    refusal(error.message),
  );
  visit(document, (_key, node) => {
    if (isAlias(node)) diagnostics.push(refusal("an alias is not read"));
    else if (isNode(node) && node.anchor !== undefined)
      diagnostics.push(refusal("an anchor is not read"));
    else if (isNode(node) && node.tag !== undefined)
      diagnostics.push(refusal("an explicit tag is not read"));
  });
  return diagnostics.length > 0
    ? { ok: false, diagnostics }
    : { ok: true, value: document.toJS() as unknown };
}
