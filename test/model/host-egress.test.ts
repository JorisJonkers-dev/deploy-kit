// REQ-172, REQ-173 and REQ-174 (docs/requirements.md): a Process that narrows
// its egress to named hosts is held to them, at the layers this repository
// owns. Its pod reaches the cluster through its edges and a proxy of its own
// and nothing else; the proxy admits the hosts the author wrote and no other;
// both policies are applied, not only rendered; and `egress: internet` is what
// it was.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAllDocuments } from "yaml";
import {
  checkIntentSet,
  renderIntentSet,
  serialize,
  sha256Hasher,
  type AuthoredFile,
} from "../../src/index.ts";
import {
  proxyConfigOf,
  proxyEnvironmentOf,
} from "../../src/model/egress-proxy.ts";
import { podSecurityFindings } from "../../scripts/lib/pod-security.ts";

const EXAMPLES = join(
  import.meta.dirname,
  "..",
  "..",
  "spec",
  "v1",
  "examples",
);

const SET = [
  "platform/platform.intent.yml",
  "platform/node-contract.yml",
  "platform/images.lock.yml",
  "platform/cluster-state.yml",
  "delivery/delivery.project.yml",
  "edge/edge.project.yml",
  "observability/observability.project.yml",
  "observability/rules/platform.yaml",
  "secrets/secrets.project.yml",
  "secrets/config/vault.hcl",
  "identity/identity.project.yml",
  "utility/utility.project.yml",
  "utility/config/adguard/AdGuardHome.yaml",
  "agents/agents.project.yml",
  "agents/env/hermes/base.env",
  "agents/config/hermes/config.yaml",
  "observability/env/grafana/base.env",
];

type Edits = Readonly<Record<string, (text: string) => string>>;

const replaced =
  (from: string, to: string) =>
  (text: string): string => {
    if (!text.includes(from)) throw new Error(`no ${from} to replace`);
    return text.replace(from, to);
  };

const INTERNET = `        egress:
          to: internet
          reason: >-
            Hermes calls its model providers and remote MCP servers, and installs the skills it is given.
`;

const HOSTS = `        egress:
          reason: Hermes reads the pull requests it reviews.
          hosts:
            - { host: github.com, port: 443 }
            - { host: api.github.com, port: 443 }
            - { host: api.github.com, port: 443 }
`;

/** A proxy image the lock holds, and the platform naming it. */
const PROXY_POLICY: Edits = {
  "platform/platform.intent.yml": replaced(
    "seeder:\n",
    "egressProxy:\n  image: squid\n  memory: 64Mi\n  cpu: 50m\nseeder:\n",
  ),
  "platform/images.lock.yml": replaced(
    "  busybox:\n",
    [
      "  squid:",
      "    repository: docker.io/ubuntu/squid",
      `    digest: "sha256:${"6a".repeat(32)}"`,
      "    uid: 13",
      "    gid: 13",
      '    version: "6.13"',
      "  busybox:\n",
    ].join("\n"),
  ),
};

const NARROWED: Edits = {
  ...PROXY_POLICY,
  "agents/agents.project.yml": replaced(INTERNET, HOSTS),
};

/** Each file's edits in turn: the second sees what the first made. */
const after = (first: Edits, second: Edits): Edits =>
  Object.fromEntries(
    [...new Set([...Object.keys(first), ...Object.keys(second)])].map(
      (name) => [
        name,
        (text: string) =>
          (second[name] ?? ((same: string) => same))(
            (first[name] ?? ((same: string) => same))(text),
          ),
      ],
    ),
  );

const filesOf = (edits: Edits): AuthoredFile[] =>
  SET.map((name) => ({
    name,
    text: (edits[name] ?? ((same: string) => same))(
      readFileSync(join(EXAMPLES, name), "utf8"),
    ),
  }));

const rendering = (edits: Edits) =>
  renderIntentSet(filesOf(edits), {
    hash: sha256Hasher,
    schemaPackageIntegrity:
      "sha256:5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b5e6f7a8b",
    serialize,
    projects: ["agents"],
  });

function tree(edits: Edits): Record<string, string> {
  const result = rendering(edits);
  if (!result.ok)
    throw new Error(JSON.stringify(result.diagnostics.map(({ code }) => code)));
  return Object.fromEntries(
    result.value.flatMap(({ files }) =>
      files.map(({ path, text }) => [path, text] as const),
    ),
  );
}

type Rule = Record<string, unknown>;

/** The parts of a rendered object these tests read; a document holds only those of its kind. */
interface Doc {
  readonly kind: string;
  readonly metadata: { readonly name: string };
  readonly data: Record<string, string>;
  readonly resources: string[];
  readonly spec: {
    readonly egress: Rule[];
    readonly ingress: Rule[];
    readonly ports: unknown[];
    readonly template: {
      readonly spec: {
        readonly containers: {
          readonly image: string;
          readonly env: { name: string; value: string }[];
        }[];
      };
    };
  };
}

const documents = (rendered: Record<string, string>, path: string): Doc[] =>
  parseAllDocuments(rendered[path] ?? "").map((doc) => doc.toJS() as Doc);

const named = (docs: Doc[], kind: string, name: string): Doc =>
  docs.find(
    (doc) => doc["kind"] === kind && doc["metadata"].name === name,
  ) as Doc;

const refusals = (edits: Edits): readonly { code: string; path?: string }[] => {
  const result = checkIntentSet(filesOf(edits));
  return result.ok ? [] : result.diagnostics;
};

const HERMES = "apps/agents/hermes";

describe("a Process narrowed to named hosts", () => {
  const rendered = tree(NARROWED);
  const policies = documents(rendered, `${HERMES}/egress-policy.yaml`);
  const hermes = named(policies, "NetworkPolicy", "hermes");
  const proxy = named(policies, "NetworkPolicy", "hermes-egress");

  it("is accepted by validate", () => {
    expect(refusals(NARROWED)).toStrictEqual([]);
  });

  it("reaches no address beyond the cluster: its policy names its edges, the proxy and the cluster's DNS", () => {
    const targets = hermes["spec"].egress.map((rule) =>
      JSON.stringify(rule["to"]),
    );

    expect(targets.join()).not.toContain("ipBlock");
    expect(targets.join()).toContain("hermes-egress");
  });

  it("reaches the proxy on its one port, and the proxy admits it alone", () => {
    const toProxy = hermes["spec"].egress.find((rule) =>
      JSON.stringify(rule["to"]).includes("hermes-egress"),
    );

    expect(toProxy?.["ports"]).toStrictEqual([{ protocol: "TCP", port: 3128 }]);
    expect(proxy["spec"].ingress).toStrictEqual([
      {
        from: [
          {
            namespaceSelector: {
              matchLabels: { "kubernetes.io/metadata.name": "agents-system" },
            },
            podSelector: {
              matchLabels: { "app.kubernetes.io/instance": "hermes" },
            },
          },
        ],
        ports: [{ protocol: "TCP", port: 3128 }],
      },
    ]);
  });

  it("lets the proxy reach public IPv4 on the hosts' ports only", () => {
    const toInternet = proxy["spec"].egress.filter((rule) =>
      JSON.stringify(rule).includes("0.0.0.0/0"),
    );

    expect(toInternet).toStrictEqual([
      {
        to: [
          {
            ipBlock: {
              cidr: "0.0.0.0/0",
              except: [
                "10.0.0.0/8",
                "172.16.0.0/12",
                "192.168.0.0/16",
                "100.64.0.0/10",
                "169.254.0.0/16",
                "127.0.0.0/8",
              ],
            },
          },
        ],
        ports: [{ protocol: "TCP", port: 443 }],
      },
    ]);
  });

  it("applies both policies: the file is listed by the kustomization, the render-only file is not", () => {
    const listed = (directory: string): string[] =>
      documents(rendered, `${directory}/kustomization.yaml`).flatMap(
        (doc) => doc["resources"],
      );

    expect(listed(HERMES)).toContain("egress-policy.yaml");
    expect(listed(HERMES)).not.toContain("networkpolicy.yaml");
  });

  it("keeps the policy of no other Process of its Application out of the applied file", () => {
    expect(policies.map((policy) => policy["metadata"].name)).toStrictEqual([
      "hermes",
      "hermes-egress",
    ]);
  });

  it("admits the hosts it names on the proxy, once each, and denies every other request", () => {
    const config = named(
      documents(rendered, `${HERMES}/configmap.yaml`),
      "ConfigMap",
      (
        documents(rendered, `${HERMES}/configmap.yaml`).find((doc) =>
          doc["metadata"].name.startsWith("hermes-egress-squid-conf"),
        ) as Doc
      )["metadata"].name,
    )["data"]["squid.conf"] as string;

    expect(config).toBe(
      proxyConfigOf("hermes", [
        { host: "api.github.com", port: 443 },
        { host: "github.com", port: 443 },
      ]),
    );
    expect(config).toContain("acl host0 dstdomain api.github.com");
    expect(config).toContain("acl host1 dstdomain github.com");
    expect(config).not.toContain("example.com");
    expect(config.trim().split("\n").at(-1)).toBe("http_access deny all");
  });

  it("hands the Process the proxy to send what leaves the cluster to, and keeps its own edges off it", () => {
    const deployment = named(
      documents(rendered, `${HERMES}/workload.yaml`),
      "Deployment",
      "hermes",
    );
    const environment = Object.fromEntries(
      (
        deployment["spec"].template.spec.containers[0]?.env as {
          name: string;
          value: string;
        }[]
      ).map(({ name, value }) => [name, value]),
    );

    expect(environment["HTTPS_PROXY"]).toBe(
      "http://hermes-egress.agents-system.svc.cluster.local:3128",
    );
    expect(environment["no_proxy"]).toContain("kubernetes-mcp-server");
    expect(environment["NO_PROXY"]).toBe(environment["no_proxy"]);
  });

  it("runs the proxy as a Process of its own: its Service, its pinned image and the restricted posture", () => {
    const workload = documents(rendered, `${HERMES}/workload.yaml`);
    const deployment = named(workload, "Deployment", "hermes-egress");
    const service = named(
      documents(rendered, `${HERMES}/service.yaml`),
      "Service",
      "hermes-egress",
    );

    expect(deployment["spec"].template.spec.containers[0]?.image).toBe(
      `docker.io/ubuntu/squid@sha256:${"6a".repeat(32)}`,
    );
    expect(service["spec"].ports).toStrictEqual([
      { name: "proxy", port: 3128, targetPort: "proxy" },
    ]);
    expect(
      podSecurityFindings(rendered[`${HERMES}/workload.yaml`] ?? ""),
    ).toStrictEqual([]);
  });

  it("derives the same tree twice", () => {
    expect(tree(NARROWED)).toStrictEqual(rendered);
  });
});

describe("a Process narrowed to hosts on several ports, with no edge and one architecture", () => {
  const SEVERAL = `        egress:
          reason: Hermes reads the pull requests it reviews.
          hosts:
            - { host: api.github.com, port: 8443 }
            - { host: api.github.com, port: 443 }
            - { host: uploads.github.com, port: 443 }
`;
  const edits = after(PROXY_POLICY, {
    "agents/agents.project.yml": (text) =>
      text
        .replace(INTERNET, SEVERAL)
        .replace(
          "        dependsOn:\n          - { application: kubernetes-mcp-server, surface: mcp }\n",
          "",
        )
        .replace(
          "          site: enschede\n        # The memory, sessions",
          "          site: enschede\n          arch: [amd64]\n        # The memory, sessions",
        ),
  });
  const rendered = tree(edits);
  const policies = documents(rendered, `${HERMES}/egress-policy.yaml`);

  it("admits each port its hosts are reached on, ascending, and each host with its port", () => {
    const proxy = named(policies, "NetworkPolicy", "hermes-egress");
    const config = documents(rendered, `${HERMES}/configmap.yaml`).find(
      ({ metadata }) => metadata.name.includes("squid-conf"),
    )?.data["squid.conf"];

    expect(JSON.stringify(proxy["spec"].egress.at(-1)?.["ports"])).toBe(
      JSON.stringify([
        { protocol: "TCP", port: 443 },
        { protocol: "TCP", port: 8443 },
      ]),
    );
    expect(config).toContain("acl port0 port 443");
    expect(config).toContain("acl port1 port 8443");
    expect(config).toContain("acl host2 dstdomain uploads.github.com");
  });

  it("places the proxy where the Process is held: at its site and on its architectures", () => {
    const placed = (name: string): string =>
      JSON.stringify(
        named(
          documents(rendered, `${HERMES}/workload.yaml`),
          "Deployment",
          name,
        ),
      );
    const nodes = (name: string): string =>
      /"values":(\[[^\]]*\])/.exec(placed(name))?.[1] ?? "";

    expect(nodes("hermes-egress")).toBe(nodes("hermes"));
    expect(nodes("hermes")).not.toContain("pi");
  });

  it("keeps no edge off the proxy where it has none, and reaches the proxy first", () => {
    const hermes = named(policies, "NetworkPolicy", "hermes");
    const deployment = named(
      documents(rendered, `${HERMES}/workload.yaml`),
      "Deployment",
      "hermes",
    );
    const noProxy = deployment["spec"].template.spec.containers[0]?.env.find(
      ({ name }) => name === "NO_PROXY",
    )?.value;

    expect(JSON.stringify(hermes["spec"].egress[0]?.["to"])).toContain(
      "hermes-egress",
    );
    expect(noProxy).not.toContain("kubernetes-mcp-server");
  });
});

describe("a Process that declares internet egress", () => {
  const rendered = tree(PROXY_POLICY);
  const policies = documents(rendered, `${HERMES}/networkpolicy.yaml`);

  it("still reaches every public IPv4 address through its own policy, and has no proxy", () => {
    expect(
      JSON.stringify(named(policies, "NetworkPolicy", "hermes")),
    ).toContain("0.0.0.0/0");
    expect(rendered[`${HERMES}/egress-policy.yaml`]).toBeUndefined();
    expect(JSON.stringify(rendered)).not.toContain("hermes-egress");
  });

  it("keeps its policy out of the applied files, as it was", () => {
    expect(
      documents(rendered, `${HERMES}/kustomization.yaml`).flatMap(
        (doc) => doc["resources"],
      ),
    ).not.toContain("networkpolicy.yaml");
  });
});

describe("the Platform document and the Process, read together", () => {
  it("refuses host-narrowed egress where the platform names no egress proxy", () => {
    expect(
      refusals({
        "agents/agents.project.yml": replaced(INTERNET, HOSTS),
      }),
    ).toStrictEqual([
      expect.objectContaining({
        code: "E_NO_EGRESS_PROXY",
        path: "/applications/0/processes/0/egress",
      }),
    ]);
  });

  it("refuses a proxy image the images lock does not hold", () => {
    const result = rendering(
      after(NARROWED, {
        "platform/images.lock.yml": replaced("  squid:", "  squid-elsewhere:"),
      }),
    );

    expect(result.ok ? [] : result.diagnostics).toStrictEqual([
      expect.objectContaining({
        code: "E_UNLOCKED_IMAGE",
        path: "/egressProxy/image",
      }),
    ]);
  });

  it("refuses a Process that also holds the name its proxy derives", () => {
    const sibling = `      - name: hermes-egress
        lifecycle: application
        image: hermes
        runtime: none
        placement: { memory: 64Mi, cpu: 10m }
        cutover: interrupted

`;
    expect(
      refusals(
        after(NARROWED, {
          "agents/agents.project.yml": replaced(
            "  # Read-only cluster diagnostics for hermes.",
            `${sibling}  # Read-only cluster diagnostics for hermes.`,
          ),
        }),
      ).map(({ code }) => code),
    ).toStrictEqual(["E_DUPLICATE_PROCESS_NAME"]);
  });

  it("refuses host-narrowed egress on a Process that attaches to the VPN", () => {
    expect(
      refusals(
        after(NARROWED, {
          "agents/agents.project.yml": replaced(
            "        egress:\n          reason:",
            "        vpn: { forwardedPort: false }\n        egress:\n          reason:",
          ),
        }),
      ).map(({ code }) => code),
    ).toContain("E_EGRESS_WITH_VPN");
  });
});

describe("the variables a Process reads its proxy from", () => {
  it("spell the proxy in both cases and keep the cluster and the edges off it, once each", () => {
    expect(
      proxyEnvironmentOf("p.ns.svc.cluster.local", ["litellm", "litellm"]).map(
        ({ name }) => name,
      ),
    ).toStrictEqual([
      "HTTPS_PROXY",
      "HTTP_PROXY",
      "NO_PROXY",
      "http_proxy",
      "https_proxy",
      "no_proxy",
    ]);
    expect(
      proxyEnvironmentOf("p.ns.svc.cluster.local", ["litellm", "litellm"])
        .find(({ name }) => name === "NO_PROXY")
        ?.value.split(",")
        .filter((name) => name === "litellm"),
    ).toStrictEqual(["litellm"]);
  });
});
