// An Asset names a file beside its project file
// (spec/v1/10-project-intent.md#assets): the set read with the project holds
// it, or the Asset mounts nothing. An Asset is Shared Intent, so each is
// refused where it is written, at whichever level.
import type { Diagnostic } from "../model/diagnostic.ts";
import type { ProjectIntentDocument } from "../model/project-intent.ts";

type Assets = ProjectIntentDocument["assets"];

/** Every Asset `document` names whose file `read` does not hold. */
export function assetDiagnostics(
  document: ProjectIntentDocument,
  read: (from: string) => boolean,
): Diagnostic[] {
  const missing = (assets: Assets, at: string): Diagnostic[] =>
    // Stryker disable next-line ArrayDeclaration: a level with no Asset and
    // one with an empty list mount nothing alike.
    (assets ?? []).flatMap(({ from }, i) =>
      read(from)
        ? []
        : [
            {
              code: "E_ASSET_NOT_FOUND",
              path: `${at}/assets/${String(i)}/from`,
              message: `no file ${from} is read beside the project file`,
              hint: "Commit the file at that path beside the project file, or correct `from`.",
            },
          ],
    );
  return [
    ...missing(document.assets, ""),
    ...document.applications.flatMap((application, a) => [
      ...missing(application.assets, `/applications/${String(a)}`),
      ...application.processes.flatMap((process, p) =>
        missing(
          process.assets,
          `/applications/${String(a)}/processes/${String(p)}`,
        ),
      ),
    ]),
  ];
}
