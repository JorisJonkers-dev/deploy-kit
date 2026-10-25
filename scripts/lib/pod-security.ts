// Pod Security's `restricted` profile, checked on rendered objects.
//
// Chapter 10's posture promises that every container the render emits meets
// `restricted`; this is the check that holds the rendered tree to it, so a
// control the render stops emitting fails the build instead of a pod's
// admission. It follows the profile's own control list
// (https://kubernetes.io/docs/concepts/security/pod-security-standards/) as of
// the Kubernetes version the worked Cluster Context records, plus the one
// control the posture adds on top: a read-only root filesystem.
//
// One container is outside the posture, and the check says so rather than
// hiding it: the VPN native sidecar the platform derives beside an attached
// Process runs as root with NET_ADMIN and NET_RAW (chapter 14's VPN section,
// ADR 0020). The posture's own controls (non-root, drop ALL, no privilege
// escalation, a read-only root filesystem) therefore do not apply to it; the
// rest of the profile does, and it may add no capability but those two.
//
// One control is relaxed where the model derives it: a host port, which the
// profile's baseline forbids, is the rendering of an exposure on a node's own
// address (chapter 10's L4 exposure section), and it comes with a hard pin to
// that node. A host port on a pod held to exactly one node by name passes;
// any other is still a finding.
//
// The Node Agents are outside it whole: each DaemonSet in node-system holds
// the host privileges its catalog entry fixes (chapter 14's Node Agents
// section), which no author declares and the catalog alone renders. The
// speaker's controller, a Deployment beside them, holds none and is checked.
import { parseAllDocuments } from "yaml";

type Json = Readonly<Record<string, unknown>>;

/** Where each pod-bearing kind keeps its pod template, as a path from `spec`. */
const TEMPLATE_PATHS: Readonly<Record<string, readonly string[]>> = {
  Pod: [],
  Deployment: ["template"],
  StatefulSet: ["template"],
  DaemonSet: ["template"],
  ReplicaSet: ["template"],
  ReplicationController: ["template"],
  Job: ["template"],
  CronJob: ["jobTemplate", "spec", "template"],
};

const VOLUME_TYPES = new Set([
  "configMap",
  "csi",
  "downwardAPI",
  "emptyDir",
  "ephemeral",
  "persistentVolumeClaim",
  "projected",
  "secret",
]);

const SAFE_SYSCTLS = new Set([
  "kernel.shm_rmid_forced",
  "net.ipv4.ip_local_port_range",
  "net.ipv4.ip_unprivileged_port_start",
  "net.ipv4.tcp_syncookies",
  "net.ipv4.ping_group_range",
  "net.ipv4.ip_local_reserved_ports",
  "net.ipv4.tcp_keepalive_time",
  "net.ipv4.tcp_fin_timeout",
  "net.ipv4.tcp_keepalive_intvl",
  "net.ipv4.tcp_keepalive_probes",
]);

const SELINUX_TYPES = new Set([
  "",
  "container_t",
  "container_init_t",
  "container_kvm_t",
  "container_engine_t",
]);

const PROFILE_TYPES = new Set(["RuntimeDefault", "Localhost"]);
const APPARMOR_ANNOTATION = "container.apparmor.security.beta.kubernetes.io/";
const VPN_CAPABILITIES = new Set(["NET_ADMIN", "NET_RAW"]);

function record(value: unknown): Json {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Json)
    : {};
}

function list(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

/** A string as YAML wrote it, anything else as JSON, and nothing as empty. */
function scalar(value: unknown): string {
  if (typeof value === "string") return value;
  return value === undefined ? "" : JSON.stringify(value);
}

function strings(value: unknown): readonly string[] {
  return list(value).map(scalar);
}

/** What a pod-level or container-level context sets the profile forbids. */
function sharedFindings(context: Json): string[] {
  const findings: string[] = [];
  if (record(context.windowsOptions).hostProcess === true)
    findings.push("hostProcess");
  const selinux = record(context.seLinuxOptions);
  if (
    !SELINUX_TYPES.has(scalar(selinux.type ?? "")) ||
    scalar(selinux.user ?? "") !== "" ||
    scalar(selinux.role ?? "") !== ""
  )
    findings.push(
      "seLinuxOptions set a type, user or role the profile forbids",
    );
  const apparmor = record(context.appArmorProfile).type;
  if (apparmor !== undefined && !PROFILE_TYPES.has(scalar(apparmor)))
    findings.push(`appArmorProfile is ${scalar(apparmor)}`);
  return findings;
}

function podFindings(spec: Json, annotations: Json): string[] {
  const findings: string[] = [];
  for (const namespace of ["hostNetwork", "hostPID", "hostIPC"])
    if (spec[namespace] === true) findings.push(namespace);
  for (const volume of list(spec.volumes).map(record)) {
    const type = Object.keys(volume).find((key) => key !== "name");
    if (type !== undefined && !VOLUME_TYPES.has(type))
      findings.push(`volume "${scalar(volume.name)}" uses ${type}`);
  }
  const context = record(spec.securityContext);
  for (const sysctl of list(context.sysctls).map(record))
    if (!SAFE_SYSCTLS.has(scalar(sysctl.name)))
      findings.push(`sysctl ${scalar(sysctl.name)} is not in the safe set`);
  if (context.runAsNonRoot === false) findings.push("runAsNonRoot is false");
  if (context.runAsUser === 0) findings.push("runAsUser 0");
  const seccomp = record(context.seccompProfile).type;
  if (seccomp !== undefined && !PROFILE_TYPES.has(scalar(seccomp)))
    findings.push(`seccompProfile is ${scalar(seccomp)}`);
  findings.push(...sharedFindings(context));
  for (const [key, value] of Object.entries(annotations)) {
    const profile = scalar(value);
    if (
      key.startsWith(APPARMOR_ANNOTATION) &&
      !["", "runtime/default"].includes(profile) &&
      !profile.startsWith("localhost/")
    )
      findings.push(`AppArmor annotation ${key} is ${profile}`);
  }
  return findings;
}

/**
 * Whether a pod's required node affinity holds it to exactly one node by name:
 * the hard pin a node address derives beside its host ports.
 */
function heldToOneNode(spec: Json): boolean {
  const terms = list(
    record(
      record(record(spec.affinity).nodeAffinity)
        .requiredDuringSchedulingIgnoredDuringExecution,
    ).nodeSelectorTerms,
  ).map(record);
  if (terms.length !== 1) return false;
  const expressions = list((terms[0] as Json).matchExpressions).map(record);
  return (
    expressions.length === 1 &&
    (expressions[0] as Json).key === "kubernetes.io/hostname" &&
    (expressions[0] as Json).operator === "In" &&
    list((expressions[0] as Json).values).length === 1
  );
}

function containerFindings(
  container: Json,
  pod: Json,
  isVpn: boolean,
  pinned: boolean,
): string[] {
  const findings: string[] = [];
  const context = record(container.securityContext);
  if (context.privileged === true) findings.push("privileged");
  for (const port of list(container.ports).map(record))
    if (typeof port.hostPort === "number" && port.hostPort !== 0 && !pinned)
      findings.push(`hostPort ${scalar(port.hostPort)}`);
  if (context.procMount !== undefined && context.procMount !== "Default")
    findings.push(`procMount is ${scalar(context.procMount)}`);
  findings.push(...sharedFindings(context));

  const seccomp = record(context.seccompProfile).type;
  const podSeccomp = record(pod.seccompProfile).type;
  if (!PROFILE_TYPES.has(scalar(seccomp ?? podSeccomp)))
    findings.push("seccompProfile is neither RuntimeDefault nor Localhost");

  const capabilities = record(context.capabilities);
  const allowed = isVpn ? VPN_CAPABILITIES : new Set(["NET_BIND_SERVICE"]);
  for (const capability of strings(capabilities.add))
    if (!allowed.has(capability))
      findings.push(`adds capability ${capability}`);
  if (isVpn) return findings;

  if (!strings(capabilities.drop).includes("ALL"))
    findings.push("capabilities do not drop ALL");
  if (context.allowPrivilegeEscalation !== false)
    findings.push("allowPrivilegeEscalation is not false");
  if ((context.runAsNonRoot ?? pod.runAsNonRoot) !== true)
    findings.push("runAsNonRoot is not true");
  if (context.runAsUser === 0) findings.push("runAsUser 0");
  if (context.readOnlyRootFilesystem !== true)
    findings.push("readOnlyRootFilesystem is not true");
  return findings;
}

/** The pod template an object carries, or undefined for a kind that carries none. */
function podTemplate(
  object: Json,
): { spec: Json; annotations: Json } | undefined {
  const path = TEMPLATE_PATHS[scalar(object.kind)];
  if (path === undefined) return undefined;
  const template = path.reduce(
    (node, key) => record(node[key]),
    record(object.spec),
  );
  return object.kind === "Pod"
    ? {
        spec: template,
        annotations: record(record(object.metadata).annotations),
      }
    : {
        spec: record(template.spec),
        annotations: record(record(template.metadata).annotations),
      };
}

/**
 * Whether an object is a Node Agent: a DaemonSet in node-system, which only the
 * Node Agent catalog renders, with the host privileges its entry fixes.
 */
const isNodeAgent = (object: Json): boolean =>
  object.kind === "DaemonSet" &&
  record(object.metadata).namespace === "node-system";

/** Every way the objects in one YAML stream break the restricted profile. */
export function podSecurityFindings(text: string): string[] {
  const findings: string[] = [];
  for (const document of parseAllDocuments(text)) {
    // A document that does not parse yields no pod, so it would pass unread.
    for (const error of document.errors)
      findings.push(`does not parse: ${error.message}`);
    const object = record(document.toJS());
    if (isNodeAgent(object)) continue;
    const template = podTemplate(object);
    if (template === undefined) continue;
    const { spec, annotations } = template;
    const name = `${scalar(object.kind)}/${scalar(record(object.metadata).name)}`;
    for (const finding of podFindings(spec, annotations))
      findings.push(`${name}: ${finding}`);
    const pod = record(spec.securityContext);
    const pinned = heldToOneNode(spec);
    const groups = [
      ["initContainers", list(spec.initContainers)],
      ["containers", list(spec.containers)],
      ["ephemeralContainers", list(spec.ephemeralContainers)],
    ] as const;
    for (const [group, containers] of groups)
      for (const container of containers.map(record)) {
        const isVpn =
          group === "initContainers" &&
          container.name === "vpn" &&
          container.restartPolicy === "Always";
        for (const finding of containerFindings(container, pod, isVpn, pinned))
          findings.push(
            `${name} container "${scalar(container.name)}": ${finding}`,
          );
      }
  }
  return findings;
}
