// The part of Stryker's JSON report the mutation scripts read.
//
// Every field a script does not name is carried through untouched, so a
// report a script writes back is still one Stryker reads.

export interface Position {
  readonly line: number;
  readonly column: number;
}

export interface Mutant {
  readonly id: string;
  readonly status: string;
  readonly mutatorName: string;
  readonly location: { readonly start: Position; readonly end: Position };
  readonly coveredBy?: readonly string[];
  readonly killedBy?: readonly string[];
  readonly testsCompleted?: number;
}

export interface Test {
  readonly id: string;
  readonly name: string;
  readonly location?: { readonly start: Position };
}

export interface Report {
  readonly schemaVersion?: string;
  readonly files: Readonly<
    Record<
      string,
      { readonly source?: string; readonly mutants: readonly Mutant[] }
    >
  >;
  readonly testFiles?: Readonly<
    Record<
      string,
      { readonly source?: string; readonly tests: readonly Test[] }
    >
  >;
}

/** The statuses that lower a mutation score, and how a list words each. */
export const UNDETECTED: Readonly<Record<string, string>> = {
  Survived: "survived",
  NoCoverage: "no test covers it",
};

/** The statuses that raise it. */
export const DETECTED: ReadonlySet<string> = new Set(["Killed", "Timeout"]);

export interface Undetected {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly mutator: string;
  readonly outcome: string;
}

/**
 * Every mutant no test detected, by file and position, over the `files` of
 * every report: two shards' reports can each hold part of one file.
 */
export function undetected(
  reports: readonly Readonly<
    Record<
      string,
      {
        readonly mutants: readonly Pick<
          Mutant,
          "status" | "mutatorName" | "location"
        >[];
      }
    >
  >[],
): Undetected[] {
  return reports
    .flatMap((files) => Object.entries(files))
    .flatMap(([file, { mutants }]) =>
      mutants.flatMap(({ status, mutatorName, location }) => {
        const outcome = UNDETECTED[status];
        return outcome === undefined
          ? []
          : [{ file, ...location.start, mutator: mutatorName, outcome }];
      }),
    )
    .sort(
      (a, b) =>
        a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column,
    );
}

/** One undetected mutant as a Markdown list item. */
export const listed = ({
  file,
  line,
  column,
  mutator,
  outcome,
}: Undetected): string =>
  `- \`${file}:${String(line)}:${String(column)}\` ${mutator}: ${outcome}`;
