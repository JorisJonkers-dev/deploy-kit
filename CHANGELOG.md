# Changelog

## [0.3.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.2.0...v0.3.0) (2026-09-25)


### Features

* add prepare Processes for forward-only setup ([#166](https://github.com/JorisJonkers-dev/deploy-kit/issues/166)) ([f04b5b6](https://github.com/JorisJonkers-dev/deploy-kit/commit/f04b5b6e02aeb1cacc37ae5eb7e60057948b3611)), closes [#156](https://github.com/JorisJonkers-dev/deploy-kit/issues/156)
* **ci:** comment each pull request's shape and publish a release candidate ([#116](https://github.com/JorisJonkers-dev/deploy-kit/issues/116)) ([4ff3284](https://github.com/JorisJonkers-dev/deploy-kit/commit/4ff3284362669dc887db9adc2ceda23e66c683f8))
* declare migrations on the Application ([#165](https://github.com/JorisJonkers-dev/deploy-kit/issues/165)) ([83ba2b4](https://github.com/JorisJonkers-dev/deploy-kit/commit/83ba2b4ec809add6d5b50bb9fcb75b906fb68576)), closes [#155](https://github.com/JorisJonkers-dev/deploy-kit/issues/155)
* deliver each Project as a signed artifact pinned by digest ([#169](https://github.com/JorisJonkers-dev/deploy-kit/issues/169)) ([84a89e2](https://github.com/JorisJonkers-dev/deploy-kit/commit/84a89e22fba15b14ef29f68647b4856ad1b5ce0e)), closes [#154](https://github.com/JorisJonkers-dev/deploy-kit/issues/154)
* gate switchover per Application with the Release Gate ([#167](https://github.com/JorisJonkers-dev/deploy-kit/issues/167)) ([44d115e](https://github.com/JorisJonkers-dev/deploy-kit/commit/44d115ecbf692db968109f80361f92b0e4efbc6e)), closes [#152](https://github.com/JorisJonkers-dev/deploy-kit/issues/152)
* give every Application a revision ([#164](https://github.com/JorisJonkers-dev/deploy-kit/issues/164)) ([bf9a7b9](https://github.com/JorisJonkers-dev/deploy-kit/commit/bf9a7b9140a64970784e60f8f380ab517af972d7)), closes [#150](https://github.com/JorisJonkers-dev/deploy-kit/issues/150)
* give the Resolved Deployment and the node contract their metamodels ([#135](https://github.com/JorisJonkers-dev/deploy-kit/issues/135)) ([179cbe8](https://github.com/JorisJonkers-dev/deploy-kit/commit/179cbe85f4945ee19cb9ff8e49c8a3d01d4fb24e))
* hand Projects over from fleet-infra one at a time ([#172](https://github.com/JorisJonkers-dev/deploy-kit/issues/172)) ([ed0a8b7](https://github.com/JorisJonkers-dev/deploy-kit/commit/ed0a8b75d048b454e4555057db0fa0bbbd0bde39)), closes [#159](https://github.com/JorisJonkers-dev/deploy-kit/issues/159)
* keep secret rotation outside a release ([#170](https://github.com/JorisJonkers-dev/deploy-kit/issues/170)) ([db27cce](https://github.com/JorisJonkers-dev/deploy-kit/commit/db27ccebb3adea33fb59848a1869bbf984ac9dfe)), closes [#153](https://github.com/JorisJonkers-dev/deploy-kit/issues/153)
* link a route's and a scrape's names to the Process and surface they mean ([#118](https://github.com/JorisJonkers-dev/deploy-kit/issues/118)) ([da54c8e](https://github.com/JorisJonkers-dev/deploy-kit/commit/da54c8e1713da109a6e80f30699fb5c92dd8b99c))
* make cutover continuous or interrupted and derive blue/green from it ([#163](https://github.com/JorisJonkers-dev/deploy-kit/issues/163)) ([7e1d8b0](https://github.com/JorisJonkers-dev/deploy-kit/commit/7e1d8b0680e05522afd4c8321b8aea3836229278)), closes [#151](https://github.com/JorisJonkers-dev/deploy-kit/issues/151)
* parse the minimal project intent in both implementations and match its oracle ([#112](https://github.com/JorisJonkers-dev/deploy-kit/issues/112)) ([506619b](https://github.com/JorisJonkers-dev/deploy-kit/commit/506619be73ab1e197552c7489e1fee1970a4044a))
* prove every migration safe and undo a held one ([#171](https://github.com/JorisJonkers-dev/deploy-kit/issues/171)) ([e7383c4](https://github.com/JorisJonkers-dev/deploy-kit/commit/e7383c46354ab578deddbbda2dd992f4c297913f)), closes [#157](https://github.com/JorisJonkers-dev/deploy-kit/issues/157)
* read the Platform document and refuse what it and the project files break together ([#120](https://github.com/JorisJonkers-dev/deploy-kit/issues/120)) ([ede5e91](https://github.com/JorisJonkers-dev/deploy-kit/commit/ede5e91c64f0b847b31923254daeb0a51d41bafc)), closes [#41](https://github.com/JorisJonkers-dev/deploy-kit/issues/41)
* refuse a broken document with the code and pointer both implementations agree on ([#114](https://github.com/JorisJonkers-dev/deploy-kit/issues/114)) ([dede1fa](https://github.com/JorisJonkers-dev/deploy-kit/commit/dede1fa6ba7fc291ae46cb0d8286ad1a1fadafba))
* render Flagger-ready objects ([#173](https://github.com/JorisJonkers-dev/deploy-kit/issues/173)) ([b851060](https://github.com/JorisJonkers-dev/deploy-kit/commit/b851060c922e5fc497c6fe65f61cb3bab2057afe)), closes [#158](https://github.com/JorisJonkers-dev/deploy-kit/issues/158)
* run the secret scan locally, not only in CI ([#74](https://github.com/JorisJonkers-dev/deploy-kit/issues/74)) ([ec9746b](https://github.com/JorisJonkers-dev/deploy-kit/commit/ec9746b3e438933166d9e848510dc0ac95f92d54))
* share more than secrets between the authored levels ([#143](https://github.com/JorisJonkers-dev/deploy-kit/issues/143)) ([bdffe10](https://github.com/JorisJonkers-dev/deploy-kit/commit/bdffe106d3a115be0839b038f7328a4b1d5f5bb6))
* take delivery into the model and retire the push design ([#162](https://github.com/JorisJonkers-dev/deploy-kit/issues/162)) ([9fdafa7](https://github.com/JorisJonkers-dev/deploy-kit/commit/9fdafa714bfddb5870c83cea025e0c0e1ce9cf03)), closes [#149](https://github.com/JorisJonkers-dev/deploy-kit/issues/149)
* widen the Project Intent metamodel to every worked example, with its descriptor and JSON Schema ([#113](https://github.com/JorisJonkers-dev/deploy-kit/issues/113)) ([76919ca](https://github.com/JorisJonkers-dev/deploy-kit/commit/76919ca9b3f04f2ffade6856c47ab2e56e57f36f))


### Bug Fixes

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
