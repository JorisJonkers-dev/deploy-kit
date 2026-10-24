// What a Client derives (spec/v1/17-sign-in.md): the Client object an
// Application's `client` block derives, whether an exposure's routes ask the
// Gate, the Gate's own route, the credential path a secret is held at, and the
// grants on it, the provider's write and each reader's read.
import type {
  EffectiveApplication,
  EffectiveProcess,
  EffectiveProject,
} from "../model/effective-intent.ts";
import { notSupported } from "../model/internal-failure.ts";
import {
  holds,
  type PlatformIntentDocument,
} from "../model/platform-intent.ts";
import type { ApplicationDocument } from "../model/project-intent.ts";
import { clientExposure } from "../model/project-intent-queries.ts";
import type {
  ResolvedClient,
  ResolvedProcess,
} from "../model/resolved-deployment.ts";
import { namespaceOf } from "../model/runtime-profiles.ts";
import { destinationOf } from "./secrets.ts";

type Exposure = NonNullable<ApplicationDocument["exposure"]>[number];
type ResolvedGrant = NonNullable<ResolvedProcess["secrets"]>[number];

/** The keys a client credential holds: the Client id beside its secret. */
const CREDENTIAL_KEYS = ["id", "secret"];

/** What the sign-in provider may do on each client credential: create, read and rotate it. */
const PROVIDER_ALLOWS = ["create", "read", "update"];

/** The role every Client has, before the ones it declares. */
const USER_ROLE = "user";

/**
 * Where a Client holding a secret keeps it: in its Application's own
 * namespace subtree (spec/v1/17-sign-in.md#credentials-and-placeholders).
 */
export const clientSecretPath = (
  project: string,
  application: string,
): string => `secret/data/${namespaceOf(project)}/${application}/client`;

/** The Client an Application's `client` block derives, where it declares one. */
export function resolveClient(
  application: EffectiveApplication,
  project: string,
): ResolvedClient | undefined {
  const { client } = application;
  if (client === undefined) return undefined;
  // The Client names an exposure its Application declares, or
  // E_CLIENT_EXPOSURE_UNRESOLVED refused it.
  const { host } = clientExposure(application, client) as Exposure;
  const url = (path: string): string => `https://${host}${path}`;
  return {
    signIn: client.signIn,
    host,
    // A token Client has no tile, so nothing launches it.
    ...(client.signIn === "token"
      ? {}
      : { launchUrl: url(client.launchPath ?? "/") }),
    ...(client.iconPath === undefined ? {} : { iconUrl: url(client.iconPath) }),
    ...(client.redirectPaths === undefined
      ? {}
      : { redirectUris: client.redirectPaths.map(url) }),
    ...(client.credential === undefined
      ? {}
      : { credential: client.credential }),
    ...(client.credential === "secret"
      ? { secretPath: clientSecretPath(project, application.id) }
      : {}),
    roles: [USER_ROLE, ...(client.roles ?? [])],
    ...(client.label === undefined ? {} : { label: client.label }),
    ...(client.description === undefined
      ? {}
      : { description: client.description }),
  };
}

/**
 * Whether an exposure's authenticated routes ask the tier's forward-auth
 * (spec/v1/17-sign-in.md#what-the-edge-derives): only where the Client that
 * names the exposure is gated. An exposure no Client names keeps forward-auth
 * from its audience alone, while E_AUTHENTICATED_WITHOUT_CLIENT waits.
 */
export function asksTheGate(
  application: Pick<EffectiveApplication, "exposure" | "client">,
  exposure: Exposure,
): boolean {
  const { client } = application;
  if (client === undefined) return true;
  // A Client names an exposure its Application declares, or
  // E_CLIENT_EXPOSURE_UNRESOLVED refused it.
  if ((clientExposure(application, client) as Exposure).name !== exposure.name)
    return true;
  return client.signIn === "gated";
}

/** Whether the exposure is a gated Client's, which derives the Gate's own route. */
export const gatedBy = (
  application: Pick<EffectiveApplication, "exposure" | "client">,
  exposure: Exposure,
): boolean => {
  const { client } = application;
  return (
    client?.signIn === "gated" &&
    (clientExposure(application, client) as Exposure).name === exposure.name
  );
};

/** An in-cluster address: a Service, its namespace, and the port it may name. */
const CLUSTER_ADDRESS =
  /^(https?):\/\/([a-z0-9-]+)\.([a-z0-9-]+)\.svc\.cluster\.local(?::(\d+))?(?:\/|$)/;

/** A scheme's port, where an address names none. */
const DEFAULT_PORTS: Readonly<Record<string, number>> = {
  http: 80,
  https: 443,
};

/**
 * The Service the tier's forward-auth endpoint names, which the Gate's own
 * route is served by: the same address the edge asks, so a move of the
 * provider repoints both (spec/v1/16-dependencies.md#the-stable-address).
 */
export function gateAddressOf(endpoint: string): {
  readonly name: string;
  readonly namespace: string;
  readonly port: number;
} {
  const match = CLUSTER_ADDRESS.exec(endpoint);
  if (match === null)
    throw notSupported(
      `${endpoint}: a forward-auth endpoint outside the cluster has no route to serve the Gate's own`,
    );
  const [, scheme, name, namespace, port] = match as unknown as [
    string,
    string,
    string,
    string,
    string | undefined,
  ];
  return {
    name,
    namespace,
    port: port === undefined ? (DEFAULT_PORTS[scheme] as number) : Number(port),
  };
}

/**
 * Whether a Process reads its Client's secret, in any env file it holds: read
 * through its own key, which a lint reading `process.env` as the ambient
 * environment would mistake for it.
 */
const readsTheSecret = ({ env }: EffectiveProcess): boolean =>
  // A Process with no env file and one with an empty list read nothing alike.
  // Stryker disable next-line ArrayDeclaration
  (env ?? []).some(({ entries }) =>
    entries.some(
      ({ value }) =>
        "kind" in value && value.kind === "client" && value.source === "secret",
    ),
  );

export interface ClientContext {
  readonly platform: PlatformIntentDocument;
  readonly project: string;
  readonly union: readonly EffectiveProject[];
}

/** Every Client of the union holding a secret, by its credential path, in path order. */
function secretPaths(union: readonly EffectiveProject[]): [string, string][] {
  const held = union.flatMap(({ project, applications }) =>
    applications
      .filter(({ client }) => client?.credential === "secret")
      .map(({ id }): [string, string] => [id, clientSecretPath(project, id)]),
  );
  // No two Clients share a path, so `<=` would order the same list.
  // Stryker disable next-line EqualityOperator
  return held.sort(([, a], [, b]) => (a < b ? -1 : 1));
}

/**
 * The grants a Client derives on one Process
 * (spec/v1/17-sign-in.md#credentials-and-placeholders): `read` on its own
 * Client's credential, delivered as a `${secret:…}` reference is, where the
 * Process references `${client:secret}`; and, on each Process of the sign-in
 * provider, write on every client credential of the union, read by the
 * Process itself.
 */
export function clientGrantsOf(
  process: EffectiveProcess,
  application: EffectiveApplication,
  context: ClientContext,
): ResolvedGrant[] {
  const path = clientSecretPath(context.project, application.id);
  // E_CLIENT_PLACEHOLDER_WITHOUT_SECRET refused a reference where the Client
  // holds no secret.
  const reads: ResolvedGrant[] = readsTheSecret(process)
    ? [
        {
          path,
          keys: [...CREDENTIAL_KEYS],
          access: "read",
          delivery: "env",
          destination: destinationOf(process.name, path),
          // The provider rotates the value, and the Process reads it once.
          restartTargets: [process.name],
        },
      ]
    : [];
  const writes: ResolvedGrant[] = holds(
    context.platform.signIn?.provider,
    context.project,
    application.id,
  )
    ? secretPaths(context.union).map(([client, held]) => ({
        client,
        delivery: "self",
        paths: [{ path: held, allows: [...PROVIDER_ALLOWS] }],
      }))
    : [];
  return [...reads, ...writes];
}
