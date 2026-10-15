---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-15
normative: spec/v1/17-sign-in.md#the-client-block
rests-on: ["0004", "0005"]
---

# A Client is declared on the Application in a `client` block, its paths are relative to its own host, and an authenticated host without one is refused

An Application with a sign-in declares one `client` block: a Sign-in Mode
(`native`, `gated` or `token`), what the Launcher shows, and the paths on its
own host the sign-in needs. The model derives one `Client` object from it, a
`kubernetes` Deliverable the estate's Identity Provider watches. The Client is
the only place an Application is registered for sign-in: no list in the
Identity Provider's code, no hand-written object, no row in its database.
Forward-auth now derives from the Audience and the Client together, so a native
or token host carries none, a gated host gets the Gate and a derived `/.auth/`
route, and an `authenticated` exposure with no Client is refused
([chapter 17](../../../spec/v1/17-sign-in.md#what-the-edge-derives)). This
narrows how [0023](0023-exposure-is-declared-by-audience.md) derives
forward-auth, which is rewritten to point here.

## Rests on

How an Application signs people in is a property of its image, contended by
nobody, so its author declares it; the host it signs them in on is already
declared on the exposure and is not restated
([0004](0004-contention-decides-authority.md)). The edge mechanism, the
redirect URIs and the credential path are mechanics, so they are derived
([0005](0005-derivation-is-total.md)).

**False if:** an estate Application signs people in a way none of the three
modes expresses, a Client needs a host other than one of its own exposures, or
the Release Gate's anonymous request to `protectedPath` passes for an image that
does not enforce sign-in. **Settled by:** every entry of auth-api's
`ServicePermission` enum and `ServiceRegisteredClients.kt` mapped onto exactly
one `client` block, and `E_CLIENT_OPEN` firing on a fixture that serves its
protected path anonymously.

## Why

**One app lived in four lists.** Adding an Application meant editing auth-api's
`ServicePermission` enum, its hardcoded OIDC clients, home-portal's tile list
and the CORS allowlist, and the four disagreed. A host missing from the enum was
open to every signed-in person, which is how Overleaf shipped. Declaring the
Client once, next to the exposure, removes three of the lists and generates the
fourth.

**Audience stays a separate word.** Audience says who may reach a host; the
Sign-in Mode says how the Application signs them in. Folding them into new
audience values would put *how* back into a vocabulary this register spent
[0023](0023-exposure-is-declared-by-audience.md) separating from it.

**Paths, not URLs.** The host is authored once on the exposure. An icon URL or a
redirect URL would state it a second time, and the copy is the one that goes
stale when a host moves. Every path in the block resolves against the named
exposure's host.

**A native Client proves itself at release.** A native host carries no
forward-auth, so an image that does not actually enforce sign-in would be
public. The model cannot see inside an image, so the Release Gate requests the
declared `protectedPath` anonymously and holds the release on a 2xx.

**The block is called `client`, not `identity`.** Identity already names what a
Process authenticates as to the cluster and the Secret Store
([0031](0031-identity-per-process.md)). Client is the OAuth word, and the
Identity Provider's own name for the same thing.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep the lists in the Identity Provider's code | nothing to specify | every new Application changes the auth service, and a forgotten entry fails open |
| Hand-written `Client` objects beside the render | no model change | a second source that drifts from the exposure it describes |
| Clients registered in the Identity Provider's portal | no GitOps change | unreviewed, and invisible to the edge it configures |
| New Audience values such as `sso-native` | one field | mixes who with how, which 0023 separated |
| Full URLs for icon and redirects | no resolution rule | restates the host, and the restatement drifts |

## Reversibility

Undo cost today: one schema block, one derivation rule and nine codes, none yet
implemented: a day. Becomes irreversible once: Applications across repositories
declare `client` and the Identity Provider reads only Client objects.

## Consequences

- Adding a sign-in is one block in the Application's own project file, paid by
  its author.
- Every `authenticated` exposure needs a Client before
  `E_AUTHENTICATED_WITHOUT_CLIENT` is enforced, so each project is migrated
  before the rule turns on.
- A native Application must name a path that refuses anonymous requests. An
  Application with no such path is gated instead.
- The CORS allowlist and the Launcher are generated from Clients and cannot
  forget a host.
