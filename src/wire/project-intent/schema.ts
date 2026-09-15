// The authoring shape of a Project Intent document, schemaVersion 1. It covers
// the fields the minimal example uses; the rest of chapter 10 lands with #84.
import { z } from "zod";
import {
  ALERT_CLASSES,
  AUDIENCES,
  CONTENT_POLICIES,
  CUTOVERS,
  LIFECYCLES,
  MATCHES,
  RUNTIMES,
} from "../../domain/project-intent/vocabularies.ts";

const text = z.string().min(1);
const port = z.int().min(1).max(65535);

const surfaceRef = { process: text, surface: text };

const probe = z.strictObject({ path: text, port });

const process = z.strictObject({
  name: text,
  lifecycle: z.enum(LIFECYCLES),
  image: text,
  runtime: z.enum(RUNTIMES),
  provides: z.record(text, port).exactOptional(),
  placement: z.strictObject({ memory: text, cpu: text }),
  probes: z
    .strictObject({
      readiness: probe.exactOptional(),
      liveness: probe.exactOptional(),
    })
    .exactOptional(),
  startupBudget: text.exactOptional(),
  cutover: z.enum(CUTOVERS),
});

const exposure = z.strictObject({
  name: text,
  host: text,
  audience: z.enum(AUDIENCES),
  contentPolicy: z.enum(CONTENT_POLICIES),
  routes: z
    .array(
      z.strictObject({ path: text, match: z.enum(MATCHES), ...surfaceRef }),
    )
    .min(1),
});

const application = z.strictObject({
  id: text,
  observability: z
    .strictObject({
      alertClass: z.enum(ALERT_CLASSES),
      scrape: z.strictObject({ ...surfaceRef, path: text }),
    })
    .exactOptional(),
  exposure: z.array(exposure).exactOptional(),
  processes: z.array(process).min(1),
});

export const projectIntent = z.strictObject({
  apiVersion: z.literal("intent.jorisjonkers.dev/v1"),
  kind: z.literal("Project"),
  schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  project: text,
  owner: text,
  applications: z.array(application).min(1),
});

export type ProjectIntentDocument = z.output<typeof projectIntent>;
