// This repository's own ESLint rules: the ones no configured rule can express,
// because each reads something a stock rule does not (an import specifier's
// prefix, a file's name, which file an import lands in). Each message opens
// with the ledger id it enforces (docs/architecture-rules.md).
import { isBuiltin } from "node:module";
import { basename } from "node:path";
import type { ESLint, Rule } from "eslint";
import type { Expression } from "estree";

/** One stateless check per node kind, reporting `message` where it fires. */
function rule(
  description: string,
  create: Rule.RuleModule["create"],
): Rule.RuleModule {
  return {
    meta: { type: "problem", docs: { description }, schema: [] },
    create,
  };
}

/** The literal specifier of an import, an export-from or a dynamic import. */
type Sourced = { readonly source?: Expression | null };
function literal(node: Sourced): string | undefined {
  const source = node.source;
  // A module specifier the parser accepts as a literal is always a string.
  if (source?.type === "Literal") return String(source.value);
  if (source?.type === "TemplateLiteral" && source.expressions.length === 0)
    return source.quasis.map((quasi) => quasi.value.raw).join("");
  return undefined;
}

/** Visit every node that names a module, with the specifier it names. */
function specifiers(
  visit: (node: Rule.Node, specifier: string) => void,
): Rule.RuleListener {
  const each = (node: Rule.Node): void => {
    const specifier = literal(node as Sourced);
    if (specifier !== undefined) visit(node, specifier);
  };
  return {
    ImportDeclaration: each,
    ExportNamedDeclaration: each,
    ExportAllDeclaration: each,
    ImportExpression: each,
  };
}

// A leading dot is a tool configuration file, named by its tool.
const KEBAB = /^\.?[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*$/;

export const plugin: ESLint.Plugin = {
  rules: {
    "no-computed-dynamic-import": rule(
      "A dynamic import names its module literally",
      (context) => ({
        ImportExpression(node) {
          if (literal(node) === undefined)
            context.report({
              node,
              message:
                "RULE-019: a dynamic import names its module literally, so the graph can read the edge",
            });
        },
      }),
    ),
    "node-builtin-prefix": rule(
      "A Node builtin is imported under its node: prefix",
      (context) =>
        specifiers((node, specifier) => {
          if (!specifier.startsWith("node:") && isBuiltin(specifier))
            context.report({
              node,
              message: `RULE-023: import "node:${specifier}", not "${specifier}"`,
            });
        }),
    ),
    "kebab-case-filename": rule(
      "A module file is named in kebab-case",
      (context) => ({
        Program(node) {
          const name = basename(context.filename);
          if (!KEBAB.test(name))
            context.report({
              node,
              message: `RULE-024: ${name} is not named in kebab-case`,
            });
        },
      }),
    ),
    "no-test-imports-test": rule(
      "A test never imports another test",
      (context) =>
        specifiers((node, specifier) => {
          if (/\.test\.[cm]?[jt]s$/.test(specifier))
            context.report({
              node,
              message: `RULE-033: ${specifier} is a test; a shared fixture belongs in test/support/`,
            });
        }),
    ),
    "esm-only": rule("Shipped code is ESM", (context) => {
      const commonjs = (node: Rule.Node, what: string): void => {
        context.report({
          node,
          message: `RULE-042: ${what} is CommonJS; this package is ESM`,
        });
      };
      return {
        "CallExpression[callee.type='Identifier'][callee.name='require']"(
          node: Rule.Node,
        ) {
          commonjs(node, "require()");
        },
        "MemberExpression[object.name='module'][property.name='exports']"(
          node: Rule.Node,
        ) {
          commonjs(node, "module.exports");
        },
        "AssignmentExpression > MemberExpression.left[object.name='exports']"(
          node: Rule.Node,
        ) {
          commonjs(node, "exports");
        },
      };
    }),
  },
};
