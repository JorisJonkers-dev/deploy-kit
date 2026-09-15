# Changelog

## [0.3.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.2.0...v0.3.0) (2026-09-15)


### Features

* **ci:** comment each pull request's shape and publish a release candidate ([#116](https://github.com/JorisJonkers-dev/deploy-kit/issues/116)) ([e481158](https://github.com/JorisJonkers-dev/deploy-kit/commit/e4811582b1fe1adab40dc5bbed934f87a2e81075))
* link a route's and a scrape's names to the Process and surface they mean ([#118](https://github.com/JorisJonkers-dev/deploy-kit/issues/118)) ([088c931](https://github.com/JorisJonkers-dev/deploy-kit/commit/088c9311a16c8a647843c8e28c40e2a95ef95c68))
* parse the minimal project intent in both implementations and match its oracle ([#112](https://github.com/JorisJonkers-dev/deploy-kit/issues/112)) ([aa8947b](https://github.com/JorisJonkers-dev/deploy-kit/commit/aa8947b25f8cd7f2b1ca27f9beb1baf338f81bf8))
* read the Platform document and refuse what it and the project files break together ([#120](https://github.com/JorisJonkers-dev/deploy-kit/issues/120)) ([cd87bbc](https://github.com/JorisJonkers-dev/deploy-kit/commit/cd87bbc67d1fab7e6ad1ec3726b97da1c7f67154)), closes [#41](https://github.com/JorisJonkers-dev/deploy-kit/issues/41)
* refuse a broken document with the code and pointer both implementations agree on ([#114](https://github.com/JorisJonkers-dev/deploy-kit/issues/114)) ([06257dc](https://github.com/JorisJonkers-dev/deploy-kit/commit/06257dccdf2b5ee6284977ebd119e1a423509de5))
* run the secret scan locally, not only in CI ([#74](https://github.com/JorisJonkers-dev/deploy-kit/issues/74)) ([fcb4d4a](https://github.com/JorisJonkers-dev/deploy-kit/commit/fcb4d4a1a1633c67907b5750cc8d11dac7dc2744))
* widen the Project Intent metamodel to every worked example, with its descriptor and JSON Schema ([#113](https://github.com/JorisJonkers-dev/deploy-kit/issues/113)) ([663beb8](https://github.com/JorisJonkers-dev/deploy-kit/commit/663beb89798f0a4fe2e4b6996153a3556c7e85e9))


### Bug Fixes

* restore the external names the hierarchy rename rewrote ([#107](https://github.com/JorisJonkers-dev/deploy-kit/issues/107)) ([99751d5](https://github.com/JorisJonkers-dev/deploy-kit/commit/99751d5ee223a06aadda123ef45de9846605533e))

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
