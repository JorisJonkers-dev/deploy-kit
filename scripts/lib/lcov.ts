// A minimal lcov reader: just enough of the format vitest's `lcov` reporter
// writes (coverage/lcov.info) to answer one question per line: how many
// times did this line of this file run, which is what patch-coverage.ts
// needs and nothing an existing dependency already parses for us.
//
// The subset read is `SF:<path>` (a new file record starts) and
// `DA:<line>,<hits>` (one line's hit count) up to `end_of_record`; every
// other record kind (`FN`, `BRDA`, summary lines) is not needed here and is
// skipped rather than rejected, since a future vitest version adding a
// record kind this reader does not know about must not break it.

/** Line number to hit count, for one file. */
export type FileHits = ReadonlyMap<number, number>;

/** Every file's line hits, keyed by the path lcov recorded it under. */
export type LcovReport = ReadonlyMap<string, FileHits>;

/** Parse an lcov document's `SF:`/`DA:` records into a {@link LcovReport}. */
export function parseLcov(text: string): LcovReport {
  const files = new Map<string, Map<number, number>>();
  let current: Map<number, number> | null = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("SF:")) {
      current = new Map();
      files.set(line.slice(3), current);
    } else if (line.startsWith("DA:") && current !== null) {
      const [lineNo, hits] = line.slice(3).split(",");
      if (lineNo !== undefined && hits !== undefined)
        current.set(Number(lineNo), Number(hits));
    } else if (line === "end_of_record") {
      current = null;
    }
  }
  return files;
}
