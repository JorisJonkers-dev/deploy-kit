// The subset of JSON Patch (RFC 6902) a schema corpus case is written in:
// `add`, `remove` and `replace`, at a JSON Pointer (RFC 6901). Applied to a
// copy, so the document a case derives from is never changed.

export interface PatchOperation {
  readonly op: "add" | "remove" | "replace";
  readonly path: string;
  readonly value?: unknown;
}

type Container = Record<string, unknown> | unknown[];

const unescape = (token: string): string =>
  token.replaceAll("~1", "/").replaceAll("~0", "~");

function tokens(pointer: string): string[] {
  if (!pointer.startsWith("/"))
    throw new Error(`${pointer}: a JSON Pointer starts with /`);
  return pointer.slice(1).split("/").map(unescape);
}

function parentOf(document: unknown, pointer: string): [Container, string] {
  const path = tokens(pointer);
  const last = path.pop() ?? "";
  let node = document;
  for (const token of path) {
    if (typeof node !== "object" || node === null)
      throw new Error(`${pointer}: ${token} is not inside a container`);
    node = (node as Record<string, unknown>)[token];
  }
  if (typeof node !== "object" || node === null)
    throw new Error(`${pointer}: the parent is not a container`);
  return [node as Container, last];
}

function apply(document: unknown, { op, path, value }: PatchOperation): void {
  const [parent, key] = parentOf(document, path);
  if (Array.isArray(parent)) {
    const index = key === "-" ? parent.length : Number(key);
    if (!Number.isInteger(index) || index < 0 || index > parent.length)
      throw new Error(`${path}: no index ${key}`);
    if (op !== "add" && index >= parent.length)
      throw new Error(`${path}: no element to ${op}`);
    if (op === "add") parent.splice(index, 0, value);
    else if (op === "remove") parent.splice(index, 1);
    else parent[index] = value;
    return;
  }
  if (op !== "add" && !Object.hasOwn(parent, key))
    throw new Error(`${path}: no member to ${op}`);
  if (op === "remove") Reflect.deleteProperty(parent, key);
  else parent[key] = value;
}

/** `document` with every operation of `patch` applied in order, as a copy. */
export function patched(
  document: unknown,
  patch: readonly PatchOperation[],
): unknown {
  const copy = structuredClone(document);
  for (const operation of patch) apply(copy, operation);
  return copy;
}
