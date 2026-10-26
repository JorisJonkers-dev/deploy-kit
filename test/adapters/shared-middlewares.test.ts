// REQ-090 (docs/requirements.md): a namespace's forward-auth Middleware asks
// the provider its own tier names, never another namespace's.
import { describe, expect, it } from "vitest";
import { renderSharedMiddlewares } from "../../src/adapters/traefik/shared-middlewares.ts";

const names = (deliverables: ReturnType<typeof renderSharedMiddlewares>) =>
  deliverables.map(({ path, objects }) => [
    path,
    objects.map(
      (object) => (object as { metadata: { name: string } }).metadata.name,
    ),
  ]);

describe("the shared Middlewares of two proxies' namespaces", () => {
  it("render forward-auth only where a tier of the namespace names a provider", () => {
    expect(
      names(
        renderSharedMiddlewares(
          ["edge/traefik-public", "lan/traefik-lan"],
          ["edge", "lan"],
          [{ proxy: "edge/traefik-public", address: "http://gate/forward" }],
        ),
      ),
    ).toStrictEqual([
      [
        "apps/edge/traefik-public/middlewares.yaml",
        [
          "forward-auth",
          "security-headers",
          "security-headers-strict",
          "security-headers-admin",
          "security-headers-workflow",
        ],
      ],
      [
        "apps/lan/traefik-lan/middlewares.yaml",
        [
          "security-headers",
          "security-headers-strict",
          "security-headers-admin",
          "security-headers-workflow",
        ],
      ],
    ]);
  });
});
