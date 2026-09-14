// The mapper: the authoring shape into the domain model.
//
// "The inferred type is **not** the domain model. An explicit mapper per
// document family converts the authoring shape into domain objects, and the
// domain imports no Zod" (docs/architecture.md#the-wire-boundary). This is that
// mapper for Service Intent, and it is total: it is only ever handed a value
// the schema has already accepted, so it decides nothing and refuses nothing.
// Every judgement is in schema.ts or in the rule registry, and none is here.
//
// Its one real job besides shape is **addressing**: every domain node comes out
// carrying `at`, its document path, built on the way down. That is what lets a
// rule report where a defect is without walking the document a second time.
import { at, child } from "../../domain/diagnostic.ts";
import type {
  Asset,
  Capacity,
  DependencyEdge,
  DiskRequest,
  Domain,
  Exposure,
  GpuRequest,
  Grant,
  Observability,
  Placement,
  Probe,
  Probes,
  Route,
  Scrape,
  Service,
  Sidecar,
  Surface,
  Volume,
  Workload,
} from "../../domain/service-intent/model.ts";
import type {
  DomainOutput,
  GrantOutput,
  ProbeOutput,
  ServiceOutput,
  WorkloadOutput,
} from "./schema.ts";

/** Drop the keys whose value is `undefined`, which `exactOptionalPropertyTypes` forbids. */
function some<T>(key: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : { [key]: value };
}

function mapProbe(wire: ProbeOutput, path: string): Probe {
  return "tcp" in wire
    ? { at: path, kind: "tcp", tcp: wire.tcp }
    : { at: path, kind: "http", path: wire.path, port: wire.port };
}

function mapProbes(wire: WorkloadOutput["probes"], path: string): Probes {
  if (wire === "none") return { kind: "none" };
  return {
    kind: "declared",
    ...some(
      "readiness",
      wire.readiness && mapProbe(wire.readiness, child(path, "readiness")),
    ),
    ...some(
      "liveness",
      wire.liveness && mapProbe(wire.liveness, child(path, "liveness")),
    ),
  };
}

function mapGrant(wire: GrantOutput, path: string): Grant {
  const common = {
    at: path,
    delivery: wire.delivery,
    rotation: {
      at: child(path, "rotation"),
      tolerates: wire.rotation.tolerates,
      ...some("maxAge", wire.rotation.maxAge),
    },
  };
  if (wire.engine === "transit")
    return {
      ...common,
      engine: "transit",
      key: wire.key,
      operations: wire.operations,
    };
  const projected = {
    ...some("mountAt", wire.mountAt),
    ...some("fileMode", wire.fileMode),
  };
  if (wire.engine === "database")
    return { ...common, engine: "database", role: wire.role, ...projected };
  return {
    ...common,
    engine: "kv",
    path: wire.path,
    keys: wire.keys,
    access: wire.access,
    ...projected,
  };
}

/**
 * `provides` is a map in the file and a list of Surfaces here. A surface is a
 * class with a name and a port, and a route resolves against one; the map is
 * only the shortest way to write it.
 */
function mapSurfaces(
  provides: WorkloadOutput["provides"],
  path: string,
): Surface[] {
  return Object.entries(provides ?? {}).map(([name, port]) => ({
    at: child(path, name),
    name,
    port,
  }));
}

function mapPlacement(
  wire: WorkloadOutput["placement"],
  path: string,
): Placement {
  const disk: DiskRequest | undefined = wire.disk && {
    at: child(path, "disk"),
    media: wire.disk.media,
  };
  const gpu: GpuRequest | undefined = wire.gpu && {
    at: child(path, "gpu"),
    class: wire.gpu.class,
    memory: wire.gpu.memory,
  };
  return {
    at: path,
    memory: wire.memory,
    cpu: wire.cpu,
    ...some("arch", wire.arch),
    ...some("site", wire.site),
    ...some("disk", disk),
    ...some("gpu", gpu),
    ...some("capabilities", wire.capabilities),
  };
}

function mapWorkload(wire: WorkloadOutput, path: string): Workload {
  const list = <W, D>(
    key: string,
    values: readonly W[] | undefined,
    each: (value: W, itemPath: string) => D,
  ): D[] =>
    (values ?? []).map((value, index) =>
      each(value, at(child(path, key), index)),
    );

  const sidecars: Sidecar[] = list("sidecars", wire.sidecars, (s, p) => ({
    at: p,
    name: s.name,
    image: s.image,
    memory: s.memory,
    cpu: s.cpu,
  }));
  const dependsOn: DependencyEdge[] = list(
    "dependsOn",
    wire.dependsOn,
    (edge, p) => ({
      at: p,
      service: edge.service,
      surface: edge.surface,
      required: edge.required,
    }),
  );
  const assets: Asset[] = list("assets", wire.assets, (asset, p) => ({
    at: p,
    from: asset.from,
    mountAt: asset.mountAt,
  }));
  const volumes: Volume[] = list("volumes", wire.volumes, (volume, p) => ({
    at: p,
    claim: volume.claim,
    mountAt: volume.mountAt,
    size: volume.size,
    durability: volume.durability,
  }));
  const replicas: Capacity | undefined = wire.replicas && {
    at: child(path, "replicas"),
    count: wire.replicas.count,
    reason: wire.replicas.reason,
  };

  return {
    at: path,
    name: wire.name,
    lifecycle: wire.lifecycle,
    image: wire.image,
    runtime: wire.runtime,
    ...some("engine", wire.engine),
    startupBudget: wire.startupBudget,
    cutover: wire.cutover,
    writablePaths: wire.writablePaths ?? [],
    provides: mapSurfaces(wire.provides, child(path, "provides")),
    sidecars,
    dependsOn,
    probes: mapProbes(wire.probes, child(path, "probes")),
    assets,
    volumes,
    placement: mapPlacement(wire.placement, child(path, "placement")),
    ...some("replicas", replicas),
    secrets: list("secrets", wire.secrets, mapGrant),
  };
}

function mapService(wire: ServiceOutput, path: string): Service {
  const scrape: Scrape | undefined = wire.observability?.scrape && {
    at: child(child(path, "observability"), "scrape"),
    workload: wire.observability.scrape.workload,
    surface: wire.observability.scrape.surface,
    path: wire.observability.scrape.path,
  };
  const observability: Observability | undefined = wire.observability && {
    at: child(path, "observability"),
    alertClass: wire.observability.alertClass,
    ...some("scrape", scrape),
  };
  const exposure: Exposure[] = (wire.exposure ?? []).map((entry, index) => {
    const entryPath = at(child(path, "exposure"), index);
    const routes: Route[] = entry.routes.map((route, i) => ({
      at: at(child(entryPath, "routes"), i),
      path: route.path,
      match: route.match,
      workload: route.workload,
      surface: route.surface,
      ...some("audience", route.audience),
      ...some("redirectTo", route.redirectTo),
    }));
    return {
      at: entryPath,
      name: entry.name,
      host: entry.host,
      audience: entry.audience,
      ...some("contentPolicy", entry.contentPolicy),
      routes,
    };
  });

  return {
    at: path,
    id: wire.id,
    ...some("observability", observability),
    exposure,
    workloads: wire.workloads.map((workload, index) =>
      mapWorkload(workload, at(child(path, "workloads"), index)),
    ),
    secrets: (wire.secrets ?? []).map((grant, index) =>
      mapGrant(grant, at(child(path, "secrets"), index)),
    ),
  };
}

/** One validated authoring document, as the domain model. */
export function mapDomain(wire: DomainOutput): Domain {
  return {
    at: "",
    schemaVersion: wire.schemaVersion,
    domain: wire.domain,
    owner: wire.owner,
    services: wire.services.map((service, index) =>
      mapService(service, at("services", index)),
    ),
  };
}
