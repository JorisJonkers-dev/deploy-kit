# The real estate

Every other worked example is written for the model. This one is taken from
production: the inputs composition read for the estate at one recorded commit,
so both implementations are held to the shapes production actually renders
rather than only to the ones a worked example was written to show.

Three Projects carry oracles, chosen because each exercises something no
other worked example does. Every other directory here is an input they are
composed with, exactly as composition reads it: a Project resolves against
the whole union it is delivered from, and a provider's policies name every
consumer of it.

| Project | what it exercises that no other worked example does |
|---|---|
| [`observability`](observability/observability.project.yml) | the real monitoring stack, twelve Applications: 31 dashboards, compact JSON and vendored ones with data source inputs among them, and two rule-group files, one of them kube-prometheus-stack's default rules vendored as JSON with recording rules and group intervals; arguments that hold a comma or a `host:port` in a plain scalar |
| [`hindsight`](hindsight/hindsight.project.yml) | the knowledge platform's successor on the estate path: four Applications, two exposures sharing the `authenticated` audience with exact and prefix routes, an env file written for one Application (`env/_applications/`), and two TEI models each on a reconstructible model cache |
| [`immich`](immich/immich.project.yml) | a Project that runs its own `postgres` engine, backed up from a recoverable claim and reached in-project with credentials, and a Process that mounts the `media` library at a `subPath` |

## Where each input came from

Every file is the one composition read, unchanged, save the two adjustments
below. The estate repository is
[JorisJonkers-dev/estate](https://github.com/JorisJonkers-dev/estate) at
`967bab23abb60871f104b2bcbb45e6e67d7c61ba`, where every Project's pin names the
release each application repository's row gives.

| directory | repository | commit | release |
|---|---|---|---|
| this directory's `platform.intent.yml`, `node-contract.yml`, `cluster-state.yml` | JorisJonkers-dev/estate | `967bab23abb60871f104b2bcbb45e6e67d7c61ba` | Platform document 0.36.3 |
| `data`, `edge`, `mail`, `observability`, `outline`, `secrets`, `utility` | JorisJonkers-dev/estate, `platform/` | `967bab23abb60871f104b2bcbb45e6e67d7c61ba` | observability, data, edge and secrets 0.36.3; mail and outline 0.35.0; utility 0.34.0 |
| `arr` | JorisJonkers-dev/arr, `deploy/` | `00c4c3a3d34f502828572251da473c4b59f147fa` | 1.2.1 |
| `auth` | JorisJonkers-dev/auth-api, `deploy/` | `dbedf5eb7ef44cb71921e0e116a7a1fdcd89dae0` | 0.21.4 |
| `delivery` | JorisJonkers-dev/delivery, `deploy/` | `da98e41503b231e87c36d244d409bc40cb1cfb0f` | 0.16.1 |
| `estate-dashboard` | JorisJonkers-dev/estate-dashboard, `deploy/` | `335f39ea52e0addeee45899cf279f4bba5090c86` | 0.10.0 |
| `findability-explorer` | JorisJonkers-dev/findability-explorer, `deploy/` | `f19a0a85c93f0d91478e7d3bbda5975a05b8d99c` | 1.11.1 |
| `grimoire` | JorisJonkers-dev/grimoire, `deploy/` | `d0653b12be6026e7a2362ac04f5890c1ad6bbf3b` | 1.5.0 |
| `hindsight` | JorisJonkers-dev/hindsight, `deploy/` | `20c272674fafea6a4e1b61fb1442f85ca18e7032` | 1.1.2 |
| `home-portal` | JorisJonkers-dev/home-portal, `deploy/` | `706500105c945e808aacb4db7eb2aba1572eaf68` | 0.15.0 |
| `immich` | JorisJonkers-dev/immich, `deploy/` | `dfbb1b079cb0c6433de1fe9eafa664abc34943e2` | 1.1.1 |
| `jellyfin` | JorisJonkers-dev/jellyfin, `deploy/` | `0b833bdbe52bab3401678b688e579b959265a4b5` | 11.1.0 |
| `jellyseerr` | JorisJonkers-dev/jellyseerr, `deploy/` | `caf4602d3243cf1a1f9fd566a87b5abcb0846b53` | 3.6.1 |
| `karakeep` | JorisJonkers-dev/karakeep, `deploy/` | `fbd55a5edb49c05709c0f29a3e07f3214c8b216b` | 1.1.2 |
| `n8n` | JorisJonkers-dev/n8n, `deploy/` | `01857e298e7eb1da2cd7bbdca161df1c04cb0225` | 2.46.1 |
| `overleaf` | JorisJonkers-dev/overleaf, `deploy/` | `51a2ff67ad45390bf16c19cd1df84ff6f61b2756` | 1.1.1 |
| `prowlarr` | JorisJonkers-dev/prowlarr, `deploy/` | `e696776b983d9b7c408ce4b8e3ce19765c6e7740` | 2.6.1 |
| `qbittorrent` | JorisJonkers-dev/qbittorrent, `deploy/` | `c35f233a20e7dab43a0f78c7d2c12e1cd8aa3f75` | 5.3.1 |
| `tribelt` | JorisJonkers-dev/tribelt, `deploy/` | `e79548b8ebbfc2969c5986da1881a5bcac397a32` | 0.12.0 |

Each project file and env file equals the one in the Intent Fragment that
release published, `ghcr.io/jorisjonkers-dev/intent-<project>:<release>`.

## What was adjusted, and why

- **One images lock.** Composition reads the Platform document's lock and each
  fragment's own share of it, and resolves against their union
  ([chapter 40](../../40-composition.md#fragments)). A worked set is read with
  one lock, so [`images.lock.yml`](images.lock.yml) is the estate's lock,
  unchanged, followed by each application repository's share as its fragment
  carries it, one commented block per share.
- **One directory per Project.** The estate keeps `edge` and `secrets` as files
  in `platform/` and the others in directories beside them, and each
  application repository keeps its files under `deploy/`. Here every Project
  has its own directory, named for the Project, with its files laid out as
  they were beside the project file.

## How the oracles were written, and what they were checked against

The TypeScript implementation wrote every oracle here: `expected/intent.json`,
`expected/dependencies.json`, one `expected/resolved.<application>.json` per
Application, and the Project's own share of the tree under `rendered/`, each
Project rendered alone from the whole set, as
[`test/model/estate-examples.test.ts`](../../../../test/model/estate-examples.test.ts)
holds them.

Each tree was compared with the Rendered artifact production delivers for that
Project, `ghcr.io/jorisjonkers-dev/render/<project>` at the digest the estate's
pin names, and differs from it in two ways only, both composition's rather than
the Project's:

- **Routes.** Composition holds every Project's routes back while the edge is
  still `legacy` in the handover ledger, so the old path's Traefik stays the
  only source of them
  ([chapter 60](../../60-setup.md#handing-over-one-project-at-a-time)). These
  trees carry them, as every worked tree does: each exposure's `route-*.yaml`
  and its line in the unit's `kustomization.yaml`.
- **The release patches.** Composition labels each unit's pods with the
  release it delivers by patches in the Project's `kustomization.yaml`
  ([chapter 55](../../55-delivery.md#rendered-artifacts-and-pins)); a render of
  the set alone knows no release.

The model-driven implementation under `emf/` is held to the same oracles: see
its `OracleDistanceTest`.
