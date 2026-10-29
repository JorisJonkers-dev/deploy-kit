# Handing a Project over to the estate path

How one Project leaves `fleet-infra`'s `deploy/production` branch, the **old
path**, and is delivered from its pin in `JorisJonkers-dev/estate`, the
**estate path**: which Project goes next, the steps of one handover, what
proves it done, and how to undo it. Then what each of the eight Projects still
on the old path needs beyond those steps.

This is a runbook, not a rule. The rules it runs are
[chapter 60](../../spec/v1/60-setup.md#handing-over-one-project-at-a-time)'s,
the ledger it flips is
[chapter 14](../../spec/v1/14-platform-intent.md#handover-ledger)'s, and the
pin it ends on is
[chapter 55](../../spec/v1/55-delivery.md#rendered-artifacts-and-pins)'s. Where
this file and a chapter disagree, the chapter wins and this file is fixed. Two
sections of chapter 60 predate the decisions this runbook carries, its
[adoption order](../../spec/v1/60-setup.md#adoption-order-across-the-estate)
(providers first) and its claim that adoption renames nothing; both are
rewritten under [#381](https://github.com/JorisJonkers-dev/deploy-kit/issues/381)
once [#374](https://github.com/JorisJonkers-dev/deploy-kit/issues/374) settles
the chapter layout. Until then the order and the renaming rule below are the
settled ones, from
[#349](https://github.com/JorisJonkers-dev/deploy-kit/issues/349) and
[#367](https://github.com/JorisJonkers-dev/deploy-kit/issues/367).

A live handover step runs on the maintainer's go-ahead, never an agent's. The
estate-side changes of each handover are recorded on its issue and in the
estate repository's change history. A worked handover on an earlier toolkit,
with every command, is the estate's own
[`docs/runbooks/auth-handover.md`](https://github.com/JorisJonkers-dev/estate/blob/main/docs/runbooks/auth-handover.md);
this file generalises it.

## Which Project goes next

**Applications first, the foundation last.** An Application hands over against
the legacy foundation, reaching it where the ledger's `serving` statements say
the old path runs it. The foundation goes once every consumer is rendered, in
this order: `node`, observability, data, edge, and finally secrets.

**Among Applications, ready first.** A Project is ready once every need it has
is implemented. Among ready Projects, the one with the fewest new concepts goes
first. The order is a rule, not a list, so it follows the build.

Every handover runs on the 1.0 contract, never on an earlier release
([#349](https://github.com/JorisJonkers-dev/deploy-kit/issues/349)). Applied to
what is still `legacy` in the estate's ledger, the rule gives the order the
handover issues carry under
[#373](https://github.com/JorisJonkers-dev/deploy-kit/issues/373):

| # | Project | issue |
|---|---|---|
| 1 | mail | [#656](https://github.com/JorisJonkers-dev/deploy-kit/issues/656) |
| 2 | utility | [#657](https://github.com/JorisJonkers-dev/deploy-kit/issues/657) |
| 3 | agents | [#658](https://github.com/JorisJonkers-dev/deploy-kit/issues/658) |
| 4 | `node` | [#659](https://github.com/JorisJonkers-dev/deploy-kit/issues/659) |
| 5 | observability | [#660](https://github.com/JorisJonkers-dev/deploy-kit/issues/660) |
| 6 | data | [#661](https://github.com/JorisJonkers-dev/deploy-kit/issues/661) |
| 7 | edge | [#662](https://github.com/JorisJonkers-dev/deploy-kit/issues/662) |
| 8 | secrets | [#663](https://github.com/JorisJonkers-dev/deploy-kit/issues/663) |

Each issue is blocked by the one before it. A Project that is not live, such as
estate-dashboard once was, onboards on the estate path directly and never
appears here.

**A toolkit release moves before any Project.** Composition refuses a fragment
whose minor is newer than the toolkit's
([chapter 40](../../spec/v1/40-composition.md#versioning)), so the order of a
release is: the deploy-kit release, the shared Publish Fragment workflow's pin,
each Project's own release, delivery, then the estate
([chapter 40](../../spec/v1/40-composition.md#version-rollout)). A Project drops
a field a release removes in the same change that moves it onto that release,
never before.

## Names: what a handover may change

A Project hands over in the namespace it runs in and with the database names it
has. Where the render derives another namespace or another database name for a
provider whose data must be carried, the change is a **Move**, inside the
provider's own release, never a rename of live objects in the handover window
([chapter 55](../../spec/v1/55-delivery.md#moves),
[0094](../adr/model/0094-a-move-is-derived-from-one-authored-edit.md)). The
derived Move is
[#324](https://github.com/JorisJonkers-dev/deploy-kit/issues/324)'s.

None of the eight remaining handovers needs one. Three change namespace, each
by a decision of its own, recorded on its issue: the edge proxies are stateless
and start in `edge-system`; observability starts fresh in
`observability-system`; Vault moves to `secrets-system` by raft snapshot and
restore. Every other Project keeps its namespace and every live claim name its
issue lists.

## Before the window

1. **The estate file.** Complete the Project's file in the estate repository
   from its worked example under
   [`spec/v1/examples/`](../../spec/v1/examples), as its issue says. Where the
   example records a gap, it is a row of
   [`RENDER-GAPS.md`](../../spec/v1/examples/RENDER-GAPS.md); a row that stops
   the Project running as it runs live is decided before the handover, and one
   that only degrades it is named in the diff.
2. **The Platform document.** Add what the Project's issue says it needs first
   (a catalog, an engine, a substrate fact), released, so it composes.
3. **The one-off diff.** Diff the Project's render against the hand-written
   objects the old path applies for it, and explain every difference
   ([chapter 30](../../spec/v1/30-deliverables.md#a-projects-handover-diff)).
   No `deploy-kit` command takes this diff. A `legacy` Project is composed
   and never published, so render it outside the composition workflow: in a
   working copy of `platform.intent.yml`, move the Project to `estate` and
   remove its `serving` statements, as the flip will; run the `deploy-kit
   compose` step of the estate's `compose.yml` against those inputs; and read
   the Project's share from `<out>/artifacts/<project>/`. Nothing is
   published. Compare it with `kustomize build` of the Project's paths in
   `fleet-infra`, object by object and then field by field. Each difference
   is one of:
   - intent that is wrong: fix the estate file;
   - an object the render does not emit and the Project still needs: it stays
     on the old path, and the Project does not hand over until it can be
     declared;
   - an object the render replaces under another name or kind: listed, to be
     deleted by hand after the flip (see [After the flip](#after-the-flip));
   - a derivation that does not reproduce live, such as the priority class rule
     or the resource requests a BestEffort Process gains: written down, with
     the decision that explains it.

   While the edge is `legacy`, no Project's share carries a route
   ([chapter 55](../../spec/v1/55-delivery.md#rendered-artifacts-and-pins)), so
   routes are not in the diff: the old path's `IngressRoute` keeps serving,
   orphaned, until the edge hands over.
4. **The old route's port.** Where the old path's Service exposes a port other
   than the one the Surface declares, a `fleet-infra` change first adds the
   declared port to that Service and points the route at it
   ([chapter 60](../../spec/v1/60-setup.md#handing-over-one-project-at-a-time)).
5. **The injected token.** Where one of the Project's pod templates requests
   the Vault Agent's token (`vault.hashicorp.com/agent-inject-token`), check
   that nothing in its image reads `/vault/secrets/token`. Fourteen live pod
   templates request it and no manifest reads it, but the images were never
   inspected ([C12](../research/unsupported-claims.md#c10-to-c12-what-retiring-reloader-and-the-injector-rests-on)).
   The estate path delivers no token: an Application that talks to Vault
   itself logs in with its own ServiceAccount.
6. **Vault holds every key the render reads.** List the keys, never the
   values, of every path the Project's grants name. A key the render reads
   with `secretKeyRef` and Vault lacks fails the pod at start, where the
   injector rendered it empty.

## The handover

One Project moves in three changes, in this order, so that no moment has two
sources applying it
([chapter 60](../../spec/v1/60-setup.md#handing-over-one-project-at-a-time),
[0054](../adr/model/0054-projects-are-handed-over-one-at-a-time.md)):

1. **Orphan it on the old path.** A `fleet-infra` change marks every object of
   the Project `kustomize.toolkit.fluxcd.io/prune: disabled`, and sets
   `spec.suspend: true` on each of its `HelmRelease`s. Wait until the old path
   has reconciled both onto the live objects, and read the mark back off every
   object, the namespace included.
2. **Remove it from the old path.** A second `fleet-infra` change deletes the
   Project's manifests. The live objects keep running, applied by nothing.
3. **Flip the ledger.** An estate change moves the Project from `legacy` to
   `estate` in `platform.intent.yml`, and removes every `serving` statement of
   the Project's Applications in the same change. Its release publishes the
   Platform document and dispatches composition, which publishes the Project's
   artifact and writes its first pin.

**A HelmRelease is always suspended, then deleted.** helm-controller skips the
uninstall of a suspended release, so every object of the release stays, CRDs
and their custom objects included, for the render to take over. Deleting a
release that is not suspended uninstalls it, and a chart that templates its
CRDs (MetalLB's does) deletes them and every object of their kinds
([C49](../research/unsupported-claims.md#c48-and-c49-removing-a-helmrelease-without-losing-its-crds)).
A chart's CRDs pass to the bootstrap set before its HelmRelease is removed: the
Platform document's `bootstrap.crds` names them
([chapter 14](../../spec/v1/14-platform-intent.md#the-bootstrap-set)). What
the release leaves that the render does not emit is on the diff's list, to
delete by hand.

**What the first pin does.** The old path's Deployments select on
`app.kubernetes.io/name` alone, the render's on the fixed label set, and a
selector is immutable. So the first pin source marks every Deployment
`kustomize.toolkit.fluxcd.io/force: Enabled`, and Flux deletes and recreates
each once ([chapter 55](../../spec/v1/55-delivery.md#what-a-pin-source-holds)).
A claim is never marked and keeps its data. To keep the old pods serving
through the recreate, delete each Deployment with `--cascade=orphan` after the
second change and before the flip: its ReplicaSet keeps its pods, the Service
still selects them, and the new Deployment never adopts them. A `blue-green`
Process's pods are then replaced once more, by the primary Flagger generates.

**What follows on its own.** In the Project's unit, its Vault policy job writes
its policies, roles and generated keys; VSO syncs its Secrets; its workloads
start. Every estate unit that follows the Project gains `dependsOn` on it in
the same composition, and holds its next change until the Project's unit is
Ready, while nothing it runs stops. Watch it:

```sh
gh run list -R JorisJonkers-dev/estate --workflow compose.yml --limit 3
flux reconcile kustomization estate-pins -n flux-system --with-source
flux get kustomizations -n flux-system --watch
```

## What proves it done

Three things, each read, never assumed:

1. **The diff** from [Before the window](#before-the-window) was clean, or
   every difference in it is explained.
2. **The Project's Reconcile Units report Ready** on the estate path. A claim
   that is `Pending` with no selected node, such as a backup claim before its
   first run, counts as healthy
   ([chapter 55](../../spec/v1/55-delivery.md#what-a-pin-source-holds)).
3. **One value a consumer can see checks out**: the host answers, a login
   works, the data is present. Each handover issue names its value. A Ready
   condition alone is not evidence.

The first two can be read only after the flip, because a `legacy` Project has
no pin to report on. If either fails, [roll back](#rollback).

## After the flip

Once all three hold, one change per repository closes the handover. Together
they remove every trace of the Project from the old path:

- **`fleet-infra`:** anything of the Project's still there, and its entries in
  the fragment drift check (`.github/workflows/fragment-drift.yml`, which walks
  every first-party pin under `cluster/flux/`, and the accepted differences in
  `catalog/accepted-fragment-drift.yml`).
- **The Project's repository:** its `deploy-config-schema` descriptor,
  `platform/deployment.yml`, where it carries one. `deploy-config-schema` is
  archived once the last drift check is gone.
- **The cluster, by hand:** every object the diff listed as replaced (an old
  ReplicaSet, a `ServiceMonitor` a `PodMonitor` now does the job of, a pull
  Secret nothing references), and the old Vault role, which the policy job
  reports and never deletes
  ([chapter 16](../../spec/v1/16-dependencies.md#process-identity)).

## Rollback

The three changes run the other way
([chapter 60](../../spec/v1/60-setup.md#handing-over-one-project-at-a-time)).
Only the old path's objects come back; data is never touched.

1. **Stop the estate path pruning the Project.** Mark its source `prune:
   disabled`; the auth handover did it by setting `spec.prune: false` on the
   Project's Kustomizations in `projects/<project>/source.yaml`, the one hand
   edit of a pin file, which only an undo makes. Reconcile `estate-pins` and
   read the value back.
2. **Remove it from the estate path.** One estate change deletes
   `projects/<project>/` and moves the Project back from `estate` to `legacy`,
   restoring any `serving` statement the flip removed. Flux deletes the Kustomizations, which with
   pruning off delete nothing. Moving the ledger alone would leave the last pin
   applied beside the old path.
3. **Return it to the old path.** Revert the second `fleet-infra` change, then
   the first. To keep a pod serving meanwhile, delete the render's Deployments
   with `--cascade=orphan` first, and split the revert so the old Deployments
   are Ready before their Services' selectors change back.
4. **Clean up what the estate path left**, orphaned by step 1: its VSO objects,
   Canaries, monitors and Jobs, and the `-primary` and `-canary` copies once
   the old pods serve. The Vault policy and role it wrote may stay.

## Per-Project notes

What each handover needs beyond the steps above. Each issue is the full
record, with its dated decisions and its resume note; this is the summary a
window is planned from.

### mail

[#656](https://github.com/JorisJonkers-dev/deploy-kit/issues/656). stalwart is
declared whole, stays in `mail-system`, and keeps the live claim
`stalwart-data`: the steps above alone. Check: mail is accepted and delivered
over SMTP, and read over IMAP, through the new objects.

### utility

[#657](https://github.com/JorisJonkers-dev/deploy-kit/issues/657). adguard and
headlamp stay in `utility-system`, and neither holds data.

- adguard resolves upstream through the Platform document's
  `substrate.upstreamNameservers`
  ([#634](https://github.com/JorisJonkers-dev/deploy-kit/issues/634)), not
  through the cluster DNS it serves.
- adguard-ha runs two instances on LAN pool addresses. One address in front of
  two replicas is failover, not load sharing: only the announcing node's
  replica serves. The gap was measured
  ([#372](https://github.com/JorisJonkers-dev/deploy-kit/issues/372)): 5.3 s
  unanswered when the announcing pod was deleted, 6.6 s when its node left the
  network, accepted for DNS.
- headlamp needs only `api: { reason }` and the Platform document's
  `apiAccess.namespaceHolders`.

Check: DNS answers on adguard's pool address, and headlamp signs in.

### agents

[#658](https://github.com/JorisJonkers-dev/deploy-kit/issues/658). The estate
file copies [`examples/agents/`](../../spec/v1/examples/agents) as it stands:
hermes and kubernetes-mcp-server, with agents-api and agents-ui parked. It
stays in `agents-system`, and the claims `hermes-data`, `claude-credentials` and
`codex-credentials` keep their live names.

- The render gaps that stop hermes running as it runs live are decided first;
  the issue lists them, and the config hermes's init steps seed onto its volume
  ([#693](https://github.com/JorisJonkers-dev/deploy-kit/issues/693)) is still
  open.
- The Platform document admits `agents/kubernetes-mcp-server` in
  `apiAccess.holders`; a cluster-wide read is a privileged role, so it runs at
  the critical priority class.
- hermes signs in against the estate's provider, not auth-api.

Check: hermes answers on its route, and kubernetes-mcp-server lists the
cluster.

### node

[#659](https://github.com/JorisJonkers-dev/deploy-kit/issues/659).

- The Platform document gains a `nodeAgents` catalog with locked images for
  the MetalLB speaker, node-exporter, the GPU device plugin and DCGM. Without
  it the render that derives Node Agents is refused with
  `E_NO_NODE_AGENT_POLICY`
  ([chapter 14](../../spec/v1/14-platform-intent.md#node-agents)).
- `metallb.io/v1beta1` joins `bootstrap.crds` before MetalLB's HelmRelease is
  suspended and deleted; its conversion webhook stanza is dropped when the CRDs
  are pinned ([chapter 14](../../spec/v1/14-platform-intent.md#the-bootstrap-set)).
- A `gpus` fact asserts that the host holds the driver, the container toolkit
  and the CDI specification; nix-config owns that state, and the render
  installs none of it.

Check: each GPU node advertises its GPU resource (`nvidia.com/gpu` on the
NVIDIA nodes) in its allocatable, and every node's metrics are scraped.

### observability

[#660](https://github.com/JorisJonkers-dev/deploy-kit/issues/660). The file
gains prometheus-operator, kube-state-metrics, grafana-operator, grafana, loki,
tempo, pyroscope, gatus, alloy and alertmanager from
[`examples/observability/`](../../spec/v1/examples/observability). The
namespace moves from `observability` to `observability-system`.

- **It starts fresh.** New, empty claims in `observability-system`. The old
  claims stay, read-only, until their retention would have run out, and are
  deleted on the maintainer's go-ahead at idle IO priority.
- The `otel-collector` serving statement leaves the ledger in the flip.
- grafana's client credential is at
  `secret/data/observability-system/grafana/client`, written by the provider.
- The Platform document records `bootstrap.flux.metrics: {port: 8080, path:
  /metrics}`, so the `flux-controllers` PodMonitor replaces `fleet-infra`'s
  `observability/flux-monitoring`. The Flux series' `job` becomes each
  controller's name; a live alert that filters on the old job is adjusted.
- `loki-canary` is not rendered: the diff records it as an explained removal.

Check: Grafana's dashboards show live data, and an alert reaches Discord.

### data

[#661](https://github.com/JorisJonkers-dev/deploy-kit/issues/661). The file
declares postgres, rabbitmq, valkey, platform-mongo and platform-garage, all in
`data-system`. The live claims are kept: `postgres-data`, `rabbitmq-data`,
`valkey-data`, and `mongo-data-mongo-0`, which mongo's declaration must name
exactly to adopt the live claim.

- **Before:** the Platform document gains `engines.s3` and the serving
  `platform-garage` admin location, after the releases the issue names.
- **Garage's keys:** copy each live key from `secret/data/<ns>/garage`
  (`s3.key_hex`, `s3.secret`) to `secret/data/<project>/garage/s3`
  (`access-key-id`, `secret-access-key`) before the catalog first runs, so it
  imports them instead of minting new ones.
- **Garage's buckets:** each consumer's edge names its buckets, giving
  `<project>-<name>`, and those must match the live bucket names, or the
  catalog creates new, empty ones.
- **Garage's volumes split in the window.** Stop Garage, copy its LMDB
  metadata onto the new `garage-meta` claim, keep the data blocks on the live
  `garage-data`, and start it with `metadata_snapshots_dir` on
  `garage-snapshots`: one short Garage outage. It is backed up from its own
  metadata snapshot plus `file-backup`, never from the live LMDB.
- `fleet-infra`'s `garage-asset-sync` CronJob runs in `data-system`: before
  its objects are deleted, check what it does and whether a model concept
  covers it.
- The `platform-postgres` and `platform-garage` serving statements leave the
  ledger in the flip, and each catalog moves into the data Project's own unit.

Check: every consumer still reads its database, its queue and its bucket.

### edge

[#662](https://github.com/JorisJonkers-dev/deploy-kit/issues/662). The file
gains external-dns. The proxies move from `ingress-system` and
`ingress-lan-system` to `edge-system`; they hold no data, and the Platform
document carries the tiers' ingress classes and the `acme` account.

- **Before:** `CF_DNS_API_TOKEN` is at `secret/data/platform/cloudflare`
  ([JorisJonkers-dev/estate#229](https://github.com/JorisJonkers-dev/estate/issues/229),
  written by the estate's `bootstrap/secrets.sh --only cloudflare`). The
  estate's tiers are checked against the live edge, the LAN tier's
  certificates and the forward-auth path among them
  ([JorisJonkers-dev/estate#200](https://github.com/JorisJonkers-dev/estate/issues/200),
  open).
- **Each address passes from the old proxy to the new one.** A pool address
  is held by one Service at a time, and a host port is bound once per node, so
  the new proxy cannot take an address while the old one holds it: for each
  address the old Service lets go and the new one takes it, and the time
  between the two is that address's outage. Which address goes first, and the
  window, are not decided; they are set on the issue with the maintainer.
- **Routes flip in this window.** Once the edge is on the estate path, every
  routed Project's artifact gains its routes and its pin moves once. The old
  path's routes, orphaned and serving since each Project's own handover, are
  on the edge's diff: taken over by a rendered route, or deleted by hand.
- cert-manager retires: each `acme` tier's proxy issues its own certificates,
  and its proxy may not run more than one replica. Both tiers draw on one Let's
  Encrypt allowance: five lost ACME claims within seven days, counted across
  both, exhaust it, so the claims are not recreated casually.

Check: every public route answers over TLS, and every LAN route answers.

### secrets

[#663](https://github.com/JorisJonkers-dev/deploy-kit/issues/663). The file
gains the Vault Secrets Operator.

- **Retired first,** each in its own change, on the old path: the Vault CSI
  provider, which serves nothing
  ([C13](../research/unsupported-claims.md#secret-delivery)); the Vault Agent
  injector, once no `vault-agent` consumer is left; Reloader, once VSO restarts
  every consumer; and cert-manager, with the edge.
- **Vault moves by raft snapshot and restore, never a Move.** In a quiet,
  planned window, with the maintainer: take a raft snapshot, start Vault in
  `secrets-system`, restore the snapshot, unseal it, then retire the old Vault
  in `data-system`. It is a short, planned outage of Vault.
- The `vault` serving statement leaves the ledger in the flip, so every
  Project's Secret Store address and policy job follow Vault to
  `secrets-system` in the same composition.
- A restart of `frankfurt-contabo-1` seals Vault and takes down every
  Application that reads a database credential; auto-unseal is open
  ([JorisJonkers-dev/estate#210](https://github.com/JorisJonkers-dev/estate/issues/210)).

Check: a Secret VSO syncs refreshes after its value changes in Vault, and every
Project's policy job succeeds.

## When the last one lands

`legacy` is empty. The ledger block is removed, and with it both refusals; the
old path's Kustomization is set to `prune: false`, then deleted, and the branch
is archived, by `retireBy`
([chapter 60](../../spec/v1/60-setup.md#handing-over-one-project-at-a-time)).
`fleet-infra` ends holding only the Flux bootstrap. Standing up the estate path
on a cluster from nothing is [`setup.md`](setup.md).
