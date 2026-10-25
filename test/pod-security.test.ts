// The restricted posture, held on the rendered tree.
//
// The compiler renders the posture's controls; this proves what it rendered
// meets Pod Security's `restricted` profile, the bar the estate's namespaces
// are admitted against. Each case starts from a pod that passes and breaks one
// control, so a check that never fires cannot hide behind a clean tree.
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { podSecurityFindings } from "../scripts/lib/pod-security.ts";

type Json = Record<string, unknown>;

/** A container that meets every control. */
function container(name = "app", context: Json = {}, extra: Json = {}): Json {
  return {
    name,
    image: "x",
    securityContext: {
      allowPrivilegeEscalation: false,
      readOnlyRootFilesystem: true,
      capabilities: { drop: ["ALL"] },
      ...context,
    },
    ...extra,
  };
}

/** A pod spec that meets every control, with `overrides` laid over it. */
function pod(overrides: Json = {}): Json {
  return {
    securityContext: {
      runAsNonRoot: true,
      runAsUser: 1000,
      seccompProfile: { type: "RuntimeDefault" },
    },
    containers: [container()],
    volumes: [{ name: "tmp", emptyDir: {} }],
    ...overrides,
  };
}

function deployment(spec: Json, annotations: Json = {}): string {
  return stringify({
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name: "web" },
    spec: { template: { metadata: { annotations }, spec } },
  });
}

/** The native VPN sidecar the platform derives beside an attached Process. */
function vpn(context: Json = {}): Json {
  return container(
    "vpn",
    {
      runAsNonRoot: false,
      runAsUser: 0,
      capabilities: { add: ["NET_ADMIN", "NET_RAW"] },
      allowPrivilegeEscalation: undefined,
      readOnlyRootFilesystem: undefined,
      ...context,
    },
    { restartPolicy: "Always" },
  );
}

describe("podSecurityFindings", () => {
  it("passes a pod that meets every control", () => {
    expect(podSecurityFindings(deployment(pod()))).toStrictEqual([]);
  });

  it("refuses a document that does not parse, rather than passing it unread", () => {
    const findings = podSecurityFindings("kind: Pod\nspec: [unclosed\n");
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]).toMatch(/^does not parse: /);
  });

  it("ignores an object that carries no pod", () => {
    const text = stringify({ apiVersion: "v1", kind: "Service", spec: {} });
    expect(podSecurityFindings(`${text}---\n`)).toStrictEqual([]);
  });

  it("names the object and container a finding is about", () => {
    const spec = pod({
      containers: [container("app", { allowPrivilegeEscalation: true })],
    });
    expect(podSecurityFindings(deployment(spec))).toStrictEqual([
      'Deployment/web container "app": allowPrivilegeEscalation is not false',
    ]);
  });

  it.each([
    ["allowPrivilegeEscalation", { allowPrivilegeEscalation: undefined }],
    ["readOnlyRootFilesystem", { readOnlyRootFilesystem: false }],
    ["drop ALL", { capabilities: { drop: ["NET_RAW"] } }],
    ["drop ALL", { capabilities: undefined }],
    [
      "adds capability SYS_ADMIN",
      { capabilities: { drop: ["ALL"], add: ["SYS_ADMIN"] } },
    ],
    ["privileged", { privileged: true }],
    ["runAsNonRoot", { runAsNonRoot: false }],
    ["runAsUser 0", { runAsUser: 0 }],
    ["seccompProfile", { seccompProfile: { type: "Unconfined" } }],
    ["procMount", { procMount: "Unmasked" }],
    ["hostProcess", { windowsOptions: { hostProcess: true } }],
    ["seLinuxOptions", { seLinuxOptions: { type: "spc_t" } }],
    ["seLinuxOptions", { seLinuxOptions: { user: "root" } }],
    ["appArmorProfile", { appArmorProfile: { type: "Unconfined" } }],
  ])("refuses a container whose %s breaks the profile", (control, context) => {
    const spec = pod({ containers: [container("app", context)] });
    const findings = podSecurityFindings(deployment(spec));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain(control);
  });

  it("accepts NET_BIND_SERVICE, Localhost seccomp and the container SELinux types", () => {
    const context = {
      capabilities: { drop: ["ALL"], add: ["NET_BIND_SERVICE"] },
      seccompProfile: { type: "Localhost", localhostProfile: "p.json" },
      seLinuxOptions: { type: "container_t", level: "s0:c1" },
      appArmorProfile: { type: "RuntimeDefault" },
      procMount: "Default",
    };
    const spec = pod({ containers: [container("app", context)] });
    expect(podSecurityFindings(deployment(spec))).toStrictEqual([]);
  });

  it("refuses a host port", () => {
    const app = container(
      "app",
      {},
      { ports: [{ containerPort: 80, hostPort: 80 }] },
    );
    const findings = podSecurityFindings(
      deployment(pod({ containers: [app] })),
    );
    expect(findings).toStrictEqual([
      'Deployment/web container "app": hostPort 80',
    ]);
  });

  // A node address derives a host port and a hard pin to its one node
  // (spec/v1/10-project-intent.md#hardening), so a host port on a pod held
  // to exactly one node is the derived shape, and any other is not.
  const onNodes = (...nodes: string[]): Json => ({
    nodeAffinity: {
      requiredDuringSchedulingIgnoredDuringExecution: {
        nodeSelectorTerms: [
          {
            matchExpressions: [
              { key: "kubernetes.io/hostname", operator: "In", values: nodes },
            ],
          },
        ],
      },
    },
  });
  const hostPorted = (affinity: Json): string[] =>
    podSecurityFindings(
      deployment(
        pod({
          affinity,
          containers: [
            container(
              "app",
              {},
              { ports: [{ containerPort: 25, hostPort: 25 }] },
            ),
          ],
        }),
      ),
    );

  it("accepts a host port on a pod held to one node", () => {
    expect(hostPorted(onNodes("frankfurt-contabo-1"))).toStrictEqual([]);
  });

  it("refuses a host port on a pod that may land on more than one node", () => {
    expect(hostPorted(onNodes("a", "b"))).toStrictEqual([
      'Deployment/web container "app": hostPort 25',
    ]);
  });

  it("refuses a host port on a pod held to one node by another key", () => {
    const affinity = onNodes("frankfurt-contabo-1") as {
      nodeAffinity: {
        requiredDuringSchedulingIgnoredDuringExecution: {
          nodeSelectorTerms: { matchExpressions: Json[] }[];
        };
      };
    };
    const term = affinity.nodeAffinity
      .requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[0] as {
      matchExpressions: Json[];
    };
    term.matchExpressions = [
      { key: "topology.kubernetes.io/zone", operator: "In", values: ["x"] },
    ];
    expect(hostPorted(affinity)).toStrictEqual([
      'Deployment/web container "app": hostPort 25',
    ]);
  });

  it("checks init and ephemeral containers too", () => {
    const spec = pod({
      initContainers: [container("init", { privileged: true })],
      ephemeralContainers: [container("debug", { privileged: true })],
    });
    expect(podSecurityFindings(deployment(spec))).toStrictEqual([
      'Deployment/web container "init": privileged',
      'Deployment/web container "debug": privileged',
    ]);
  });

  it("takes runAsNonRoot and seccomp from the container when the pod omits them", () => {
    const spec = pod({
      securityContext: {},
      containers: [
        container("app", {
          runAsNonRoot: true,
          seccompProfile: { type: "RuntimeDefault" },
        }),
      ],
    });
    expect(podSecurityFindings(deployment(spec))).toStrictEqual([]);
  });

  it("refuses a container that neither it nor its pod holds to non-root and a syscall filter", () => {
    const spec = pod({ securityContext: {} });
    expect(podSecurityFindings(deployment(spec))).toStrictEqual([
      'Deployment/web container "app": seccompProfile is neither RuntimeDefault nor Localhost',
      'Deployment/web container "app": runAsNonRoot is not true',
    ]);
  });

  it.each([
    ["hostNetwork", { hostNetwork: true }],
    ["hostPID", { hostPID: true }],
    ["hostIPC", { hostIPC: true }],
    [
      'volume "host" uses hostPath',
      { volumes: [{ name: "host", hostPath: { path: "/" } }] },
    ],
    [
      "sysctl kernel.msgmax",
      {
        securityContext: {
          ...(pod().securityContext as Json),
          sysctls: [{ name: "kernel.msgmax", value: "1" }],
        },
      },
    ],
    [
      "runAsNonRoot",
      {
        securityContext: {
          ...(pod().securityContext as Json),
          runAsNonRoot: false,
        },
      },
    ],
    [
      "runAsUser 0",
      { securityContext: { ...(pod().securityContext as Json), runAsUser: 0 } },
    ],
    [
      "seccompProfile",
      {
        securityContext: {
          ...(pod().securityContext as Json),
          seccompProfile: { type: "Unconfined" },
        },
      },
    ],
    [
      "hostProcess",
      {
        securityContext: {
          ...(pod().securityContext as Json),
          windowsOptions: { hostProcess: true },
        },
      },
    ],
    [
      "seLinuxOptions",
      {
        securityContext: {
          ...(pod().securityContext as Json),
          seLinuxOptions: { role: "sysadm_r" },
        },
      },
    ],
    [
      "appArmorProfile",
      {
        securityContext: {
          ...(pod().securityContext as Json),
          appArmorProfile: { type: "Unconfined" },
        },
      },
    ],
  ])("refuses a pod whose %s breaks the profile", (control, overrides) => {
    const findings = podSecurityFindings(deployment(pod(overrides)));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]).toMatch(/^Deployment\/web: /);
    expect(findings[0]).toContain(control);
  });

  it("accepts a safe sysctl", () => {
    const securityContext = {
      ...(pod().securityContext as Json),
      sysctls: [{ name: "net.ipv4.ip_unprivileged_port_start", value: "0" }],
    };
    expect(
      podSecurityFindings(deployment(pod({ securityContext }))),
    ).toStrictEqual([]);
  });

  it("refuses an unconfined AppArmor annotation", () => {
    const annotations = {
      "container.apparmor.security.beta.kubernetes.io/app": "unconfined",
    };
    expect(podSecurityFindings(deployment(pod(), annotations))).toStrictEqual([
      "Deployment/web: AppArmor annotation container.apparmor.security.beta.kubernetes.io/app is unconfined",
    ]);
  });

  it("finds the pod in a CronJob, a Job, a StatefulSet and a bare Pod", () => {
    const broken = pod({ hostNetwork: true });
    const template = { template: { spec: broken } };
    const objects = [
      {
        kind: "CronJob",
        metadata: { name: "a" },
        spec: { jobTemplate: { spec: template } },
      },
      { kind: "Job", metadata: { name: "b" }, spec: template },
      { kind: "StatefulSet", metadata: { name: "c" }, spec: template },
      { kind: "DaemonSet", metadata: { name: "d" }, spec: template },
      { kind: "Pod", metadata: { name: "e" }, spec: broken },
    ];
    const text = objects.map((object) => stringify(object)).join("---\n");
    expect(podSecurityFindings(text)).toStrictEqual([
      "CronJob/a: hostNetwork",
      "Job/b: hostNetwork",
      "StatefulSet/c: hostNetwork",
      "DaemonSet/d: hostNetwork",
      "Pod/e: hostNetwork",
    ]);
  });

  describe("the platform's VPN container", () => {
    it("may run as root with NET_ADMIN and NET_RAW, as chapter 14 states", () => {
      const spec = pod({ initContainers: [vpn()] });
      expect(podSecurityFindings(deployment(spec))).toStrictEqual([]);
    });

    it("may hold no other capability", () => {
      const spec = pod({
        initContainers: [
          vpn({ capabilities: { add: ["NET_ADMIN", "SYS_ADMIN"] } }),
        ],
      });
      expect(podSecurityFindings(deployment(spec))).toStrictEqual([
        'Deployment/web container "vpn": adds capability SYS_ADMIN',
      ]);
    });

    it("is held to the rest of the profile", () => {
      const spec = pod({ initContainers: [vpn({ privileged: true })] });
      expect(podSecurityFindings(deployment(spec))).toStrictEqual([
        'Deployment/web container "vpn": privileged',
      ]);
    });

    it("is only the native sidecar of that name", () => {
      const notSidecar = { ...vpn(), restartPolicy: undefined };
      const findings = podSecurityFindings(
        deployment(pod({ initContainers: [notSidecar] })),
      );
      expect(findings).toContain(
        'Deployment/web container "vpn": runAsNonRoot is not true',
      );
      const asApp = podSecurityFindings(
        deployment(pod({ containers: [vpn()] })),
      );
      expect(asApp).toContain('Deployment/web container "vpn": runAsUser 0');
    });
  });
});
