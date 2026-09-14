// The second artefact of layer 1: the placeholder language, written down.
//
// Chapter 10 specifies configuration as dotenv, per Workload (0011), in which
// "a literal is written literally. A derived value is a named placeholder".
// Until now that language had a table of four sources and no grammar, so
// nothing could say whether `${exposure:auth.public#url:/login}` was a
// document this model accepts. It is not, and this file is why:
//
//     env-file   ::= line*
//     line       ::= blank | comment | entry
//     comment    ::= '#' .*
//     entry      ::= key '=' value
//     key        ::= [A-Za-z_][A-Za-z0-9_]*
//     value      ::= ( literal-text | placeholder )*
//     placeholder ::= '${' kind ':' source '}'
//     kind       ::= 'secret' | 'dependency' | 'exposure' | 'identity'
//     source     ::= [^{}]+
//
// The grammar is what makes the closure real. A placeholder **names a source
// and resolves to one value**: it takes no arguments, so there is no
// conditional, no arithmetic and no second parameter to grow one. A path is
// written outside it, which is what keeps `grep -r 'exposure:auth.public'`
// finding every reader of that host whatever each appends.
//
// Each kind's `source` half has its own shape, and it is checked here too,
// because a source that does not parse cannot be resolved against anything
// later and the diagnostic would then name the wrong stage.
//
// What this file deliberately does NOT do is resolve a placeholder. Byte
// matching a `${secret:...}` against a granted read path is
// `E_UNAUTHORISED_SECRET_REFERENCE` and its twin `E_UNBOUND_SECRET_GRANT`, and
// chapter 10's validation table puts both at **composition**, over the
// composed union. They are listed in `NOT_DECIDED_BY_ONE_DOCUMENT`.
import { at, child, type Diagnostic } from "../../domain/diagnostic.ts";
import type {
  EnvFile,
  Literal,
  Placeholder,
  PlaceholderKind,
} from "../../domain/service-intent/model.ts";
import { PlaceholderKind as PlaceholderKindEnum } from "./vocabularies.ts";

/** `${kind:source}`, anywhere in a value, with no nesting and no arguments. */
const PLACEHOLDER = /\$\{([a-z]+):([^{}]*)\}/g;

/** Anything that looks like the opening of a placeholder, valid or not. */
const OPENING = /\$\{/g;

/** `KEY=value`, with the key on the left of the first `=`. */
const ENTRY = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

/**
 * What each placeholder kind's source half must look like.
 *
 * These are the addresses chapter 10 tabulates, and nothing wider:
 * `${secret:<path>#<key>}`, `${dependency:<service>.<coordinate>}`,
 * `${exposure:<service>.<name>#<field>}` with `<field>` one of exactly three,
 * and `${identity:<key>}` over a closed key set.
 */
const SOURCE: Readonly<Record<PlaceholderKind, RegExp>> = {
  secret: /^[^#\s]+#[^#\s]+$/,
  dependency: /^[a-z][a-z0-9-]*\.[a-z][a-zA-Z0-9]*$/,
  exposure: /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*#(url|host|scheme)$/,
  identity: /^(vaultRole|serviceAccount|namespace)$/,
};

const KINDS = new Set<string>(PlaceholderKindEnum.options);

function isKind(value: string): value is PlaceholderKind {
  return KINDS.has(value);
}

function bad(document: string, path: string, message: string): Diagnostic {
  return { code: "schema", kind: "schema", document, at: path, message };
}

export interface EnvFileParse {
  readonly file: EnvFile;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Parse one env file into literals and placeholders.
 *
 * `document` is the file's own path, for the diagnostics; `cluster` names the
 * Cluster Target of an overlay and is absent for a `base.env`. Every line is
 * read: a malformed one is reported and parsing continues, so one command
 * reports ten mistakes rather than the first.
 */
export function parseEnvFile(
  text: string,
  document: string,
  cluster?: string,
): EnvFileParse {
  const literals: Literal[] = [];
  const placeholders: Placeholder[] = [];
  const diagnostics: Diagnostic[] = [];

  text.split("\n").forEach((raw, index) => {
    const line = raw.trimEnd();
    if (line.trim() === "" || line.trimStart().startsWith("#")) return;
    const where = `line[${index + 1}]`;
    const entry = ENTRY.exec(line);
    if (entry === null) {
      diagnostics.push(
        bad(
          document,
          where,
          `not an env entry: an env file holds KEY=value lines and comments, ` +
            `and this reads ${JSON.stringify(line)}`,
        ),
      );
      return;
    }
    const key = entry[1] as string;
    const value = entry[2] as string;
    literals.push({ at: child(where, key), key, value });

    const found = [...value.matchAll(PLACEHOLDER)];
    const openings = [...value.matchAll(OPENING)].length;
    if (openings > found.length)
      diagnostics.push(
        bad(
          document,
          child(where, key),
          "a placeholder is ${kind:source} with no nesting and no arguments; " +
            "a path is written outside it",
        ),
      );
    found.forEach((match, ordinal) => {
      const kind = match[1] as string;
      const source = match[2] as string;
      const path = at(child(where, key), ordinal);
      if (!isKind(kind)) {
        diagnostics.push(
          bad(
            document,
            path,
            `${kind} is not a placeholder source; the four are ` +
              PlaceholderKindEnum.options.join(", "),
          ),
        );
        return;
      }
      if (!SOURCE[kind].test(source)) {
        diagnostics.push(
          bad(
            document,
            path,
            `\${${kind}:${source}} does not address a ${kind}`,
          ),
        );
        return;
      }
      placeholders.push({ at: path, kind, source, key });
    });
  });

  return {
    file: {
      at: document,
      ...(cluster === undefined ? {} : { cluster }),
      literals,
      placeholders,
    },
    diagnostics,
  };
}
