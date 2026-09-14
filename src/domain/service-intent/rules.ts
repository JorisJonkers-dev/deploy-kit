// Service Intent's well-formedness rules: the third of the four parts of a
// language definition, after the abstract syntax (model.ts) and the concrete
// syntax (src/wire/service-intent/), and before the semantics, which this
// repository does not yet have.
//
// A rule is a pure function from one parsed Domain to a diagnostic list,
// registered with its code, exactly the shape docs/architecture.md#error-model
// gives the estate-wide invariants. The registry is **enumerable**, which is
// what makes "a rule with no test, no fixture or no specification anchor" a
// detectable condition rather than an absent one, and it is the list issue #44
// hangs an Essential OCL statement off.
//
// Only rules that one document decides live here. A rule that needs a second
// document (the composed union, the Platform document, the node contract, the
// images lock, the ClusterState snapshot) is composition's or render's, and
// registering it here would mean evaluating it against half its inputs. The
// boundary is stated in full in `NOT_DECIDED_BY_ONE_DOCUMENT` below.
import { child, type Diagnostic } from "../diagnostic.ts";
import {
  derivesBackup,
  grantsOf,
  workloadsOf,
  type Domain,
  type Grant,
  type Service,
  type Workload,
} from "./model.ts";

/**
 * Where the rule sits in Essential OCL (#44 writes the statements themselves).
 *
 * - `inv`: an invariant on instances of `context`.
 * - `derive`: the definition of a derived value.
 * - `pre`: a precondition on an operation.
 *
 * Every rule a single document decides is an `inv`; the other two placements
 * belong to the derivation this repository has not written yet, and the field
 * exists now so that the registry's shape does not change when they arrive.
 */
export type Placement = "inv" | "derive" | "pre";

/** One model rule: its code, where it sits, what it constrains, what it is. */
export interface Rule {
  /** The specification's code for this refusal. Unique across the registry. */
  readonly code: `E_${string}`;
  /** The metamodel class the constraint is written against. */
  readonly context: string;
  readonly placement: Placement;
  /** The heading in `spec/v1/10-service-intent.md` that defines the rule. */
  readonly anchor: string;
  /** What a reader is told, in one line, when nothing has gone wrong yet. */
  readonly states: string;
  /** Every violation in `document`, in document order. */
  readonly evaluate: (document: Domain) => readonly Diagnostic[];
}

/** Build one `document`-kind Diagnostic for `rule`. */
function violation(
  rule: Pick<Rule, "code">,
  path: string,
  message: string,
): Diagnostic {
  return {
    code: rule.code,
    kind: "document",
    // The reader supplies the file; a rule knows only the document it was
    // handed. `parseServiceIntent` stamps this before it returns.
    document: "",
    at: path,
    message,
  };
}

/** Each `workloads[i]` of each `services[j]`, with the Service that holds it. */
function eachWorkload(
  document: Domain,
): readonly { service: Service; workload: Workload }[] {
  return workloadsOf(document);
}

/**
 * The first index of every value that appears more than once, after the first.
 * Reporting the repeat rather than the original is what puts the diagnostic on
 * the line the author just added.
 */
function repeats<T>(values: readonly T[], key: (value: T) => string): number[] {
  const seen = new Set<string>();
  const out: number[] = [];
  values.forEach((value, index) => {
    const k = key(value);
    if (seen.has(k)) out.push(index);
    else seen.add(k);
  });
  return out;
}

const ALERT_CLASS_WITHOUT_SIGNAL: Rule = {
  code: "E_ALERT_CLASS_WITHOUT_SIGNAL",
  context: "Observability",
  placement: "inv",
  anchor: "observability",
  states:
    "the observability block is whole or absent: a class states how loudly to " +
    "wake someone and means nothing without a signal to wake them about",
  evaluate: (document) =>
    document.services.flatMap((service) => {
      const block = service.observability;
      if (block === undefined || block.scrape !== undefined) return [];
      return [
        violation(
          ALERT_CLASS_WITHOUT_SIGNAL,
          block.at,
          `service ${service.id} declares alertClass ${block.alertClass} and no scrape`,
        ),
      ];
    }),
};

const CUTOVER_UNHONOURABLE: Rule = {
  code: "E_CUTOVER_UNHONOURABLE",
  context: "Workload",
  placement: "inv",
  anchor: "cutover-is-declared-not-promised",
  states:
    "cutover: rolling asks for continuity through the cutover, and a volume " +
    "on this substrate is ReadWriteOnce, which cannot attach to two pods at " +
    "once: the surge a rolling cutover needs cannot happen",
  evaluate: (document) =>
    eachWorkload(document).flatMap(({ workload }) =>
      workload.cutover === "rolling" && workload.volumes.length > 0
        ? [
            violation(
              CUTOVER_UNHONOURABLE,
              child(workload.at, "cutover"),
              `workload ${workload.name} asks for a rolling cutover over ` +
                `${workload.volumes.length} volume(s) that cannot surge`,
            ),
          ]
        : [],
    ),
};

const PRIVILEGED_PORT_UNDER_NONROOT: Rule = {
  code: "E_PRIVILEGED_PORT_UNDER_NONROOT",
  context: "Surface",
  placement: "inv",
  anchor: "a-privileged-port-needs-the-capability-that-binds-it",
  states:
    "a port below 1024 cannot be bound by a non-root process without " +
    "CAP_NET_BIND_SERVICE, and the restricted class drops every capability",
  evaluate: (document) =>
    eachWorkload(document).flatMap(({ workload }) =>
      workload.provides
        .filter((surface) => surface.port < 1024)
        .map((surface) =>
          violation(
            PRIVILEGED_PORT_UNDER_NONROOT,
            surface.at,
            `workload ${workload.name} provides ${surface.name} on ` +
              `${surface.port}; the answer is a port above 1024`,
          ),
        ),
    ),
};

const ENGINE_WITHOUT_DURABILITY: Rule = {
  code: "E_ENGINE_WITHOUT_DURABILITY",
  context: "Workload",
  placement: "inv",
  anchor: "workload",
  states:
    "engine is what the platform keys a backup method off, so it is refused " +
    "on a Workload holding no volume of a class that derives one",
  evaluate: (document) =>
    eachWorkload(document).flatMap(({ workload }) =>
      workload.engine !== undefined &&
      !workload.volumes.some((volume) => derivesBackup(volume.durability))
        ? [
            violation(
              ENGINE_WITHOUT_DURABILITY,
              child(workload.at, "engine"),
              `workload ${workload.name} declares engine ${workload.engine} ` +
                "and holds no volume whose Durability Class derives a backup",
            ),
          ]
        : [],
    ),
};

const DURABILITY_WITHOUT_ENGINE: Rule = {
  code: "E_DURABILITY_WITHOUT_ENGINE",
  context: "Workload",
  placement: "inv",
  anchor: "workload",
  states:
    "the backup method is an image the platform names per engine, so a volume " +
    "whose class derives a backup needs the Workload to say what the process is",
  evaluate: (document) =>
    eachWorkload(document).flatMap(({ workload }) => {
      if (workload.engine !== undefined) return [];
      return workload.volumes
        .filter((volume) => derivesBackup(volume.durability))
        .map((volume) =>
          violation(
            DURABILITY_WITHOUT_ENGINE,
            child(volume.at, "durability"),
            `volume ${volume.claim} is ${volume.durability}, which derives a ` +
              `backup, and workload ${workload.name} declares no engine`,
          ),
        );
    }),
};

const DUPLICATE_WORKLOAD_NAME: Rule = {
  code: "E_DUPLICATE_WORKLOAD_NAME",
  context: "Domain",
  placement: "inv",
  anchor: "service-identity",
  states:
    "the Workload name alone is the ServiceAccount and the Vault role under " +
    "the domain's namespace, so it is unique within the domain file and not " +
    "merely within the Service",
  evaluate: (document) => {
    const all = eachWorkload(document);
    return repeats(all, ({ workload }) => workload.name).map((index) => {
      const { workload } = all[index] as (typeof all)[number];
      return violation(
        DUPLICATE_WORKLOAD_NAME,
        child(workload.at, "name"),
        `two Workloads of domain ${document.domain} are called ${workload.name}`,
      );
    });
  },
};

const DUPLICATE_EXPOSURE_NAME: Rule = {
  code: "E_DUPLICATE_EXPOSURE_NAME",
  context: "Service",
  placement: "inv",
  anchor: "exposure",
  states:
    "an exposure name is the second half of ${exposure:<service>.<name>#url}, " +
    "already qualified by the Service id, so it is unique within the Service",
  evaluate: (document) =>
    document.services.flatMap((service) =>
      repeats(service.exposure, (exposure) => exposure.name).map((index) => {
        const exposure = service.exposure[
          index
        ] as (typeof service.exposure)[number];
        return violation(
          DUPLICATE_EXPOSURE_NAME,
          child(exposure.at, "name"),
          `service ${service.id} declares two exposures called ${exposure.name}`,
        );
      }),
    ),
};

const DUPLICATE_ROUTE_MATCH: Rule = {
  code: "E_DUPLICATE_ROUTE_MATCH",
  context: "Exposure",
  placement: "inv",
  anchor: "what-is-checked",
  states:
    "two routes of one exposure sharing a path and a match render two rules " +
    "with identical matchers, and which serves a request is the router's " +
    "tie-break rather than anything the author wrote",
  evaluate: (document) =>
    document.services.flatMap((service) =>
      service.exposure.flatMap((exposure) =>
        repeats(exposure.routes, (route) => `${route.match} ${route.path}`).map(
          (index) => {
            const route = exposure.routes[
              index
            ] as (typeof exposure.routes)[number];
            return violation(
              DUPLICATE_ROUTE_MATCH,
              route.at,
              `exposure ${service.id}.${exposure.name} declares two routes ` +
                `matching ${route.match} ${route.path}`,
            );
          },
        ),
      ),
    ),
};

const ENV_CANNOT_RELOAD: Rule = {
  code: "E_ENV_CANNOT_RELOAD",
  context: "Grant",
  placement: "inv",
  anchor: "zero-downtime-rotation",
  states:
    "a pod's environment is fixed for its lifetime, so a rotated value cannot " +
    "reach a running process through it: env with tolerates reload is a " +
    "promise the substrate cannot keep",
  evaluate: (document) =>
    eachGrant(document).flatMap(({ grant }) =>
      grant.delivery === "env" && grant.rotation.tolerates === "reload"
        ? [
            violation(
              ENV_CANNOT_RELOAD,
              child(grant.rotation.at, "tolerates"),
              "delivery: env cannot reload; it costs a rollout, and the " +
                "declaration has to say so",
            ),
          ]
        : [],
    ),
};

/**
 * The illegal cells of chapter 10's twelve. `self-renew` x `file` is recorded
 * there as **open** rather than refused, so it is deliberately absent.
 */
const ILLEGAL_CELLS = new Set([
  "self-renew env",
  "custody env",
  "custody file",
]);

const ILLEGAL_DELIVERY_FOR_ACCESS: Rule = {
  code: "E_ILLEGAL_DELIVERY_FOR_ACCESS",
  context: "Grant",
  placement: "inv",
  anchor: "which-tier-may-use-which-delivery",
  states:
    "custody with env or file asks the renderer to sync paths that do not " +
    "exist yet; self-renew with env hands a token with no capability on its " +
    "path a Secret it never reads; and self-roll derives patch, which does " +
    "not include read, so a projected value needs a companion read entry",
  evaluate: (document) =>
    eachGrant(document).flatMap(({ grant, siblings }) => {
      if (grant.engine !== "kv") return [];
      if (ILLEGAL_CELLS.has(`${grant.access} ${grant.delivery}`))
        return [
          violation(
            ILLEGAL_DELIVERY_FOR_ACCESS,
            child(grant.at, "delivery"),
            `access ${grant.access} with delivery ${grant.delivery} is not a ` +
              "legal cell",
          ),
        ];
      if (grant.access !== "self-roll" || grant.delivery === "self") return [];
      const companion = siblings.some(
        (other) =>
          other !== grant &&
          other.engine === "kv" &&
          other.access === "read" &&
          other.path === grant.path,
      );
      return companion
        ? []
        : [
            violation(
              ILLEGAL_DELIVERY_FOR_ACCESS,
              child(grant.at, "delivery"),
              `access self-roll derives patch, which does not include read, ` +
                `so ${grant.delivery} delivery of ${grant.path} needs a ` +
                "companion read entry on the same path",
            ),
          ];
    }),
};

const NON_KV_DELIVERY: Rule = {
  code: "E_NON_KV_DELIVERY",
  context: "Grant",
  placement: "inv",
  anchor: "zero-downtime-rotation",
  states:
    "a transit key is never materialised into a variable or a file, so self " +
    "is its only legal delivery; a database credential is projected exactly " +
    "as a static one is, so this narrows to transit (0085)",
  evaluate: (document) =>
    eachGrant(document).flatMap(({ grant }) =>
      grant.engine === "transit" && grant.delivery !== "self"
        ? [
            violation(
              NON_KV_DELIVERY,
              child(grant.at, "delivery"),
              `a transit grant on ${grant.key} may only be delivered as self, ` +
                `never as ${grant.delivery}`,
            ),
          ]
        : [],
    ),
};

/**
 * Every grant in the document, each with the effective set it belongs to: the
 * Service's list plus the holding Workload's own (chapter 10, Secrets). A
 * Service-level grant therefore appears once per Workload that holds it, which
 * is what lets `self-roll` on a Workload find its companion `read` wherever the
 * author wrote it.
 */
function eachGrant(document: Domain): readonly {
  grant: Grant;
  siblings: readonly Grant[];
}[] {
  const out: { grant: Grant; siblings: readonly Grant[] }[] = [];
  const seen = new Set<string>();
  for (const { service, workload } of workloadsOf(document)) {
    const siblings = grantsOf(service, workload);
    for (const grant of siblings) {
      // A Service-level grant is one declaration held by several Workloads.
      // Its document path is the declaration's, so this deduplicates on it and
      // reports one diagnostic per authored line.
      if (seen.has(grant.at)) continue;
      seen.add(grant.at);
      out.push({ grant, siblings });
    }
  }
  return out;
}

/**
 * The rules one Service Intent document decides, in evaluation order.
 *
 * Order is a reporting choice and nothing more: every rule runs, and none of
 * them reads another's output.
 */
export const SERVICE_INTENT_RULES: readonly Rule[] = [
  ALERT_CLASS_WITHOUT_SIGNAL,
  CUTOVER_UNHONOURABLE,
  PRIVILEGED_PORT_UNDER_NONROOT,
  ENGINE_WITHOUT_DURABILITY,
  DURABILITY_WITHOUT_ENGINE,
  DUPLICATE_WORKLOAD_NAME,
  DUPLICATE_EXPOSURE_NAME,
  DUPLICATE_ROUTE_MATCH,
  ENV_CANNOT_RELOAD,
  ILLEGAL_DELIVERY_FOR_ACCESS,
  NON_KV_DELIVERY,
];

/**
 * Rules the specification defines that one document cannot decide, and the
 * input each is missing. This is a boundary, not a backlog: a rule here is not
 * unimplemented, it is evaluated somewhere else, and putting it in the registry
 * above would mean running it against half its inputs.
 *
 * It is stated as data so that a test can hold it disjoint from the registry
 * and #44 can register both halves without re-deciding which is which.
 */
export const NOT_DECIDED_BY_ONE_DOCUMENT: Readonly<Record<string, string>> = {
  E_DUPLICATE_SERVICE_ID: "the composed union of every Intent Fragment",
  E_DUPLICATE_DOMAIN: "the composed union of every Intent Fragment",
  E_DUPLICATE_HOST:
    "the composed union, together with the Registered Unmanaged Surfaces",
  E_DUPLICATE_APEX:
    "the composed union, together with the Registered Unmanaged Surfaces",
  E_SUBTREE_PREFIX_COLLISION: "the composed union's Secret Subtrees",
  E_UNRESOLVED_SERVICE:
    "the composed union, plus the Platform document's providers",
  E_UNKNOWN_SURFACE:
    "a linking step over named references, which is issue #39's",
  E_PROVIDER_WITHOUT_COORDINATES: "the Platform document's providers",
  E_DEPENDENCY_CYCLE: "the composed union's edge set",
  E_NO_TIER_FOR_AUDIENCE: "the Platform document's access tiers",
  E_UNBOUND_SECRET_GRANT: "the Workload's env files, over the composed union",
  E_UNAUTHORISED_SECRET_REFERENCE:
    "the Workload's env files, over the composed union",
  E_ROLL_AFFECTS_OTHER_READERS: "the composed union's reader sets per path",
  E_RAW_SECRET: "the Workload's env files and Assets",
  E_SECRETS_AT_REST_REQUIRED: "the pinned Platform document",
  E_PLACEMENT_UNSATISFIABLE: "the pinned node contract",
  E_STORAGE_UNSATISFIABLE: "the pinned node contract",
  E_DISK_BINDING_CONFLICT: "the pinned ClusterState snapshot",
  E_HARDENING_UNMET: "the images lock's resolved uid and gid",
  E_IMAGE_USER_NOT_NUMERIC: "the images lock, when it is built",
  E_FLOATING_IMAGE: "the rendered Deliverable set",
};
