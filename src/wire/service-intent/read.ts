// Concrete syntax: bytes to an instance of the metamodel.
//
// Three stages, in order, each reporting everything it finds before the next
// runs, and none of them throwing:
//
//   1. YAML parses at all                        -> kind `syntax`
//   2. the document is an instance of the schema -> kind `schema`
//   3. the instance is mapped into the domain    -> total, decides nothing
//
// A `schema` diagnostic carries no `E_` code, and that is the specification's
// own choice: a value outside a closed vocabulary is "refused before
// composition runs, so no new error code carries this case"
// (spec/v1/examples/refusals/alert-class-unknown.domain.yml). What it does
// carry is the **document path**, which is the half the old regex checks could
// never produce.
import { parseDocument } from "yaml";
import type { $ZodIssue } from "zod/v4/core";
import {
  accepted,
  refused,
  type Diagnostic,
  type Result,
} from "../../domain/diagnostic.ts";
import type { Domain } from "../../domain/service-intent/model.ts";
import { mapDomain } from "./map.ts";
import { Domain as DomainSchema } from "./schema.ts";

/**
 * A zod issue path as a document path. `["services", 0, "workloads", 1,
 * "cutover"]` reads `services[0].workloads[1].cutover`, which is what a reader
 * looks for in the file.
 */
export function documentPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((out, segment) => {
    if (typeof segment === "number") return `${out}[${segment}]`;
    const name = String(segment);
    return out === "" ? name : `${out}.${name}`;
  }, "");
}

/**
 * One zod issue as one Diagnostic. An `unrecognized_keys` issue is reported on
 * the object rather than on the key, so the key is appended: an unknown key's
 * address is the key, which is the thing the author has to delete.
 */
function toDiagnostics(issue: $ZodIssue, document: string): Diagnostic[] {
  const base = documentPath(issue.path);
  const one = (path: string, message: string): Diagnostic => ({
    code: "schema",
    kind: "schema",
    document,
    at: path === "" ? "(document)" : path,
    message,
  });
  if (issue.code === "unrecognized_keys")
    return issue.keys.map((key) =>
      one(
        documentPath([...issue.path, key]),
        `no class of the Service Intent metamodel carries ${key}`,
      ),
    );
  return [one(base, issue.message)];
}

/**
 * Read one Service Intent document: YAML in, the domain model or every reason
 * there is not one out. `document` is the file's own path, and it is what a
 * diagnostic names.
 */
export function readDomain(text: string, document: string): Result<Domain> {
  const parsed = parseDocument(text, { uniqueKeys: true });
  const broken = [...parsed.errors, ...parsed.warnings];
  if (broken.length > 0)
    return refused(
      broken.map((error) => ({
        code: "syntax" as const,
        kind: "syntax" as const,
        document,
        // A YAML error is addressed by offset, because there is no document
        // path yet: nothing parsed far enough to have one.
        at: `offset[${error.pos[0]}]`,
        message: error.message,
      })),
    );

  const result = DomainSchema.safeParse(parsed.toJS());
  if (!result.success)
    return refused(
      result.error.issues.flatMap((issue) => toDiagnostics(issue, document)),
    );

  return accepted(mapDomain(result.data));
}
