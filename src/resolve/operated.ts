// The monitoring stack's Prometheus and Alertmanager, which the Prometheus
// operator runs (spec/v1/14-platform-intent.md#the-operators-objects): what
// the Platform document says about each, carried onto its one Process.
import type { EffectiveApplication } from "../model/effective-intent.ts";
import { applicationOf, holds } from "../model/platform-intent.ts";
import type { ResolvedProcess } from "../model/resolved-deployment.ts";
import { namespaceOf } from "../model/runtime-profiles.ts";
import type { ProcessContext } from "./process.ts";

type Operated = NonNullable<ResolvedProcess["operated"]>;
type Prometheus = Extract<Operated, { kind: "Prometheus" }>;

/**
 * The Alertmanager the Prometheus notifies: the Service of its role's one
 * Process, on that Process's one surface, where the union holds its Project.
 */
function alertmanagerOf(
  reference: string,
  union: ProcessContext["union"],
): Pick<Prometheus, "alertmanager"> {
  const project = reference.slice(0, reference.indexOf("/"));
  const declared = union.find((candidate) => candidate.project === project);
  if (declared === undefined) return {};
  // The Project declares the role's Application, or
  // E_UNKNOWN_MONITORING_APPLICATION refused it.
  const process = (
    declared.applications.find(
      ({ id }) => id === applicationOf(reference),
    ) as EffectiveApplication
  ).processes[0] as EffectiveApplication["processes"][number];
  return {
    alertmanager: {
      namespace: namespaceOf(project),
      service: process.name,
      // The role's one Process provides one surface, or E_OPERATED_PROCESS
      // refused it.
      port: Object.keys(process.provides ?? {})[0] as string,
    },
  };
}

/** What the operator runs the Application's Process as, where it holds a role the operator serves. */
export function operatedOf(
  application: Pick<EffectiveApplication, "id">,
  context: Pick<ProcessContext, "platform" | "project" | "union">,
): Operated | undefined {
  const { platform, project } = context;
  const { monitoring } = platform;
  if (monitoring === undefined) return undefined;
  if (holds(monitoring.alertmanager, project, application.id))
    return { kind: "Alertmanager" };
  if (!holds(monitoring.prometheus, project, application.id)) return undefined;
  const { interval, timeout, labels } = platform.monitors;
  return {
    kind: "Prometheus",
    interval,
    timeout,
    ...(labels === undefined ? {} : { monitors: labels }),
    ...alertmanagerOf(monitoring.alertmanager, context.union),
  };
}
