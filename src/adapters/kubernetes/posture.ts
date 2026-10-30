// The restricted posture as each container renders it
// (spec/v1/10-project-intent.md#hardening): the five controls, the one
// capability a low port derives, and the home a writable /tmp gives.
import type {
  Container,
  ContainerPort,
  EnvVar,
  VolumeMount,
} from "../../objects/kubernetes.ts";

export const RESTRICTED: Container["securityContext"] = {
  allowPrivilegeEscalation: false,
  readOnlyRootFilesystem: true,
  capabilities: { drop: ["ALL"] },
};

/** The first port an unprivileged process may bind without a capability. */
const FIRST_UNPRIVILEGED_PORT = 1024;

/**
 * The posture of a container that listens on these ports
 * (spec/v1/10-project-intent.md#a-low-port-earns-net_bind_service): one
 * below 1024 adds `NET_BIND_SERVICE` back, and nothing else, so an image whose
 * binary carries that file capability can still execute it.
 */
export const postureOf = (
  // A container that listens on nothing and one with no list bind alike.
  // Stryker disable next-line ArrayDeclaration
  ports: readonly ContainerPort[] = [],
): Container["securityContext"] =>
  ports.some(({ containerPort }) => containerPort < FIRST_UNPRIVILEGED_PORT)
    ? {
        ...RESTRICTED,
        capabilities: { add: ["NET_BIND_SERVICE"], drop: ["ALL"] },
      }
    : RESTRICTED;

/** The writable directory a container's home points at, where it mounts one. */
export const HOME = "/tmp";

/**
 * A container's variables with `HOME` at its writable /tmp
 * (spec/v1/10-project-intent.md#home-is-the-writable-tmp): added last, where
 * the container mounts a writable volume at /tmp and its own variables name no
 * `HOME`, since an authored one wins. A container with no writable /tmp keeps
 * its variables as they are: a home on the read-only root is no home.
 */
export const withHome = (
  env: readonly EnvVar[],
  mounts: readonly VolumeMount[],
): readonly EnvVar[] =>
  mounts.some(
    ({ mountPath, readOnly }) => mountPath === HOME && readOnly === undefined,
  ) && !env.some(({ name }) => name === "HOME")
    ? [...env, { name: "HOME", value: HOME }]
    : env;
