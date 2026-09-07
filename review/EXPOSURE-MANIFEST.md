# Amendment — configured hostnames and routing (2026-09-07)

Binding. Overrides anything in docs/adr or spec/v1 that conflicts.

## What changed

A hostname is **configured, not derived**. It moves to the Service, carries its
routing, and every consumer references it through a placeholder instead of
repeating the literal.

## Vocabulary (exact; do not vary)

```yaml
services:
  - id: auth
    exposure:
      - name: public                    # unique within the Service
        host: auth.jorisjonkers.dev     # configured; the full FQDN
        audience: anonymous
        contentPolicy: strict           # optional: strict | admin | workflow
        routes:
          - {path: /api, match: prefix, workload: auth-api, surface: http}
          - {path: /,    match: prefix, workload: auth-ui,  surface: http}
```

Redirect, the one other authored proxy field, sits on a route:

```yaml
routes:
  - {path: /, match: exact, workload: stalwart, surface: http, redirectTo: /admin/}
```

Placeholder, third source beside `${dependency:…}` and `${secret:…}`:

```
AUTH_ISSUER=${exposure:auth.public#url}
AUTH_LOGIN_URL=${exposure:auth.public#url}/login
```

## Rules

1. **`exposure` moves from the Workload to the Service.** `provides` stays on
   the Workload. They are different facts: `provides` is *this process listens
   on this port*; `exposure` is *this hostname routes here*. One hostname
   fronting two Workloads is unexpressible at the Workload level, which is the
   case that forced the move (`auth.jorisjonkers.dev/api` → `auth-api`, `/` →
   `auth-ui`).
2. **`host` is the full FQDN, authored.** No zone derivation, no
   `<service>.<zone>` rule, no apex flag — an apex host is just
   `host: jorisjonkers.dev`. This closes chapter 00 open item 1.
3. **`name` is required and unique within the Service.** It is what
   `E_DUPLICATE_EXPOSURE_NAME` has always checked and nothing defined, and what
   the placeholder addresses. A Service with several hosts (`jellyfin` public
   and lan) needs it to disambiguate.
4. **`host` is unique across the estate**: `E_DUPLICATE_HOST` at composition,
   evaluated over the composed union together with Registered Unmanaged
   Surfaces. Authored, arbitrated — which is [0004](../docs/adr/0004-contention-decides-authority.md)
   as restated: contention decides who arbitrates, not who authors.
5. **A route names `{path, match, workload, surface}`.** `match` is `prefix` or
   `exact`. The surface must be one the named Workload declares in `provides`;
   `E_UNKNOWN_SURFACE` otherwise. Two routes on one exposure may not have the
   same `path` + `match` pair.
6. **Per-path `audience` survives** as an override on a route, for the
   `/mcp` anonymous inside an authenticated host case.
7. **The authored proxy vocabulary is closed and is exactly two fields**:
   `contentPolicy` on an exposure, `redirectTo` on a route. There is **no**
   provider-shaped passthrough, no raw middleware reference, no headers block.
   Layer 1 carries no mechanism; a Traefik middleware name in Service Intent
   would be one.
8. **`redirectTo` is a path, never a regex.** Both live cases are
   exact-root-to-subpath. The renderer produces the `redirectRegex` form;
   `${1}` capture groups do not appear in layer 1.
9. **`${exposure:<service>.<name>#<field>}`**, with `field` ∈ `url`, `host`,
   `scheme`. The path is written *outside* the placeholder
   (`${exposure:auth.public#url}/login`) so substitution stays a named source
   resolving to one value, never a template with arguments.
10. **Everything else at the edge stays derived** from `audience` and the tier:
    forward-auth, the security-headers baseline, entryPoint, TLS, the
    middleware chain.

## Evidence for the closed vocabulary

Live middleware in the estate, counted:

| middleware | instances | disposition |
|---|---|---|
| `forwardAuth` | 3 definitions, 15 references | derived from `audience: authenticated` |
| `headers` — security baseline plus CSP `strict`/`admin`/`workflow` | 7 | baseline derived from tier; **profile choice authored as `contentPolicy`** |
| `chain` | 2 | derived composition |
| `redirectRegex` | 2 — `stalwart` `/`→`/admin/`, `traefik` `/`→`/dashboard/` | **authored as `redirectTo`** |

Nothing else exists. No timeouts, rate limits, IP allowlists, basic auth,
compression, retries or circuit breakers are in use anywhere, and none is added:
vocabulary for an estate that does not exist is the failure this model was built
to stop. A genuinely new case gets a field and an ADR, not a passthrough.

`AUTH_CORS_ALLOWED_ORIGINS` is deliberately **not** proxy vocabulary. It is an
application environment variable, derivable from the inbound edge set once that
predicate exists. Modelling it as edge config would be wrong twice.

## Hostnames are configured because they are not derivable

`homelab-inventory/catalog/reachability.yml` groups hosts into channels
(`public-frankfurt`, `lan`), so a zone mapping exists — but the host label does
not follow the Service id estate-wide. `knowledge.jorisjonkers.dev` and
`kb.jorisjonkers.dev` both resolve; `platform-rabbitmq` serves
`rabbitmq.jorisjonkers.dev`; `root`, `status`, `dashboard` and `faro` belong to
no Service. A derivation would be right for most and silently wrong for the
rest, and the wrong ones are the ones nobody would check.

## Error codes

New: `E_DUPLICATE_HOST`, `E_DUPLICATE_ROUTE_MATCH`.
Given a definition at last: `E_DUPLICATE_EXPOSURE_NAME` (unique within a Service).
Retired: nothing.

## Gaps this closes

`RENDER-GAPS.md` R17 (no exposure name, identical route matches) and the
hostname half of R26. `G-03` and `G-30` in the per-domain rendered READMEs.
Chapter 00 open item 1. It does **not** close R5 (`AUTH_CORS_ALLOWED_ORIGINS`),
which stays open as a derivation nobody has written.
