// The linking step: the names a route or a scrape writes, resolved to the
// Process and the surface they mean, inside the one Application that holds
// them. A name that resolves to nothing is refused here, at the JSON Pointer of
// the route or scrape that wrote it. A dependency edge names another
// Application, which only the composed union can resolve (#46), so it is left
// as the names it was written with.
import type { Diagnostic } from "../../domain/diagnostic.ts";
import type { Process, SurfaceRef } from "../../domain/project-intent/model.ts";

interface Written {
  readonly process: string;
  readonly surface: string;
}

export type Linked =
  | { readonly ok: true; readonly value: SurfaceRef }
  | { readonly ok: false; readonly diagnostic: Diagnostic };

/** The Process and surface `written` names among `processes`, or the refusal naming what did not resolve. */
export function link(
  written: Written,
  processes: readonly Process[],
  at: string,
): Linked {
  const process = processes.find(({ name }) => name === written.process);
  if (process === undefined)
    return {
      ok: false,
      diagnostic: {
        code: "E_UNKNOWN_PROCESS",
        path: at,
        message: `no Process of this Application is named ${written.process}`,
        hint: "Name one of the Application's own Processes.",
      },
    };
  const surface = process.surfaces.find(({ name }) => name === written.surface);
  if (surface === undefined)
    return {
      ok: false,
      diagnostic: {
        code: "E_UNKNOWN_SURFACE",
        path: at,
        message: `${process.name} provides no surface named ${written.surface}`,
        hint: "Name a surface the Process declares in its `provides`.",
      },
    };
  return { ok: true, value: { process, surface } };
}
