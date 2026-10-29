---
tier: decision
status: proposed
claim: open
owner: joris
date: 2026-10-29
normative: spec/v1/17-sign-in.md#the-client-block
rests-on: ["0004", "0005"]
---

# A native Client may name a back-channel logout path on its own host, and its Client carries it as a URI

A `native` Client may declare `backChannelLogoutPath`, a path on the host of the
exposure it names that takes an OpenID Connect back-channel logout token. The
Client object carries it as `backChannelLogoutUri`, `https://`, the host and the
path, built the way `redirectUris` is built from `redirectPaths`. A `gated` or
`token` Client that declares it is refused as any field outside its mode is.
Asked in
[Client block: optional back-channel logout path for native Clients](https://github.com/JorisJonkers-dev/deploy-kit/issues/460).

## Rests on

Contention decides authority ([0004](0004-contention-decides-authority.md)):
only the Application knows whether its image ends its own session on a logout
token, so its project file says so. Derivation is total
([0005](0005-derivation-is-total.md)): the host is the exposure's, authored
once, so the URI is derived from it and never written.

**False if:** a native Application needs its logout token delivered to a host
other than its own, or a gated or token Client has a session of its own that a
logout token could end. **Settled by:** the Identity Provider posting a logout
token to the declared URI of a native Client the ended session signed into,
and the Client object for a declaring Application validating against the
`Client` kind's own rules, which accept the field on `native` alone and only as
`https://` on the Client's own host.

## Why

**Sign-out everywhere needs an address per Client.** When a session ends, by a
person signing out, an Admin's force sign-out, a password change or a new
second factor, the Identity Provider posts a logout token to every native
Client that session signed into and that declares a back-channel logout URI.
The `Client` kind already takes the field. Without it in the authoring format,
no Application can opt in, and each keeps its own session until it expires.

**A path, not a URI.** Every other path a Client names is a path on its own
host ([0100](0100-a-client-is-declared-on-the-application.md)), and the `Client`
kind refuses a logout URI on any other host. Authoring the path keeps the host
written once, on the exposure, and leaves no way to write the refused case.

**Native only, with the existing code.** A gated Application has no session of
its own: the Gate holds it, and ending the Identity Provider's session ends the
Gate's with it. A token Client has no browser session at all. So the field
belongs to the native mode's set, and a field outside its mode already has a
code, `E_CLIENT_FIELD_FOR_MODE`; a second code for one field would be a second
name for the same refusal.

**Optional.** An Application that does not implement back-channel logout keeps
its own session until it expires, as every Application does today. Requiring
the field would refuse every native Application whose image cannot take a
logout token.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Author the full `backChannelLogoutUri` | one less derivation | restates the host, and allows a host the `Client` kind refuses |
| A code of its own for the field on a gated or token Client | a more specific message | the refusal is the one every field outside its mode already gets |
| Derive a fixed path for every native Client | nothing to author | Applications receive the token at paths their own frameworks choose, and one that does not implement it would be sent tokens it cannot read |
| Require it on every native Client | sign-out reaches every native Application | refuses each native Application whose image cannot take a logout token |

## Reversibility

Easy: one optional field in the authoring format, the projection and the
render. Removing it later is a schema break for any project file that declares
it, so it becomes costly once Applications opt in.

## Consequences

- The project-intent and Resolved Deployment schemas each gain one optional
  field, and the pinned `Client` schema the manifest lint reads gains
  `backChannelLogoutUri`.
- A native Application opts in by naming one path, and its Client object
  changes, which the Identity Provider picks up from its watch without a
  restart.
- The model checks nothing about the path beyond its grammar: whether the
  Application answers there is the Identity Provider's to log, since an
  unanswered logout post is not retried and the Application's own session still
  runs out.
