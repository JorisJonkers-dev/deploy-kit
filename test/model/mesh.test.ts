// Enrolment in the ambient mesh (spec/v1/14-platform-intent.md#the-mesh): the
// namespace's data-plane label, and what every policy of an enrolled Project
// admits beside what it admitted before (spec/v1/16-dependencies.md#the-mesh-tunnel).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAllDocuments } from "yaml";
import {
  checkIntentSet,
  renderIntentSet,
  resolveIntentSet,
  serialize,
  sha256Hasher,
} from "../../src/index.ts";

const EXAMPLES = join(
  import.meta.dirname,
  "..",
  "..",
  "spec",
  "v1",
  "examples",
);
const text = (path: string): string =>
  readFileSync(join(EXAMPLES, path), "utf8");

const PLATFORM = "platform/platform.intent.yml";

const SET = [
  PLATFORM,
  "platform/node-contract.yml",
  "platform/images.lock.yml",
  "platform/cluster-state.yml",
  "delivery/delivery.project.yml",
  "agents/agents.project.yml",
  "agents/env/hermes/base.env",
  "utility/utility.project.yml",
  "edge/edge.project.yml",
  "observability/observability.project.yml",
  "observability/rules/platform.yaml",
  "secrets/secrets.project.yml",
  "identity/identity.project.yml",
  "observability/env/grafana/base.env",
  "data/data.project.yml",
  "data/env/postgres/base.env",
  "data/config/postgresql.conf",
  "data/config/garage.toml",
  "data/env/garage/base.env",
  "data/dashboards/rabbitmq.json",
  "auth/auth.project.yml",
  "auth/env/auth-api/base.env",
  "auth/migration-proof.yml",
];

const OPTIONS = {
  hash: sha256Hasher,
  schemaPackageIntegrity:
    "sha256:5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b",
  serialize,
};

/** The worked set, its Platform document enrolling `enrolled` where any is named. */
const files = (enrolled: readonly string[] = []) =>
  SET.map((name) => ({
    name,
    text:
      name === PLATFORM && enrolled.length > 0
        ? text(name).replace(
            "\nhardening:",
            `\nmesh:\n  enrolled: [${enrolled.join(", ")}]\nhardening:`,
          )
        : text(name),
  }));

type Doc = Record<string, unknown>;

/** Every object of one Project's share of the render, by path. */
function share(project: string, enrolled: readonly string[] = []) {
  const result = renderIntentSet(files(enrolled), {
    ...OPTIONS,
    projects: [project],
  });
  if (!result.ok)
    throw new Error(JSON.stringify(result.diagnostics.map(({ code }) => code)));
  const artifact = result.value.find(({ name }) => name === project);
  return new Map(
    (artifact?.files ?? []).map(({ path, text: body }) => [
      path,
      parseAllDocuments(body)
        .map((document) => document.toJS() as Doc | null)
        .filter((document): document is Doc => document !== null),
    ]),
  );
}

type Port = { protocol: string; port: number };
type Rule = { from?: Doc[]; to?: Doc[]; ports?: Port[] };
type Policy = {
  metadata: { name: string };
  spec: { ingress?: Rule[]; egress?: Rule[] } & Doc;
} & Doc;

const TUNNEL: Port = { protocol: "TCP", port: 15008 };
const PROBE_SOURCE = "169.254.7.127/32";

/** Each container's probe ports, once, readiness first, by container name. */
function probePorts(objects: readonly Doc[]): Map<string, number[]> {
  type Probe = { httpGet?: { port: number }; tcpSocket?: { port: number } };
  type Container = {
    name: string;
    readinessProbe?: Probe;
    livenessProbe?: Probe;
    startupProbe?: Probe;
  };
  const found = new Map<string, number[]>();
  for (const object of objects) {
    const spec = (object.spec as { template?: { spec?: Doc } } | undefined)
      ?.template?.spec as { containers?: Container[] } | undefined;
    for (const container of spec?.containers ?? []) {
      const ports = [
        container.readinessProbe,
        container.livenessProbe,
        container.startupProbe,
      ].flatMap((probe) =>
        probe === undefined
          ? []
          : [(probe.httpGet ?? probe.tcpSocket)?.port as number],
      );
      if (ports.length > 0) found.set(container.name, [...new Set(ports)]);
    }
  }
  return found;
}

/** What the mesh makes of an unenrolled policy, by chapter 16's three rules. */
function enrolledFrom(policy: Policy, probes: Map<string, number[]>): Policy {
  const viaTunnel = (rule: Rule): Rule => {
    const dns = (rule.ports ?? []).some(({ port }) => port === 53);
    // A range is reached, or reaches in, without the tunnel: DNS, the
    // internet, and a client off the cluster on an L4 Address.
    const range = [...(rule.to ?? []), ...(rule.from ?? [])].some(
      (peer) => "ipBlock" in peer,
    );
    return dns || range || rule.ports === undefined
      ? rule
      : { ...rule, ports: [...rule.ports, TUNNEL] };
  };
  const probed = probes.get(policy.metadata.name) ?? [];
  const ingress = [
    ...(policy.spec.ingress ?? []).map(viaTunnel),
    ...(probed.length === 0
      ? []
      : [
          {
            from: [{ ipBlock: { cidr: PROBE_SOURCE } }],
            ports: probed.map((port) => ({ protocol: "TCP", port })),
          },
        ]),
  ];
  const { ingress: _, egress, ...rest } = policy.spec;
  return {
    ...policy,
    spec: {
      ...rest,
      ...(ingress.length === 0 ? {} : { ingress }),
      ...(egress === undefined ? {} : { egress: egress.map(viaTunnel) }),
    },
  };
}

const policiesOf = (tree: Map<string, Doc[]>) =>
  [...tree.entries()]
    .filter(([path]) => path.endsWith("networkpolicy.yaml"))
    .map(([path, objects]) => [path, objects as Policy[]] as const);

describe("an enrolled Project", () => {
  it.each(["auth", "data"])(
    "labels %s's namespace for the ambient data plane",
    (project) => {
      const [namespace] = [...share(project, [project]).entries()].find(
        ([path]) => path.endsWith("/namespace.yaml"),
      )?.[1] as Doc[];

      expect(namespace?.metadata).toStrictEqual({
        name: `${project}-system`,
        labels: {
          "app.kubernetes.io/managed-by": "deploy-kit",
          "istio.io/dataplane-mode": "ambient",
        },
      });
    },
  );

  it.each(["auth", "data"])(
    "admits the tunnel port beside every port %s's policies admit, and the kubelet's rewritten probes",
    (project) => {
      const before = share(project);
      const after = share(project, [project]);
      const probes = probePorts([...after.values()].flat());

      expect(policiesOf(after)).toStrictEqual(
        policiesOf(before).map(([path, policies]) => [
          path,
          policies.map((policy) => enrolledFrom(policy, probes)),
        ]),
      );
    },
  );

  it("changes nothing in the render of a Project it does not enrol", () => {
    expect(share("auth", ["data"])).toStrictEqual(share("auth"));
  });
});

describe("the mesh record", () => {
  const applicationsOf = (project: string, enrolled: readonly string[]) => {
    const result = resolveIntentSet(files(enrolled), OPTIONS);
    if (!result.ok) throw new Error("refused");
    return (
      result.value.projects.find((held) => held.project === project)
        ?.applications ?? []
    );
  };

  it("is Istio's: the ambient mode, ztunnel's tunnel port and the probes' rewritten address", () => {
    expect(
      applicationsOf("auth", ["auth"]).map(({ mesh }) => mesh),
    ).toStrictEqual([
      { dataplane: "ambient", tunnelPort: 15008, probeSource: PROBE_SOURCE },
    ]);
  });

  it("is absent where the platform enrols another Project", () => {
    expect(
      applicationsOf("auth", ["data"]).map(({ mesh }) => mesh),
    ).toStrictEqual([undefined]);
  });
});

describe("a Project the mesh enrols", () => {
  it("is one a project file declares", () => {
    const result = checkIntentSet(files(["auth", "nowhere"]));

    expect(result.ok ? [] : result.diagnostics).toStrictEqual([
      {
        code: "E_UNKNOWN_ENROLLED_PROJECT",
        document: PLATFORM,
        path: "/mesh/enrolled/1",
        message: "no project file declares the Project nowhere the mesh enrols",
        hint: "Name a Project a project file declares in `mesh.enrolled`, or remove it from the list.",
      },
    ]);
  });
});
