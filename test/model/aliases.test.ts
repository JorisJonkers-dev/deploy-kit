// The alias an edge derives (spec/v1/16-dependencies.md#the-alias): its name,
// and when a consumer dials a provider without one.
import { describe, expect, it } from "vitest";
import { aliasNameOf, reachOf } from "../../src/model/aliases.ts";

const SMTP = { application: "stalwart", surface: "smtp" };
const IMAP = { application: "stalwart", surface: "imap" };

describe("an alias's name", () => {
  it("is the Application Id where the project names one surface of it", () => {
    expect(
      aliasNameOf(SMTP, [SMTP, { application: "relay", surface: "imap" }]),
    ).toBe("stalwart");
  });

  it("carries the surface where the project names several, since a name has no port", () => {
    expect(aliasNameOf(SMTP, [SMTP, IMAP, SMTP])).toBe("stalwart-smtp");
    expect(aliasNameOf(IMAP, [SMTP, IMAP])).toBe("stalwart-imap");
  });
});

describe("what a consumer dials", () => {
  it("is the alias for a provider in another namespace, pointing at where it serves", () => {
    expect(
      reachOf(
        SMTP,
        { host: "stalwart.mail-system.svc.cluster.local", port: 25 },
        "auth",
        [SMTP],
      ),
    ).toStrictEqual({
      address: "stalwart:25",
      target: "stalwart.mail-system.svc.cluster.local",
    });
  });

  it("is the provider's own Service name in the consumer's namespace, with no alias", () => {
    expect(
      reachOf(
        SMTP,
        { host: "mail-relay.auth-system.svc.cluster.local", port: 25 },
        "auth",
        [SMTP],
      ),
    ).toStrictEqual({ address: "mail-relay:25" });
  });

  it.each(["10.0.0.12", "fd00::12"])(
    "is an IP as it stands, which no alias can name: %s",
    (host) => {
      expect(reachOf(SMTP, { host, port: 25 }, "auth", [SMTP])).toStrictEqual({
        address: `${host}:25`,
      });
    },
  );

  it("is the alias for a host name that only starts with digits, which is no IP", () => {
    expect(
      reachOf(SMTP, { host: "1password.example.com", port: 25 }, "auth", [
        SMTP,
      ]),
    ).toStrictEqual({
      address: "stalwart:25",
      target: "1password.example.com",
    });
  });
});
