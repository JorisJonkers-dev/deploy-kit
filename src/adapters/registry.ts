// The registry (spec/v1/30-deliverables.md#attribution): the enumeration of
// the adapters that render, each with the default path that states where its
// output lands.
// A tool that needs to know who produces what reads this and nothing else.
import type { ResolvedProject } from "../model/resolution.ts";
import type { Deliverable } from "../objects/deliverable.ts";
import { ADAPTER as GRAFANA, renderGrafana } from "./grafana/render.ts";
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
import {
  ADAPTER as VAULT_POLICY,
  renderVaultPolicy,
} from "./vault-policy/render.ts";
import { ADAPTER as VSO, renderVso } from "./vso/render.ts";

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
    name: GRAFANA,
    defaultPath: "apps/<project>/<application>/dashboards.yaml",
    render: renderGrafana,
  },
  {
    name: TRAEFIK,
    defaultPath: "apps/<project>/<application>/route-<exposure>.yaml",
    render: renderTraefik,
  },
  {
    name: VSO,
    defaultPath: "apps/<project>/<application>/vso.yaml",
    render: renderVso,
  },
  {
    name: VAULT_POLICY,
    defaultPath:
      "apps/<project>/vault-policy/policies/{<namespace>-<identity>.{policy,role},<namespace>.generated}.json",
    render: renderVaultPolicy,
  },
];
