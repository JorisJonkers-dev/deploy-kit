---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-30
normative: spec/v1/14-platform-intent.md#grafanas-instance-and-data-sources
rests-on: ["0004"]
---

# Grafana's instance, its admin credential and its data sources derive from the monitoring stack

The monitoring stack's Grafana renders the external `Grafana` the Grafana
operator imports every dashboard into. Grafana and the operator both read an
admin credential the Vault policy job generates. Its data sources derive from
its dependency edges into the Applications the Platform document's
`monitoring` names, among them the stores it now names. The rules are in
[Grafana's instance and data sources](../../../spec/v1/14-platform-intent.md#grafanas-instance-and-data-sources).
Settled in
[Render the Grafana instance the Grafana operator imports dashboards into, and derive its data sources](https://github.com/JorisJonkers-dev/deploy-kit/issues/723).

## Rests on

Which Applications are the estate's stores, and which Grafana every dashboard
lands in, is contended across Projects, so the platform states it
([0004](0004-contention-decides-authority.md)).

**False if:** a dashboard rendered against the worked platform does not reach
the Grafana its `instanceSelector` names, or a data source a dashboard names by
uid is missing from a Grafana that declares the edge to its store.
**Settled by:** the observability example's committed tree, and the estate's
dashboards showing live data on the estate path's Grafana.

## Why

**Every dashboard selected an instance nothing rendered.** The `grafana` adapter
wrote each dashboard with an `instanceSelector` on the platform's labels, and
no `Grafana` object carried them, so the operator imported nothing.

**External, not managed.** The operator could run Grafana itself from a managed
`Grafana`, but its Deployment and Service would be the operator's, not the
Process's, and Grafana's own sign-in, grants and claim would have no Process to
follow. The Process stays the one the render runs, and the instance only says
where it is.

**A generated admin, read by both.** The operator signs in with Grafana's admin
credential. The chart generated one live, and the estate path has no chart, so
the Vault policy job generates both keys under the Project's own prefix
([0101](0101-a-generated-key-is-written-by-the-vault-policy-job.md)). The same
synced Secret feeds Grafana's admin variables and the instance's references, so
the two cannot disagree and nobody writes either value.

**Data sources from the edges, typed by the platform.** Chapter 10 already
counted the data sources as an inbound derivation. The edge says which store
Grafana reads and gives its address, so no address is written twice. The
platform's roles say which kind of store each one is, so the type and uid
follow. The stores join `monitoring` because Grafana's types are product
types, as the three roles already are. The links between data sources (traces
to logs, metrics and profiles) depend only on which kinds the set holds, so
they derive too. A link specific to one application's queries does not.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| Keep the data sources an authored Asset | every store's address written twice, once in the edge and once in the file | chapter 10 counts them as a derivation, and the authored copy drifts from the edges |
| A managed `Grafana` the operator runs | the Process's posture, grants and claim on an object the operator owns | the Process already runs; the operator only needs to reach it |
| An authored admin credential in Vault | a value someone writes by hand before the first start | the policy job already generates keys a Project owns |
| `GrafanaDatasource` objects per store | one object per store in Grafana's API, with the same derivation behind it | a provisioning file is what Grafana reads at start, with no operator round trip |
| Stores named in `telemetry` | a second block naming monitoring Applications | `monitoring` already names the stack by product |

## Reversibility

Cheap. Everything here is derived; the one authored addition, `monitoring.stores`,
is optional, and dropping it drops only the data sources it types.

## Consequences

- The Grafana role's first Process holds a grant on `<project>-system/<application>-admin`
  and reads it as `GF_SECURITY_ADMIN_USER` and `GF_SECURITY_ADMIN_PASSWORD`.
- A Grafana that reads a store declares its edge to it; an authored data
  source file at the same path is the author's to remove.
- Grafana's admin is created from the credential once, on an empty database:
  a Vault restored without it generates a new one that an existing database
  does not know, and the database is reconstructible.
