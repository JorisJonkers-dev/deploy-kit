export function canonicalJson(value: unknown): string {
  return write(value, "");
}

function write(value: unknown, pointer: string): string {
  if (value === null || value === undefined)
    throw new TypeError(
      `${String(value)} at ${pointer}: an absent optional field is absent, never null`,
    );
  if (Array.isArray(value))
    return `[${value.map((item: unknown, i) => write(item, `${pointer}/${String(i)}`)).join(",")}]`;
  switch (typeof value) {
    case "string":
      return writeString(value, pointer);
    case "boolean":
      return String(value);
    case "number":
      if (!Number.isFinite(value))
        throw new TypeError(
          `${String(value)} at ${pointer} is not a JSON number`,
        );
      return JSON.stringify(value);
    case "object":
      if (Object.getPrototypeOf(value) === Object.prototype)
        return writeObject(value as Record<string, unknown>, pointer);
      break;
  }
  throw new TypeError(`${describe(value)} at ${pointer} is not a JSON value`);
}

function writeObject(object: Record<string, unknown>, pointer: string): string {
  const members = Object.keys(object)
    .sort()
    .map(
      (key) =>
        `${writeString(key, pointer)}:${write(object[key], `${pointer}/${escapePointer(key)}`)}`,
    );
  return `{${members.join(",")}}`;
}

function writeString(text: string, pointer: string): string {
  const lone =
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.exec(
      text,
    );
  if (lone !== null)
    throw new TypeError(
      `string at ${pointer} holds a lone surrogate at index ${String(lone.index)}`,
    );
  return JSON.stringify(text);
}

function escapePointer(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function describe(value: unknown): string {
  return typeof value === "object"
    ? (value as object).constructor.name
    : typeof value;
}
