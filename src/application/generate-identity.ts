// `deploy-kit generate identity` (spec/v1/17-sign-in.md#generated-app-roles):
// the Platform document and each project file are checked on their own, as an
// application's repository holds them, never as an estate whose every
// Application must be present; the one Application that declares a client is
// written in the asked language, with the Principal contract version the
// Platform document's sign-in provider serves.
import {
  generateIdentity,
  type IdentityLanguage,
} from "../generate/identity.ts";
import type { Diagnostic, Result } from "../model/diagnostic.ts";
import type { EffectiveProject } from "../model/effective-intent.ts";
import type { AuthoredFile } from "./check-intent-set.ts";
import { parsePlatformIntent } from "./parse-platform-intent.ts";
import { parseProjectIntent } from "./parse-project-intent.ts";

type Parsed<R> = Extract<R, { readonly ok: true }>;

const PLATFORM = "platform.intent.yml";
const PROJECT = ".project.yml";

export interface IdentityRequest {
  readonly language: IdentityLanguage;
  /** The Application to write, where more than one declares a client. */
  readonly application?: string | undefined;
  /** A Kotlin file's package. */
  readonly package?: string | undefined;
}

/** The file, or the diagnostics that refused the set, or why nothing can be written. */
export type IdentityOutcome =
  | { readonly kind: "written"; readonly text: string }
  | { readonly kind: "refused"; readonly diagnostics: readonly Diagnostic[] }
  | { readonly kind: "unwritable"; readonly message: string };

/** An Application that declares a client, with it. */
interface Chosen {
  readonly id: string;
  readonly client: NonNullable<
    EffectiveProject["applications"][number]["client"]
  >;
}

const unwritable = (message: string): IdentityOutcome => ({
  kind: "unwritable",
  message,
});

export function generateIdentityFile(
  files: readonly AuthoredFile[],
  request: IdentityRequest,
): IdentityOutcome {
  const read = <T>(
    suffix: string,
    parse: (text: string) => Result<T>,
  ): { readonly name: string; readonly result: Result<T> }[] =>
    files
      .filter(({ name }) => name.endsWith(suffix))
      .map(({ name, text }) => ({ name, result: parse(text) }));
  const platformsRead = read(PLATFORM, (text) => parsePlatformIntent(text));
  const projectsRead = read(PROJECT, (text) => parseProjectIntent(text));
  const refusals = [...platformsRead, ...projectsRead].flatMap(
    ({ name, result }) =>
      result.ok
        ? []
        : result.diagnostics.map((diagnostic) => ({
            ...diagnostic,
            document: name,
          })),
  );
  if (refusals.length > 0) return { kind: "refused", diagnostics: refusals };
  // With no refusal, every document parsed.
  const platforms = platformsRead.map(
    ({ result }) => (result as Parsed<typeof result>).value.document,
  );
  const projects = projectsRead.map(
    ({ result }) => (result as Parsed<typeof result>).value.effective,
  );
  if (platforms.length > 1)
    return unwritable(
      "generate identity reads one Platform document, and was given several",
    );
  const [platform] = platforms;
  const contract = platform?.signIn?.contract;
  if (contract === undefined)
    return unwritable(
      platform === undefined
        ? "generate identity needs the Platform document, whose sign-in provider names the Principal contract version"
        : "the Platform document's sign-in provider names no contract version: set signIn.contract",
    );
  const clients: Chosen[] = projects.flatMap(({ applications }) =>
    applications.flatMap(({ id, client }) =>
      client === undefined ? [] : [{ id, client }],
    ),
  );
  const chosen =
    request.application === undefined
      ? clients
      : clients.filter(({ id }) => id === request.application);
  if (chosen.length === 0)
    return unwritable(
      request.application === undefined
        ? "no Application declares a client, so there are no App Roles to generate"
        : `${request.application} declares no client, so there are no App Roles to generate`,
    );
  const [only, ...others] = chosen as [Chosen, ...Chosen[]];
  if (others.length > 0)
    return unwritable(
      `${chosen.map(({ id }) => id).join(", ")} each declare a client: name one with --application`,
    );
  const written = generateIdentity(
    {
      client: only.id,
      // A role is listed once, and never `user`, or E_DUPLICATE_APP_ROLE
      // refused the set.
      roles: ["user", ...(only.client.roles ?? [])],
      contract,
    },
    request.language,
    { package: request.package },
  );
  return typeof written === "string"
    ? { kind: "written", text: written }
    : unwritable(written.message);
}
