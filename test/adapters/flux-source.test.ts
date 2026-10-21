// REQ-051 (docs/requirements.md): a pin source names its artifact by digest,
// says whose keyless signature it accepts, and applies each Reconcile Unit's
// path after the units it follows (spec/v1/55-delivery.md#rendered-artifacts-and-pins).
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import {
  CLAIM_HEALTH,
  ESTATE_SOURCE,
  FORCE_ANNOTATION,
  RECREATE_DEPLOYMENTS,
  renderPinSource,
  sourceOf,
  UNPUBLISHED,
  VERSION_LABEL,
  versionPatches,
} from "../../src/adapters/flux/source.ts";
import type { OciRepository } from "../../src/objects/custom.ts";

const FLUX = {
  namespace: "flux-system",
  repository: "ghcr.io/jorisjonkers-dev/render",
  signer: {
    issuer: "https://token.actions.githubusercontent.com",
    subject:
      "https://github.com/JorisJonkers-dev/estate/.github/workflows/compose.yml@refs/heads/main",
  },
};
const LABELS = { "app.kubernetes.io/managed-by": "deploy-kit" };

describe("a pin source", () => {
  const [repository, first, second] = renderPinSource(
    sourceOf("notes"),
    "notes",
    [
      { name: "apps-notes", path: "apps/notes", after: [] },
      {
        name: "apps-notes-late",
        path: "apps/notes/late",
        after: ["apps-data", "estate-vso-secrets"],
      },
    ],
    FLUX,
  );

  it("pins the artifact by a digest that names none until it is published, and verifies it keyless", () => {
    expect(repository).toStrictEqual({
      apiVersion: "source.toolkit.fluxcd.io/v1",
      kind: "OCIRepository",
      metadata: {
        name: "project-notes",
        namespace: "flux-system",
        labels: LABELS,
      },
      spec: {
        interval: "10m",
        url: "oci://ghcr.io/jorisjonkers-dev/render/notes",
        ref: { digest: `sha256:${"0".repeat(64)}` },
        verify: {
          provider: "cosign",
          matchOIDCIdentity: [
            {
              issuer: String.raw`^https://token\.actions\.githubusercontent\.com$`,
              subject: String.raw`^https://github\.com/JorisJonkers-dev/estate/\.github/workflows/compose\.yml@refs/heads/main$`,
            },
          ],
        },
      },
    });
    expect(UNPUBLISHED).toBe(`sha256:${"0".repeat(64)}`);
  });

  /** The identity a source's repository verifies against, for one signer. */
  const identityOf = (signer: typeof FLUX.signer) => {
    const [source] = renderPinSource("estate", "_estate", [], {
      ...FLUX,
      signer,
    });
    return (source as OciRepository).spec.verify.matchOIDCIdentity[0];
  };

  it("matches the signer whole and literally: no other branch, and no character a dot would stand for", () => {
    const subject = new RegExp(identityOf(FLUX.signer)?.subject as string);

    expect(subject.test(FLUX.signer.subject)).toBe(true);
    expect(subject.test(`${FLUX.signer.subject}-other`)).toBe(false);
    expect(subject.test(`evil/${FLUX.signer.subject}`)).toBe(false);
    expect(
      subject.test(FLUX.signer.subject.replace("compose.yml", "composeXyml")),
    ).toBe(false);
  });

  it("escapes every character a pattern reads as more than itself", () => {
    expect(
      identityOf({ issuer: "a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o", subject: "s" })
        ?.issuer,
    ).toBe(String.raw`^a\.b\*c\+d\?e\^f\$g\{h\}i\(j\)k\|l\[m\]n\\o$`);
  });

  it("applies each unit's path from the pinned artifact, pruned and waited for, after the units it follows", () => {
    expect(first).toStrictEqual({
      apiVersion: "kustomize.toolkit.fluxcd.io/v1",
      kind: "Kustomization",
      metadata: {
        name: "apps-notes",
        namespace: "flux-system",
        labels: LABELS,
      },
      spec: {
        interval: "10m",
        prune: true,
        wait: true,
        healthCheckExprs: [CLAIM_HEALTH],
        sourceRef: { kind: "OCIRepository", name: "project-notes" },
        path: "./apps/notes",
      },
    });
    expect(
      (second as { spec: Record<string, unknown> }).spec["dependsOn"],
    ).toStrictEqual([{ name: "apps-data" }, { name: "estate-vso-secrets" }]);
  });

  // JorisJonkers-dev/deploy-kit#485: `local-path` binds a claim on its first
  // consumer, and a backup claim's only consumer is its nightly CronJob.
  it("counts a claim still waiting for its first consumer as healthy, and one the scheduler placed only once bound", () => {
    expect(CLAIM_HEALTH).toStrictEqual({
      apiVersion: "v1",
      kind: "PersistentVolumeClaim",
      current:
        "status.phase == 'Bound' || status.phase == 'Pending' && " +
        "!(has(metadata.annotations) && 'volume.kubernetes.io/selected-node' in metadata.annotations)",
    });
  });

  it("carries a unit's annotations on that unit alone, and none where it is given none", () => {
    const carried = { "event.toolkit.fluxcd.io/version": "1.2.0" };
    const [source, annotated, bare] = renderPinSource(
      "project-notes",
      "notes",
      [
        {
          name: "apps-notes",
          path: "apps/notes",
          after: [],
          annotations: carried,
        },
        { name: "apps-notes-late", path: "apps/notes/late", after: [] },
      ],
      FLUX,
    ) as unknown as { metadata: Record<string, unknown> }[];

    expect(annotated?.metadata).toStrictEqual({
      name: "apps-notes",
      namespace: "flux-system",
      labels: LABELS,
      annotations: carried,
    });
    expect(Object.keys(bare?.metadata ?? {})).toStrictEqual([
      "name",
      "namespace",
      "labels",
    ]);
    expect(Object.keys(source?.metadata ?? {})).toStrictEqual([
      "name",
      "namespace",
      "labels",
    ]);
  });

  it("marks every Deployment for recreation on a first delivery, in each unit, and nothing else", () => {
    const units = [
      { name: "apps-notes", path: "apps/notes", after: [] },
      { name: "apps-notes-late", path: "apps/notes/late", after: [] },
    ];
    const patchesOf = (recreate: boolean) =>
      renderPinSource("project-notes", "notes", units, FLUX, {}, recreate)
        .slice(1)
        .map(
          (unit) => (unit as { spec: Record<string, unknown> }).spec["patches"],
        );

    expect(patchesOf(true)).toStrictEqual([
      [RECREATE_DEPLOYMENTS],
      [RECREATE_DEPLOYMENTS],
    ]);
    expect(patchesOf(false)).toStrictEqual([undefined, undefined]);
    // The patch targets Deployments alone, and what it sets is Flux's own
    // policy, under the key and value Flux reads.
    expect(RECREATE_DEPLOYMENTS.target).toStrictEqual({ kind: "Deployment" });
    expect(parse(RECREATE_DEPLOYMENTS.patch)).toStrictEqual({
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: { name: "any", annotations: { [FORCE_ANNOTATION]: "Enabled" } },
    });
    expect(FORCE_ANNOTATION).toBe("kustomize.toolkit.fluxcd.io/force");
  });

  it("carries no release label: the version patches label every pod template, and travel in the artifact", () => {
    const unit = (annotations?: Record<string, string>) => ({
      name: "apps-notes",
      path: "apps/notes",
      after: [],
      ...(annotations === undefined ? {} : { annotations }),
    });
    const patchesOf = (
      annotations: Record<string, string> | undefined,
      recreate = false,
    ) =>
      (
        renderPinSource(
          "project-notes",
          "notes",
          [unit(annotations)],
          FLUX,
          {},
          recreate,
        )[1] as { spec: Record<string, unknown> }
      ).spec["patches"];
    const released = { "event.toolkit.fluxcd.io/version": "1.10" };

    // The release's label travels in the artifact, so the source never carries it.
    expect(patchesOf(released)).toBeUndefined();
    expect(patchesOf(released, true)).toStrictEqual([RECREATE_DEPLOYMENTS]);
    expect(patchesOf(undefined)).toBeUndefined();

    // Every kind with a pod template, the label quoted so 1.10 stays a string,
    // and nothing that could reach a selector.
    const [templated, cronJob] = versionPatches("1.10");
    expect(templated.target).toStrictEqual({
      kind: "Deployment|StatefulSet|DaemonSet|Job",
    });
    expect(parse(templated.patch)).toStrictEqual({
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: { name: "any" },
      spec: { template: { metadata: { labels: { [VERSION_LABEL]: "1.10" } } } },
    });
    expect(cronJob.target).toStrictEqual({ kind: "CronJob" });
    expect(parse(cronJob.patch)).toStrictEqual({
      apiVersion: "batch/v1",
      kind: "CronJob",
      metadata: { name: "any" },
      spec: {
        jobTemplate: {
          spec: {
            template: { metadata: { labels: { [VERSION_LABEL]: "1.10" } } },
          },
        },
      },
    });
    expect(VERSION_LABEL).toBe("app.kubernetes.io/version");
  });

  it("pulls a private repository with the Secret the Platform document names, and a public one with none", () => {
    const secretOf = (pullSecret?: string) =>
      (
        renderPinSource("project-notes", "notes", [], {
          ...FLUX,
          pullSecret,
        })[0] as OciRepository
      ).spec.secretRef;

    expect(secretOf("render-pull")).toStrictEqual({ name: "render-pull" });
    expect(secretOf()).toBeUndefined();
    expect(
      "secretRef" in
        (renderPinSource("s", "notes", [], FLUX)[0] as OciRepository).spec,
    ).toBe(false);
  });

  it("names the estate's own source apart from any Project's", () => {
    expect(ESTATE_SOURCE).toBe("estate");
    expect(sourceOf("estate")).toBe("project-estate");
  });

  it("pins the estate's artifact beside the Projects' repository, where an OCI name can hold it", () => {
    const urlOf = (artifact: string) =>
      (renderPinSource("s", artifact, [], FLUX)[0] as OciRepository).spec.url;

    expect(urlOf("_estate")).toBe(
      "oci://ghcr.io/jorisjonkers-dev/render-estate",
    );
    expect(urlOf("estate")).toBe(
      "oci://ghcr.io/jorisjonkers-dev/render/estate",
    );
  });
});
