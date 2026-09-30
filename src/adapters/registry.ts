// The registry (spec/v1/30-deliverables.md#attribution): the enumeration of
// the adapters that render, each with the default path the plan assigns from.
// A tool that needs to know who produces what reads this and nothing else.
import type { ResolvedProject } from "../model/resolution.ts";
import type { Deliverable } from "../objects/deliverable.ts";
import {
  ADAPTER as KUBERNETES,
  renderKubernetes,
} from "./kubernetes/render.ts";
import {
  ADAPTER as NETWORKING,
  renderNetworking,
} from "./networking/render.ts";
import {
  ADAPTER as PROMETHEUS,
  renderPrometheus,
} from "./prometheus/render.ts";
import { ADAPTER as TRAEFIK, renderTraefik } from "./traefik/render.ts";

export { kustomizationsFor } from "./kubernetes/render.ts";

export interface Adapter {
  readonly name: string;
  readonly defaultPath: string;
  readonly render: (project: ResolvedProject) => Deliverable[];
}

export const ADAPTERS: readonly Adapter[] = [
  {
    name: KUBERNETES,
    defaultPath: "apps/<project>/<application>/<object>.yaml",
    render: renderKubernetes,
  },
  {
    name: NETWORKING,
    defaultPath: "apps/<project>/<application>/networkpolicy.yaml",
    render: renderNetworking,
  },
  {
    name: PROMETHEUS,
    defaultPath: "apps/<project>/<application>/podmonitor.yaml",
    render: renderPrometheus,
  },
  {
    name: TRAEFIK,
    defaultPath: "apps/edge/<tier>/<application>-<exposure>.yaml",
    render: renderTraefik,
  },
];
