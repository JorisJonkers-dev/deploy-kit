# Clients and sign-in

A behaviour of sign-in: a tier's forward-auth, Clients and their Sign-in Modes, and the Identity file `deploy-kit generate identity` writes.

| id | a contributor or a consumer can rely on | proved by |
|---|---|---|
| REQ-090 | A tier's forward-auth names a provider Application, a surface and a path rather than a URL; the edge's `forward-auth` Middleware and the Gate's own route take the address of the Process that provides the surface, and a provider whose Project the set holds but which declares no such surface is `E_UNKNOWN_FORWARD_AUTH_PROVIDER`, because the address must follow the provider | [test/model/render.test.ts](../../test/model/render.test.ts) |
| REQ-103 | `deploy-kit generate identity` writes an Application's App Roles, Client id and Principal contract version in Go, Kotlin, TypeScript, Python and Rust, byte for byte the worked example's committed files, from its project file and the Platform document alone; `--check` fails a stale or missing file, and a project with no `client`, a platform with no `contract`, or a call naming no one Application gets no file and a message saying why | [test/cli/generate-identity.test.ts](../../test/cli/generate-identity.test.ts) |
| REQ-151 | A `native` Client may declare `backChannelLogoutPath`, a path on its exposure's host, which resolves to `backChannelLogoutUri` (`https://`, the host and the path) and renders on the `Client` object after its `redirectUris`; the same field on a `gated` or `token` Client is `E_CLIENT_FIELD_FOR_MODE` at the field | [test/model/sign-in.test.ts](../../test/model/sign-in.test.ts) |
