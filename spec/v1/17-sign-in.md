# Chapter 17: Sign-in

Chapter 10 defined how an Application is reached: an exposure, its host and its
Audience. This chapter defines how a person or a program **signs in** to what is
reached there. An Application with a sign-in declares a `client` block, the
model derives a **Client** from it, and the estate's Identity Provider reads that
Client instead of a list kept in its own code
([0100](../../docs/adr/model/0100-a-client-is-declared-on-the-application.md)).

Audience still says *who may reach* a host. The `client` block says *how the
Application signs them in*. The two stay separate fields because they answer
different questions, and the edge derives from both.

## The client block

```yaml
applications:
  - id: grafana
    exposure:
      - name: public
        host: grafana.jorisjonkers.dev
        audience: authenticated
        routes:
          - {path: /, match: prefix, process: grafana, surface: http}
    client:
      signIn: native
      label: Grafana
      description: Metrics and dashboards
      iconPath: /public/img/grafana_icon.svg
      redirectPaths: [/login/generic_oauth]
      protectedPath: /api/user
      credential: secret
      roles: [viewer, editor, admin]
```

An Application declares at most one `client`. Every path in it is a path on the
host of the exposure the Client names, so the host is authored once, on the
exposure, and never restated
([0023](../../docs/adr/model/0023-exposure-is-declared-by-audience.md)).

| field | modes | required | notes |
|---|---|---|---|
| `signIn` | all | yes | `native` \| `gated` \| `token`. The Sign-in Mode: see [Sign-in Mode](#sign-in-mode). |
| `exposure` | all | no | The `name` of one exposure of this Application. Optional when the Application declares exactly one exposure; required otherwise, `E_CLIENT_EXPOSURE_UNRESOLVED`. |
| `label` | `native`, `gated` | yes | What a person sees for this Client in the Launcher. |
| `description` | `native`, `gated` | no | One line under the label. |
| `iconPath` | `native`, `gated` | no | The icon's path on the Client's host. The Identity Provider fetches it, caches it and serves it from its own origin. Without one, the Launcher draws the label's first letter. |
| `launchPath` | `native`, `gated` | no | Where the Launcher sends a person. Defaults to `/`. |
| `redirectPaths` | `native` | yes | One or more paths on the Client's host that receive the authorization code. |
| `protectedPath` | `native` | yes | A path the Application must refuse to an anonymous request. The Release Gate requests it before switching ([What is checked](#what-is-checked)). |
| `backChannelLogoutPath` | `native` | no | A path on the Client's host that takes an OpenID Connect back-channel logout token. When a session ends, the Identity Provider posts one to every native Client the session signed into that declares it, so the Application can end its own session too ([0140](../../docs/adr/model/0140-a-native-client-may-name-a-back-channel-logout-path.md)). Without one, the Application's session runs until it expires. |
| `credential` | `native` | yes | `secret` \| `pkce`. `secret` derives a client secret ([Credentials](#credentials-and-placeholders)); `pkce` is a public client with no secret. |
| `roles` | all | no | The App Roles this Client declares beyond `user`, which every Client has. Lower-case names; `E_DUPLICATE_APP_ROLE` for a repeat or for `user` stated. |

Every path field uses the route path grammar of
[chapter 10](10-project-intent.md#exposure): `/`, or segments of URL path
characters each opened by one `/`.

A field outside its modes is `E_CLIENT_FIELD_FOR_MODE`, and so is a required
field missing for the mode declared. A `gated` Client with `redirectPaths` has
no code to receive, and a `token` Client with a `label` has no tile to show.

## Sign-in Mode

**`native`**: the Application speaks OIDC itself. It is its own client of the
Identity Provider, runs the authorization code flow, and enforces sign-in on
its own routes.

**`gated`**: the Application cannot speak OIDC. The Identity Provider's Gate
signs a person in on its behalf, once per host, and checks every request at the
edge.

**`token`**: no browser. Requests carry a bearer token the Identity Provider
issued, and the Application checks it against the Issuer's published keys.

```yaml
# gated: no OIDC in the app
client:
  signIn: gated
  label: Sonarr
  iconPath: /favicon.ico

# token: bearer only
client:
  signIn: token
  roles: [writer]
```

A Client's exposure must carry an Audience its mode can serve, or
`E_CLIENT_AUDIENCE`:

| mode | exposure audience |
|---|---|
| `native` | `authenticated` |
| `gated` | `authenticated` |
| `token` | `authenticated` or `internal` |

## What the edge derives

Forward-auth used to follow from the Audience alone. It now follows from the
Audience **and** the Client:

| exposure audience | Client | forward-auth | added route |
|---|---|---|---|
| `authenticated` | `gated` | the tier's `forwardAuth` endpoint, on every route | `/.auth/` (prefix) to the Process the tier's `forwardAuth` provider names |
| `authenticated` | `native` | none: the Application enforces sign-in | none |
| `authenticated` | `token` | none: the Application checks the bearer token | none |
| `authenticated` | no `client` | refused: `E_AUTHENTICATED_WITHOUT_CLIENT`; until it is enforced, the tier's `forwardAuth` endpoint, from the audience alone | none |
| `internal` | `token` | none | none |

**The transitional rule.** Four live Projects still serve `authenticated`
exposures that no Client names, so `E_AUTHENTICATED_WITHOUT_CLIENT` is not yet
enforced: until each of them declares a `client`, such an exposure keeps the
forward-auth its audience alone derived before this chapter, and so does an
`authenticated` exposure of an Application whose Client names another of its
exposures.

The derived `/.auth/` route is served by the Process the tier's `forwardAuth`
provider names, at its Service, in its namespace and on its port
([chapter 20](20-resolved-deployment.md#the-forward-auth-endpoint)), with the
exposure's security headers and no forward-auth of its own: the Gate answers
there itself, so nothing asks it first. Its precedence is ranked with the
exposure's own routes, as a `prefix` route of its length.

**Why a native or token host carries no forward-auth.** A forward-auth check in
front of a native Application would intercept its own callback, and in front of
a token Application it would ask for a session a program does not have. Each
enforces sign-in itself, and the Release Gate proves that a native Application
does ([What is checked](#what-is-checked)).

**Why `/.auth/` is derived.** The Gate keeps a separate sign-in per host in a
host-only cookie, and a cookie can only be set on its own host. The code must
therefore come back to the gated host itself. The route is derived, not
authored, because no author writes a route to another Application's Process. A
gated Application's own route under `/.auth/` is `E_GATE_PATH_CLAIMED`.

**Why an authenticated host needs a Client.** The Identity Provider refuses a
host it holds no Client for. The model refuses the same exposure first, at
composition, so the failure is a diagnostic in a pull request instead of a 403
at the edge on a route nobody tested.

A route's own `audience: anonymous` is unchanged: it takes that path out of the
Client's sign-in, for a native and a gated Client alike.

## The Client

The model derives one Client per Application that declares `client`. It is a
Deliverable of the `kubernetes` adapter
([chapter 30](30-deliverables.md#adapters)): a cluster-scoped object of kind
`Client` in `identity.jorisjonkers.dev/v1`, named by the Application Id, in the
Application's own `client.yaml`, which the Application's index lists
([chapter 30](30-deliverables.md#path-allocation)). A cluster applies one only
once the Client kind exists, so a Platform document whose bootstrap set does
not list `identity.jorisjonkers.dev/v1` beside an Application declaring
`client` is `E_CLIENT_CRD_NOT_BOOTSTRAPPED`
([chapter 14](14-platform-intent.md#the-bootstrap-set)), rather than a render
Flux cannot apply.

| Client field | derived from |
|---|---|
| `signIn` | `client.signIn` |
| `host` | the named exposure's `host` |
| `launchUrl` | `https://` + host + `launchPath`, for a `native` or `gated` Client; a `token` Client has no tile to launch |
| `iconUrl` | `https://` + host + `iconPath`, when declared |
| `redirectUris` | `https://` + host + each of `redirectPaths` |
| `backChannelLogoutUri` | `https://` + host + `backChannelLogoutPath`, when declared |
| `credential` | `client.credential` |
| `secretPath` | the derived credential path, for `credential: secret` |
| `roles` | `user`, then `roles` in the order declared |
| `label`, `description` | as declared |

The Identity Provider watches Client objects and holds them in memory. Nothing
else creates one: the platform admits writes to the kind only from the render's
applier, so a Client exists exactly when an Application declares it. Deleting an
Application deletes its Client, and the Identity Provider keeps that Client's
access records, disabled, until the Client returns or is purged by hand.

## Credentials and placeholders

`credential: secret` derives a Secret Store path in the Application's own
namespace subtree:

```text
secret/data/<namespace>/<application>/client     keys: id, secret
```

The sign-in provider's Process is granted write on that path, so the Identity
Provider creates and rotates the secret: each Process of the provider
Application holds `create`, `read` and `update` on every client credential of
the composed union, read by the Process itself, in path order. Every Process of
the Application that references the credential is granted `read` on it, derived,
never authored, and delivered as a `${secret:…}` reference's grant is: synced to
a Secret named for the Process and the path, which restarts the Process when the
provider rotates it. A Client that holds a secret beside a Platform document
naming no Secret Store is `E_NO_SECRET_STORE`, as any grant is
([chapter 14](14-platform-intent.md#the-secret-store)).

A Process reads the credential through a fourth placeholder source, beside the
three of [chapter 10](10-project-intent.md#placeholder-sources):

| placeholder | resolves to |
|---|---|
| `${client:issuer}` | the Issuer URL from the Platform document's `signIn` |
| `${client:id}` | the Client id, which is the Application Id |
| `${client:secret}` | the client secret at the derived path, delivered as `${secret:…}` would be |

`${client:secret}` in an Application whose Client is not `credential: secret`
is `E_CLIENT_PLACEHOLDER_WITHOUT_SECRET`. `${client:issuer}` and `${client:id}`
resolve for every mode.

**No Vault token is delivered.** A client secret, like every secret, reaches a
Process through the Vault Secrets Operator or through the Process's own client
([chapter 10](10-project-intent.md#delivery)). An Application that talks to
Vault itself takes the `self` path and logs in with its ServiceAccount; no
delivery hands a Process a token to log in with.

## The platform's part

The Platform document names who issues sign-ins
([chapter 14](14-platform-intent.md#sign-in)): the Issuer URL and the Application
that is the sign-in provider. An Application declaring `client` while the
Platform document names no sign-in provider is `E_NO_SIGN_IN_PROVIDER`.

The tier's `forwardAuth` keeps its meaning and its place
([chapter 20](20-resolved-deployment.md#the-forward-auth-endpoint)). It names the
Gate: the sign-in provider, its surface and the Gate's path, and is required where a tier
carries a `gated` Client.

## Generated App Roles

An application checks the App Roles its Client declares, so it names them in
its own code. `deploy-kit generate identity` writes that code from the
project file, so a role is written once and a renamed or removed one breaks the
application's build until its code follows:

```
deploy-kit generate identity <file|directory>... --lang <go|kotlin|typescript|python|rust>
                    [--application <id>] [--package <name>] [--out <file> [--check]]
```

It reads the project file and the Platform document, each checked on its own as
`validate` checks it, and never the estate: an application's repository holds
its own project file, and no other Project needs to be present. The file it
writes for the one Application that declares `client` (or the one
`--application` names) states three things, each a plain string, so it depends
on no adapter library:

| states | from |
|---|---|
| the App Roles | `user`, then `client.roles` in the order declared: the Client's own `roles` ([The Client](#the-client)) |
| the Client id | the Application Id, which names the Client |
| the contract version | the Platform document's `signIn.contract` ([chapter 14](14-platform-intent.md#sign-in)), `major.minor`: the Principal contract version the application expects |

| `--lang` | the file |
|---|---|
| `go` | `package identity`: `ClientID`, `ContractVersion`, a `Role` string type with one `Role<Name>` constant a role, and `Roles` |
| `kotlin` | the package `--package` names, which a Kotlin file cannot do without: `CLIENT_ID`, `CONTRACT_VERSION` and `enum class AppRole(val value: String)` |
| `typescript` | a module: `CLIENT_ID`, `CONTRACT_VERSION`, `APP_ROLES` as a constant tuple, and the `AppRole` type it spells |
| `python` | a module: `CLIENT_ID`, `CONTRACT_VERSION` and `class AppRole(str, Enum)` |
| `rust` | a module: `CLIENT_ID`, `CONTRACT_VERSION`, and `enum AppRole` with `ALL` and `as_str` |

A role keeps its spelling as each value, and is named in the language's case:
`release-manager` is `RoleReleaseManager` in Go, `ReleaseManager` in Rust, and
`RELEASE_MANAGER` in Kotlin and Python. Two roles that one case spells alike
(`a-b` and `a--b`), and a role Rust cannot name (`self`), get no file in that
language. Each file is laid out as its language's formatter would lay it out
(gofmt, prettier, black, rustfmt), so a formatter check in the application
leaves it alone.

Without `--out` the file goes to stdout. With `--out` it is written there, and
with `--check` as well nothing is written: the command fails where the file at
`--out` is missing or differs from what it would write, which is how an
application's CI fails on a stale file. A project file that declares no
`client`, a Platform document that names no `contract`, and a set in which
several Applications declare one and `--application` names none each get no
file and a message saying why; a document that does not check is refused with
its diagnostics. The worked
[observability](examples/observability/observability.project.yml) example's
`grafana` is written in every language under
[`examples/observability/generated/`](examples/observability/generated/).

## What is checked

| code | refused when | where |
|---|---|---|
| `E_CLIENT_EXPOSURE_UNRESOLVED` | `client.exposure` names no exposure of the Application, or is omitted while it declares more than one | composition |
| `E_CLIENT_FIELD_FOR_MODE` | a field is set outside its modes, or a field its mode requires is missing | composition |
| `E_CLIENT_AUDIENCE` | the named exposure's audience is not one the mode serves | composition |
| `E_DUPLICATE_APP_ROLE` | a role is listed twice, or `user` is listed | composition |
| `E_GATE_PATH_CLAIMED` | a gated Application declares a route under `/.auth/` | composition |
| `E_AUTHENTICATED_WITHOUT_CLIENT` | an exposure is `authenticated` and its Application declares no `client` | composition, once enforced ([the transitional rule](#what-the-edge-derives)) |
| `E_CLIENT_CRD_NOT_BOOTSTRAPPED` | an Application declares `client` and the Platform document's bootstrap set does not list `identity.jorisjonkers.dev/v1` | composition |
| `E_NO_SIGN_IN_PROVIDER` | an Application declares `client` and the Platform document names no sign-in provider | composition |
| `E_CLIENT_PLACEHOLDER_WITHOUT_SECRET` | `${client:secret}` is referenced and the Client is not `credential: secret` | composition |
| `E_CLIENT_PATH_UNROUTED` | no Route of a native Client's exposure reaches its `protectedPath`, or the Route that does reaches a Process that publishes no readiness | composition |
| `E_CLIENT_OPEN` | the Release Gate's anonymous request to a native Client's `protectedPath` is answered with 2xx | release ([chapter 55](55-delivery.md#the-release-gate)) |

`E_CLIENT_OPEN` is the proof a native Client owes: the model cannot see whether
an image enforces sign-in, so the release asks it. A native Application that
serves its protected path to anyone never receives traffic. The model's half is
the input: a native Client's Application carries its `protectedPath` in its
release-gate inputs ([chapter 20](20-resolved-deployment.md#the-release-gate)),
and the Release Gate requests it, anonymously, before it switches
([chapter 55](55-delivery.md#the-release-gate)).

**The path is asked of the member the edge would send it to.** Of the Routes of
the Client's exposure that reach a Process, the one whose path is the longest
match takes it: a `prefix` Route matches a path it opens, an `exact` one the
path itself, and a redirect Route reaches no Process. A tie goes to the Route
declared first. That Process is the inputs' `protectedBy`. Asking another
member would prove nothing, and a static member that answers every path with
its index page would hold every release. So the path must reach a gate member:
a Route must take it to a Process, and that Process must publish readiness.
Otherwise the Client is refused, `E_CLIENT_PATH_UNROUTED`.

## Open in this chapter

- **Clients that are not Applications.** A tool that registers itself at
  runtime (an MCP client) acts for one person on one Client and is held by the
  Identity Provider, not by the model. Nothing here declares it.
- **Mail protocols.** IMAP and SMTP clients cannot follow an OIDC sign-in.
  Whether the Identity Provider issues them app passwords is the Identity
  Provider's decision, not a field of the `client` block.
