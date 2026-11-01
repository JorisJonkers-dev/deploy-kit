// The Reconcile Units' order must be acyclic: a unit that waits on itself,
// through any number of others, is a deadlock Flux never leaves
// (spec/v1/20-resolved-deployment.md#the-reconcile-unit).
import type { Diagnostic } from "../model/diagnostic.ts";
import type { ResolvedProject } from "../model/resolution.ts";
import { unitOf } from "../model/reconcile-units.ts";

/** The units each Project's unit follows, keyed by that Project's own unit. */
function followsOf(
  projects: readonly ResolvedProject[],
): Map<string, Set<string>> {
  const units = new Set(projects.map(({ project }) => unitOf(project)));
  return new Map(
    projects.map(({ project, applications }) => [
      unitOf(project),
      new Set(
        applications
          .flatMap(({ reconcileAfter }) => reconcileAfter ?? [])
          .filter((unit) => units.has(unit)),
      ),
    ]),
  );
}

/** Every unit reachable from `from`, `from` itself only through a cycle. */
function reachable(
  from: string,
  follows: ReadonlyMap<string, ReadonlySet<string>>,
): Set<string> {
  const seen = new Set<string>();
  const queue = [...(follows.get(from) ?? [])];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    if (seen.has(next)) continue;
    seen.add(next);
    queue.push(...(follows.get(next) ?? []));
  }
  return seen;
}

/**
 * One refusal per Project whose unit waits on itself, naming the other units
 * on its cycle and blaming their documents with it.
 */
export function reconcileCycles(
  projects: readonly ResolvedProject[],
  documentOf: (project: string) => string,
): Diagnostic[] {
  const follows = followsOf(projects);
  const reach = new Map(
    [...follows.keys()].map((unit) => [unit, reachable(unit, follows)]),
  );
  return projects.flatMap(({ project, applications }): Diagnostic[] => {
    const unit = unitOf(project);
    const mine = reach.get(unit) as Set<string>;
    if (!mine.has(unit)) return [];
    const cycle = projects.filter(
      (other) =>
        other.project !== project &&
        mine.has(unitOf(other.project)) &&
        (reach.get(unitOf(other.project)) as Set<string>).has(unit),
    );
    const at = applications.findIndex(({ reconcileAfter }) =>
      (reconcileAfter ?? []).some((after) =>
        cycle.some((other) => unitOf(other.project) === after),
      ),
    );
    return [
      {
        code: "E_RECONCILE_CYCLE",
        document: documentOf(project),
        path: `/applications/${String(at)}`,
        message: `${unit} follows ${cycle.map((other) => unitOf(other.project)).join(", ")}, which follow${cycle.length === 1 ? "s" : ""} ${unit} again, so no unit on the cycle applies first`,
        hint: "Mark a required edge on the cycle `required: false`, if its Process starts without that peer, or move the Application that closes the cycle into the Project it waits on.",
        involves: cycle.map((other) => documentOf(other.project)),
      },
    ];
  });
}
