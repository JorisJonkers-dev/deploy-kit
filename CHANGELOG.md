# Changelog

## [0.6.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.5.1...v0.6.0) (2026-10-05)


### Features

* hand the Release Gate the migration it starts, and refuse a changelog nothing gates ([#263](https://github.com/JorisJonkers-dev/deploy-kit/issues/263)) ([4cfbdd9](https://github.com/JorisJonkers-dev/deploy-kit/commit/4cfbdd9b418a7e902407b40921c14a7853b1268b))
* render auth, with its migration Jobs, its autoscaler and its disruption budget ([#260](https://github.com/JorisJonkers-dev/deploy-kit/issues/260)) ([f417250](https://github.com/JorisJonkers-dev/deploy-kit/commit/f4172509dc54ffb7ef97efbd78e59ee9c82ff14b))

## [0.5.1](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.5.0...v0.5.1) (2026-10-05)


### Bug Fixes

* keep the estate-scoped tree out of apps/, so a Project named edge is delivered as itself ([#255](https://github.com/JorisJonkers-dev/deploy-kit/issues/255)) ([319f714](https://github.com/JorisJonkers-dev/deploy-kit/commit/319f714c1697fed9712d516755951d1558596197)), closes [#253](https://github.com/JorisJonkers-dev/deploy-kit/issues/253)

## [0.5.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.4.0...v0.5.0) (2026-10-05)


### Features

* check the participants list in composition, and isolate a participant that is missing, stale or unlisted ([#250](https://github.com/JorisJonkers-dev/deploy-kit/issues/250)) ([323e73f](https://github.com/JorisJonkers-dev/deploy-kit/commit/323e73f373f524b4371b84355986d7380214918b))
* write an artifact's pin source the first time it is delivered ([#254](https://github.com/JorisJonkers-dev/deploy-kit/issues/254)) ([f7d0a96](https://github.com/JorisJonkers-dev/deploy-kit/commit/f7d0a96b035d2aa5f1756724673ee2e0fc2d7c4a)), closes [#232](https://github.com/JorisJonkers-dev/deploy-kit/issues/232)

## [0.4.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.3.0...v0.4.0) (2026-10-04)


### Features

* a Process declares the Kubernetes API access it needs, the platform admits who may hold any, and the delivery machinery renders ([#245](https://github.com/JorisJonkers-dev/deploy-kit/issues/245)) ([eb3afa7](https://github.com/JorisJonkers-dev/deploy-kit/commit/eb3afa74668250d00595fd71bdc85fe0eafc09bf))
* give each backup identity a network policy of its own, from the surface its method dumps and where its off-cluster copy goes ([#243](https://github.com/JorisJonkers-dev/deploy-kit/issues/243)) ([5377ee3](https://github.com/JorisJonkers-dev/deploy-kit/commit/5377ee3af055ac6980898c4672c852ad08c32f59))
* render the Release Gate's inputs as a ConfigMap, and name a Vault role for its namespace and identity ([#239](https://github.com/JorisJonkers-dev/deploy-kit/issues/239)) ([131a8e3](https://github.com/JorisJonkers-dev/deploy-kit/commit/131a8e35b8e7d7655304a06324b0a3f9fe020cf1))
* render the Vault policy job, named by the digest of the documents it writes ([#246](https://github.com/JorisJonkers-dev/deploy-kit/issues/246)) ([885d7aa](https://github.com/JorisJonkers-dev/deploy-kit/commit/885d7aafa4c9012348aa46cedc74f838c5f4c616)), closes [#202](https://github.com/JorisJonkers-dev/deploy-kit/issues/202)

## [0.3.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.2.0...v0.3.0) (2026-10-04)


### ⚠ BREAKING CHANGES

* the library entry no longer exports the hand-written domain types (Project, Application, Process, Platform, Tier and the vocabulary unions). A checked Intent Set now carries the authored Platform document and each project's Effective Intent.

### Features

* add prepare Processes for forward-only setup ([#166](https://github.com/JorisJonkers-dev/deploy-kit/issues/166)) ([f04b5b6](https://github.com/JorisJonkers-dev/deploy-kit/commit/f04b5b6e02aeb1cacc37ae5eb7e60057948b3611)), closes [#156](https://github.com/JorisJonkers-dev/deploy-kit/issues/156)
* **ci:** comment each pull request's shape and publish a release candidate ([#116](https://github.com/JorisJonkers-dev/deploy-kit/issues/116)) ([4ff3284](https://github.com/JorisJonkers-dev/deploy-kit/commit/4ff3284362669dc887db9adc2ceda23e66c683f8))
* compose the estate, and the deploy-kit command that validates, publishes and composes ([#228](https://github.com/JorisJonkers-dev/deploy-kit/issues/228)) ([912cf63](https://github.com/JorisJonkers-dev/deploy-kit/commit/912cf639646f86592d86872179ad78648ab72240))
* declare migrations on the Application ([#165](https://github.com/JorisJonkers-dev/deploy-kit/issues/165)) ([83ba2b4](https://github.com/JorisJonkers-dev/deploy-kit/commit/83ba2b4ec809add6d5b50bb9fcb75b906fb68576)), closes [#155](https://github.com/JorisJonkers-dev/deploy-kit/issues/155)
* deliver each Project as a signed artifact pinned by digest ([#169](https://github.com/JorisJonkers-dev/deploy-kit/issues/169)) ([84a89e2](https://github.com/JorisJonkers-dev/deploy-kit/commit/84a89e22fba15b14ef29f68647b4856ad1b5ce0e)), closes [#154](https://github.com/JorisJonkers-dev/deploy-kit/issues/154)
* gate switchover per Application with the Release Gate ([#167](https://github.com/JorisJonkers-dev/deploy-kit/issues/167)) ([44d115e](https://github.com/JorisJonkers-dev/deploy-kit/commit/44d115ecbf692db968109f80361f92b0e4efbc6e)), closes [#152](https://github.com/JorisJonkers-dev/deploy-kit/issues/152)
* give every Application a revision ([#164](https://github.com/JorisJonkers-dev/deploy-kit/issues/164)) ([bf9a7b9](https://github.com/JorisJonkers-dev/deploy-kit/commit/bf9a7b9140a64970784e60f8f380ab517af972d7)), closes [#150](https://github.com/JorisJonkers-dev/deploy-kit/issues/150)
* give the Resolved Deployment and the node contract their metamodels ([#135](https://github.com/JorisJonkers-dev/deploy-kit/issues/135)) ([179cbe8](https://github.com/JorisJonkers-dev/deploy-kit/commit/179cbe85f4945ee19cb9ff8e49c8a3d01d4fb24e))
* hand Projects over from fleet-infra one at a time ([#172](https://github.com/JorisJonkers-dev/deploy-kit/issues/172)) ([ed0a8b7](https://github.com/JorisJonkers-dev/deploy-kit/commit/ed0a8b75d048b454e4555057db0fa0bbbd0bde39)), closes [#159](https://github.com/JorisJonkers-dev/deploy-kit/issues/159)
* keep secret rotation outside a release ([#170](https://github.com/JorisJonkers-dev/deploy-kit/issues/170)) ([db27cce](https://github.com/JorisJonkers-dev/deploy-kit/commit/db27ccebb3adea33fb59848a1869bbf984ac9dfe)), closes [#153](https://github.com/JorisJonkers-dev/deploy-kit/issues/153)
* keep the production implementation portable ([#227](https://github.com/JorisJonkers-dev/deploy-kit/issues/227)) ([b9ac258](https://github.com/JorisJonkers-dev/deploy-kit/commit/b9ac258f5ebe52a94e182ebeb23c7ea94af7aa98))
* lay the compiler out as a chain of steps, and lower to the Effective Intent ([#184](https://github.com/JorisJonkers-dev/deploy-kit/issues/184)) ([e771f46](https://github.com/JorisJonkers-dev/deploy-kit/commit/e771f4688d17a84ccf038f7c0f8e9af9e7a43e45))
* link a route's and a scrape's names to the Process and surface they mean ([#118](https://github.com/JorisJonkers-dev/deploy-kit/issues/118)) ([da54c8e](https://github.com/JorisJonkers-dev/deploy-kit/commit/da54c8e1713da109a6e80f30699fb5c92dd8b99c))
* make cutover continuous or interrupted and derive blue/green from it ([#163](https://github.com/JorisJonkers-dev/deploy-kit/issues/163)) ([7e1d8b0](https://github.com/JorisJonkers-dev/deploy-kit/commit/7e1d8b0680e05522afd4c8321b8aea3836229278)), closes [#151](https://github.com/JorisJonkers-dev/deploy-kit/issues/151)
* pack each fragment's share of the images lock, and union the shares in composition ([#238](https://github.com/JorisJonkers-dev/deploy-kit/issues/238)) ([d47bd56](https://github.com/JorisJonkers-dev/deploy-kit/commit/d47bd56b81146bb47c5d83200640e464cf75e097))
* parse the minimal project intent in both implementations and match its oracle ([#112](https://github.com/JorisJonkers-dev/deploy-kit/issues/112)) ([506619b](https://github.com/JorisJonkers-dev/deploy-kit/commit/506619be73ab1e197552c7489e1fee1970a4044a))
* prove every migration safe and undo a held one ([#171](https://github.com/JorisJonkers-dev/deploy-kit/issues/171)) ([e7383c4](https://github.com/JorisJonkers-dev/deploy-kit/commit/e7383c46354ab578deddbbda2dd992f4c297913f)), closes [#157](https://github.com/JorisJonkers-dev/deploy-kit/issues/157)
* publish JSON Schemas for the Resolved Deployment, the composition lock and the pin annotations ([#211](https://github.com/JorisJonkers-dev/deploy-kit/issues/211)) ([0fb5f6c](https://github.com/JorisJonkers-dev/deploy-kit/commit/0fb5f6c8d94c385f9096ee4a0e8b3b81683cd19c))
* read the Platform document and refuse what it and the project files break together ([#120](https://github.com/JorisJonkers-dev/deploy-kit/issues/120)) ([ede5e91](https://github.com/JorisJonkers-dev/deploy-kit/commit/ede5e91c64f0b847b31923254daeb0a51d41bafc)), closes [#41](https://github.com/JorisJonkers-dev/deploy-kit/issues/41)
* refuse a broken document with the code and pointer both implementations agree on ([#114](https://github.com/JorisJonkers-dev/deploy-kit/issues/114)) ([dede1fa](https://github.com/JorisJonkers-dev/deploy-kit/commit/dede1fa6ba7fc291ae46cb0d8286ad1a1fadafba))
* refuse a settled decision that is not accepted ([#207](https://github.com/JorisJonkers-dev/deploy-kit/issues/207)) ([1be1eb8](https://github.com/JorisJonkers-dev/deploy-kit/commit/1be1eb818b6223dd18c4139b93b67b8437ba6917))
* render data, with Vault delivery, Assets, sidecars and backups ([#192](https://github.com/JorisJonkers-dev/deploy-kit/issues/192)) ([d4b0719](https://github.com/JorisJonkers-dev/deploy-kit/commit/d4b071958a26ac8e1e91f91673a76d1427ca8cf0))
* render Flagger-ready objects ([#173](https://github.com/JorisJonkers-dev/deploy-kit/issues/173)) ([b851060](https://github.com/JorisJonkers-dev/deploy-kit/commit/b851060c922e5fc497c6fe65f61cb3bab2057afe)), closes [#158](https://github.com/JorisJonkers-dev/deploy-kit/issues/158)
* render minimal's share of the tree through typed objects and one serializer ([#186](https://github.com/JorisJonkers-dev/deploy-kit/issues/186)) ([4943053](https://github.com/JorisJonkers-dev/deploy-kit/commit/494305350572ac9d43d8184e1b9fcbb40392dfb0))
* resolve auth, with migration, engine grants and placeholders ([#194](https://github.com/JorisJonkers-dev/deploy-kit/issues/194)) ([621639e](https://github.com/JorisJonkers-dev/deploy-kit/commit/621639e82eb747ba069baaf5af459054cf4c3f06))
* resolve data, with grants, Assets, sidecars and the Secret Store ([#190](https://github.com/JorisJonkers-dev/deploy-kit/issues/190)) ([31380c3](https://github.com/JorisJonkers-dev/deploy-kit/commit/31380c33418c38040d86c666dc0007d0b707c71b))
* resolve every example the production implementation resolves, through QVT-Operational ([#216](https://github.com/JorisJonkers-dev/deploy-kit/issues/216)) ([c75d586](https://github.com/JorisJonkers-dev/deploy-kit/commit/c75d586276544ba8ae163798c673d4c7d304224b))
* resolve minimal to its Resolved Deployment, with the foundation declared ([#185](https://github.com/JorisJonkers-dev/deploy-kit/issues/185)) ([7ea3422](https://github.com/JorisJonkers-dev/deploy-kit/commit/7ea3422c9f24aa8241a0935cc5580b7457a93ca0))
* resolve minimal with QVT-Operational, reading the pinned inputs through their own grammars ([#215](https://github.com/JorisJonkers-dev/deploy-kit/issues/215)) ([1aa4cdc](https://github.com/JorisJonkers-dev/deploy-kit/commit/1aa4cdce70e23025e1cc028b3e8014b44335574b))
* resolve volumes and render stop-start Processes, and settle engine, size and at-rest ([#188](https://github.com/JorisJonkers-dev/deploy-kit/issues/188)) ([f06b963](https://github.com/JorisJonkers-dev/deploy-kit/commit/f06b96303cab2a3ff6c92123cf38955358095395))
* run the secret scan locally, not only in CI ([#74](https://github.com/JorisJonkers-dev/deploy-kit/issues/74)) ([ec9746b](https://github.com/JorisJonkers-dev/deploy-kit/commit/ec9746b3e438933166d9e848510dc0ac95f92d54))
* share more than secrets between the authored levels ([#143](https://github.com/JorisJonkers-dev/deploy-kit/issues/143)) ([bdffe10](https://github.com/JorisJonkers-dev/deploy-kit/commit/bdffe106d3a115be0839b038f7328a4b1d5f5bb6))
* ship the deploy-kit command in the published package, built when it is packed ([#237](https://github.com/JorisJonkers-dev/deploy-kit/issues/237)) ([7cbc7e6](https://github.com/JorisJonkers-dev/deploy-kit/commit/7cbc7e66e14fd94c86108bbb8056fce449aa9bf4))
* take delivery into the model and retire the push design ([#162](https://github.com/JorisJonkers-dev/deploy-kit/issues/162)) ([9fdafa7](https://github.com/JorisJonkers-dev/deploy-kit/commit/9fdafa714bfddb5870c83cea025e0c0e1ce9cf03)), closes [#149](https://github.com/JorisJonkers-dev/deploy-kit/issues/149)
* widen the Project Intent metamodel to every worked example, with its descriptor and JSON Schema ([#113](https://github.com/JorisJonkers-dev/deploy-kit/issues/113)) ([76919ca](https://github.com/JorisJonkers-dev/deploy-kit/commit/76919ca9b3f04f2ffade6856c47ab2e56e57f36f))


### Bug Fixes

* **deps:** update minor and patch dependencies ([#176](https://github.com/JorisJonkers-dev/deploy-kit/issues/176)) ([922615c](https://github.com/JorisJonkers-dev/deploy-kit/commit/922615ceefb1c4aeadb0da0687493213957ebcc2))
* restore the external names the hierarchy rename rewrote ([#107](https://github.com/JorisJonkers-dev/deploy-kit/issues/107)) ([4dbaa43](https://github.com/JorisJonkers-dev/deploy-kit/commit/4dbaa43eb3b920354f194d7786fc369941a95402))

## [0.2.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.1.0...v0.2.0) (2026-09-14)


### ⚠ BREAKING CHANGES

* placement dimensions and one intent file per domain ([#9](https://github.com/JorisJonkers-dev/deploy-kit/issues/9))

### Features

* grade sidecars as Workload vocabulary ([#11](https://github.com/JorisJonkers-dev/deploy-kit/issues/11)) ([57dd98e](https://github.com/JorisJonkers-dev/deploy-kit/commit/57dd98e4041c9fedd1f58b090ba69ea4e8b19969))
* placement dimensions and one intent file per domain ([#9](https://github.com/JorisJonkers-dev/deploy-kit/issues/9)) ([fe584c7](https://github.com/JorisJonkers-dev/deploy-kit/commit/fe584c7ffd244de3410c1db31bf1422c27ee5092))
* Platform Intent, the twenty-six render gaps, and gates for all of it ([#12](https://github.com/JorisJonkers-dev/deploy-kit/issues/12)) ([1945903](https://github.com/JorisJonkers-dev/deploy-kit/commit/19459039633ace1edc087c0da717f3bb587d1e76))
* Service Intent keeps facts, the platform keeps policy ([#15](https://github.com/JorisJonkers-dev/deploy-kit/issues/15)) ([caa3396](https://github.com/JorisJonkers-dev/deploy-kit/commit/caa3396a38a63ffd606d0d7ba17da7aa9147ad04))
* the deployment model, its decision record, and the CI that guards them ([0e0f379](https://github.com/JorisJonkers-dev/deploy-kit/commit/0e0f379985ac0062bcc038b220fd1b77c3f854d9))
* validate pull request titles and commits, and scan with CodeQL ([#58](https://github.com/JorisJonkers-dev/deploy-kit/issues/58)) ([f71f262](https://github.com/JorisJonkers-dev/deploy-kit/commit/f71f262cc721c07c46c85217ec406cf34601571c))


### Bug Fixes

* **ci:** scan secrets with pinned gitleaks binary ([#7](https://github.com/JorisJonkers-dev/deploy-kit/issues/7)) ([1b5bc7c](https://github.com/JorisJonkers-dev/deploy-kit/commit/1b5bc7ce3fd91da8f6eb2ab00b08a329a66ce5a0))
* ignore coverage output ([#8](https://github.com/JorisJonkers-dev/deploy-kit/issues/8)) ([c0f47e4](https://github.com/JorisJonkers-dev/deploy-kit/commit/c0f47e435511e437c657e91d42885e4b425792ef))
* two places the examples contradicted the model, and a gate for both ([#16](https://github.com/JorisJonkers-dev/deploy-kit/issues/16)) ([72fcfe7](https://github.com/JorisJonkers-dev/deploy-kit/commit/72fcfe712c42711a2e04bf6009aee2624b5243c7))

## Changelog

All notable changes are recorded here by
[release-please](https://github.com/googleapis/release-please) from Conventional
Commit messages. See [VERSIONING.md](VERSIONING.md) for the versioning contract.
