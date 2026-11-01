# Standing up the estate path on a cluster

How a cluster comes to be delivered from `JorisJonkers-dev/estate`: what has to
exist before anything renders, the order it is put there in, and what proves
the estate path delivers. It is the procedure for a new cluster and for a
cluster move.

This is a runbook, not a rule. The bootstrap set is
[chapter 14](../../spec/v1/14-platform-intent.md#the-bootstrap-set)'s, the
order and the preconditions are
[chapter 60](../../spec/v1/60-setup.md#bootstrap-order)'s, and delivery is
[chapter 55](../../spec/v1/55-delivery.md#rendered-artifacts-and-pins)'s.
Where this file and a chapter disagree, the chapter wins and this file is
fixed. The scripts it runs are the estate's
[`bootstrap/`](https://github.com/JorisJonkers-dev/estate/blob/main/bootstrap/README.md),
which say themselves what each stage writes.

## Who provides what

| what | who |
|---|---|
| hosts, k3s, the node facts | `JorisJonkers-dev/nix-config` |
| Flux's controllers, and the `flux-system/platform` source that reads the estate | `fleet-infra`'s `flux-system`, until JorisJonkers-dev/estate#211 settles their owner |
| the CRDs of the bootstrap set | Flagger's from `bootstrap/cluster.sh`; how the rest are applied on a new cluster is not yet written ([#381](https://github.com/JorisJonkers-dev/deploy-kit/issues/381)) |
| every Project, the foundation and `node` among them | the estate's pins |

## Once per organization, and once per key

Before the first cluster, and never again on a move:

- **The GitHub Apps.** `bootstrap/github-apps.sh` creates the dispatch,
  Collector and Reporter Apps and puts their ids and keys where each reader
  takes them ([chapter 60](../../spec/v1/60-setup.md#the-estate-repository)).
  The Apps live on GitHub, so a cluster move does not touch them.
- **The backup key pair** (maintainer). `age-keygen` makes it; the private key
  stays off the cluster, since only a restore holds it, and the public `age1…`
  line is the Platform document's `durability.irreplaceable.offCluster.recipient`,
  which 1.0 requires
  ([chapter 14](../../spec/v1/14-platform-intent.md#durability-policy)).
- **The off-cluster credential** (maintainer), for the Contabo bucket, at
  `secret/data/platform/backup/off-cluster`: `AWS_ENDPOINT_URL`,
  `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optionally `AWS_REGION`.
  No bootstrap script writes it; it is
  [JorisJonkers-dev/estate#228](https://github.com/JorisJonkers-dev/estate/issues/228),
  open.
- **The Cloudflare DNS token** (maintainer), `CF_DNS_API_TOKEN` at
  `secret/data/platform/cloudflare`, which the public tier's proxy issues its
  certificates with: `bootstrap/secrets.sh --only cloudflare`.

## On a new cluster

Each step reads what the one before it wrote, so the order matters
([chapter 60](../../spec/v1/60-setup.md#bootstrap-order)).

1. **Hosts and node facts.** Hosts are installed and joined to k3s from
   `JorisJonkers-dev/nix-config`. The node contract is generated there from one
   file per node, copied into the estate as `node-contract.yml`, and pinned by
   the Platform document by digest. It is ticked by the check in
   [chapter 60](../../spec/v1/60-setup.md#node-facts), and its reserves are
   compared once against `kubectl describe node`.
2. **Flux.** Install the controllers and the source that reads `fleet-infra`
   from `fleet-infra`'s `cluster/bootstrap/flux-bootstrap-playbook.md`. Its
   `flux-system` also declares `GitRepository flux-system/platform`, which
   reads the estate, and the `estate-pins` Kustomization, which applies the
   estate's `projects/` and nothing else. The Platform document records the
   source as `bootstrap.flux.sourceRef`.
3. **Vault, unsealed.** Unseal is out of band, a secret the model never holds:
   the Platform document's `bootstrap.vault.unsealed` asserts it, and nothing
   measures it. While Vault is the old path's, it starts in `data-system`;
   initialise it once (`vault operator init`), keep the unseal keys and the
   root token off the cluster, and unseal with quorum until it reports `Sealed
   false`, or restore it from its newest backup: `fleet-infra`'s
   `cluster/bootstrap/README.md` and the playbooks beside it. A restart of
   `frankfurt-contabo-1` seals it again; auto-unseal is
   [JorisJonkers-dev/estate#210](https://github.com/JorisJonkers-dev/estate/issues/210),
   open.
4. **Every secret a person writes.** Run `bootstrap/secrets.sh` against the new
   cluster's kubectl context. On a Vault initialised minutes ago there is no
   OIDC sign-in yet, so paste the root token when it asks. It writes the role
   every Project's Vault policy job logs in as (`policy-admin`, bound to the
   ServiceAccount `vault-policy` in every namespace and confined to that
   namespace's names) before the first render arrives
   ([chapter 14](../../spec/v1/14-platform-intent.md#the-vault-policy-job)). On
   a restored Vault it only checks what is there.
5. **The cluster's credentials.** Run `bootstrap/cluster.sh`. It writes
   `flux-system/estate`, a read-only deploy key on the estate, and
   `flux-system/render-pull`, the credential every pin pulls its render with,
   applies Flagger's CRDs, and proves Flux sees the estate.
6. **The bootstrap CRDs.** Every group in the Platform document's
   `bootstrap.crds` exists before any object of its kind applies. Read them
   back: `kubectl get crd`, one per kind the estate uses.
7. **The first composition.** Run **Deliver to production** (`compose.yml`)
   from the estate's Actions tab, or wait for its nightly run. Its summary has
   one row per Project and the `E_` codes of any it refused. The `_canary`
   source proves the signature check: a render that does not verify is never
   applied. Then:

   ```sh
   flux reconcile kustomization estate-pins -n flux-system --with-source
   flux get kustomizations -n flux-system --watch
   ```

8. **The sign-in clients.** Once auth-api runs, run `bootstrap/secrets.sh`
   again: everything it wrote is skipped, and it proves each OIDC client
   against auth-api.

## What proves it

- Every Reconcile Unit on the estate path reports Ready, and every
  `vault-policy` Job has succeeded.
- One value a consumer can see checks out on each Project: the host answers,
  a login works, the data is present. A Ready condition alone is not evidence.

The items that must hold before the first production apply, each with how it
is ticked and who owns it, are chapter 60's list, not this file's:
[Before the first production apply](../../spec/v1/60-setup.md#before-the-first-production-apply).
Two of them gate what renders: secrets at rest, without which `delivery: env`
and `delivery: file` are refused, and a rehearsed restore, without which no
`irreplaceable` volume is applied.

## Standing rules

These hold on every live cluster, during setup and after it.

- **Flux is the only writer.** Nothing cluster-wide (a CRD, an admission
  webhook, a mesh install) is applied by hand. A manual Helm install, such as
  the proposed mesh stage 2
  ([JorisJonkers-dev/estate#223](https://github.com/JorisJonkers-dev/estate/issues/223)),
  needs the maintainer's approval. The bootstrap set is the one thing applied
  by hand ([chapter 60](../../spec/v1/60-setup.md#bootstrap-order)).
- **Bulk deletes on a live node** run only with the maintainer's approval, item
  by item, at idle IO priority (`ionice -c3 nice -n19 rm -rf …`).
- **A node's gateway and DNS are never pinned.** DHCP and AdGuard own them.
