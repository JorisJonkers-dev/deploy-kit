import type { Diagnostic, Result } from "../../domain/diagnostic.ts";
import type {
  DurabilityPolicy,
  Platform,
} from "../../domain/platform-intent/model.ts";
import type {
  DurabilityClass,
  Engine,
} from "../../domain/project-intent/vocabularies.ts";
import { schemaDiagnostics } from "../schema-diagnostics.ts";
import { platformIntent, type PlatformIntentDocument } from "./schema.ts";

export interface ValidatedPlatformIntent {
  readonly document: PlatformIntentDocument;
  readonly platform: Platform;
}

/** A tier carrying `authenticated` needs the endpoint that authenticates for it. */
function forwardAuthRefusals(document: PlatformIntentDocument): Diagnostic[] {
  return document.tiers.flatMap((tier, index) =>
    tier.audiences.includes("authenticated") && tier.forwardAuth === undefined
      ? [
          {
            code: "E_NO_FORWARD_AUTH_ENDPOINT",
            path: `/tiers/${index}`,
            message: `tier ${tier.name} carries authenticated and names no forwardAuth endpoint`,
            hint: "Declare the tier's `forwardAuth`, or stop carrying `authenticated` on it.",
          },
        ]
      : [],
  );
}

function toPlatform(document: PlatformIntentDocument): Platform {
  const { owner, metadata, substrate, tiers, durability, engines, hardening } =
    document;
  return {
    owner,
    cluster: metadata.cluster,
    nodeContract: metadata.nodeContract,
    substrate,
    tiers: tiers.map(({ traefik, ...tier }) => ({ ...tier, proxy: traefik })),
    durability: new Map(
      Object.entries(durability) as [DurabilityClass, DurabilityPolicy][],
    ),
    engines: new Map(
      Object.entries(engines).map(([engine, policy]) => [
        engine as Engine,
        policy.backup,
      ]),
    ),
    hardening,
    ...(document.migration === undefined
      ? {}
      : { migration: document.migration }),
    ...(document.delivery === undefined ? {} : { delivery: document.delivery }),
    providers: (document.providers ?? []).map((provider) => ({
      ...provider,
      surfaces: new Map(Object.entries(provider.surfaces)),
    })),
  };
}

export function validatePlatformIntent(
  value: unknown,
): Result<ValidatedPlatformIntent> {
  const parsed = platformIntent.safeParse(value);
  if (!parsed.success)
    return {
      ok: false,
      diagnostics: schemaDiagnostics(
        parsed.error,
        "spec/v1/14-platform-intent.md",
      ),
    };
  const refusals = forwardAuthRefusals(parsed.data);
  if (refusals.length > 0) return { ok: false, diagnostics: refusals };
  return {
    ok: true,
    value: { document: parsed.data, platform: toPlatform(parsed.data) },
  };
}
