# Changelog

## [1.8.1](https://github.com/JorisJonkers-dev/deploy-kit/compare/v1.8.0...v1.8.1) (2026-11-01)


### Bug Fixes

* **model:** order the Secret Store's Project after nothing, and refuse a cycle among the Reconcile Units ([#786](https://github.com/JorisJonkers-dev/deploy-kit/issues/786)) ([a6831ef](https://github.com/JorisJonkers-dev/deploy-kit/commit/a6831ef699aaa524ca9e238cd2ff1b7b7ae88c91)), closes [#780](https://github.com/JorisJonkers-dev/deploy-kit/issues/780)

## [1.8.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v1.7.1...v1.8.0) (2026-11-01)


### Features

* **model:** let a scrape keep its target's labels, for an exporter that describes other objects ([#784](https://github.com/JorisJonkers-dev/deploy-kit/issues/784)) ([b865b26](https://github.com/JorisJonkers-dev/deploy-kit/commit/b865b2602494933e5ae5fd02b133995ed50a78d2))

## [1.7.1](https://github.com/JorisJonkers-dev/deploy-kit/compare/v1.7.0...v1.7.1) (2026-11-01)


### Bug Fixes

* **render:** write a host port on its surface's entry, so a container port appears once ([#777](https://github.com/JorisJonkers-dev/deploy-kit/issues/777)) ([d74ab2f](https://github.com/JorisJonkers-dev/deploy-kit/commit/d74ab2fdd20a56f3546f0f43ea3a80c367d4cef2))

## [1.7.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v1.6.0...v1.7.0) (2026-11-01)


### Features

* **compose:** take the current time as --now ([#776](https://github.com/JorisJonkers-dev/deploy-kit/issues/776)) ([a1cf392](https://github.com/JorisJonkers-dev/deploy-kit/commit/a1cf392412d208f1209cfa6b09c100ee68e138d3))
* **emf:** finish bringing the model-driven implementation level with main ([#751](https://github.com/JorisJonkers-dev/deploy-kit/issues/751)) ([bee0d84](https://github.com/JorisJonkers-dev/deploy-kit/commit/bee0d8499383cc79b1a078fd1e2290515c2e91d2))

## [1.6.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v1.5.0...v1.6.0) (2026-10-30)


### Features

* **model:** let a tier that issues no certificate read the one it serves from the Secret Store ([#762](https://github.com/JorisJonkers-dev/deploy-kit/issues/762)) ([1f885e6](https://github.com/JorisJonkers-dev/deploy-kit/commit/1f885e6f7339a0484eceb5727d9d198cd3386ce1))
* **model:** render Grafana's instance and derive its admin credential and data sources ([#769](https://github.com/JorisJonkers-dev/deploy-kit/issues/769)) ([e191607](https://github.com/JorisJonkers-dev/deploy-kit/commit/e1916074dd6b012fd6157f3c1535baef883a6359))
* **model:** render the monitoring stack's Prometheus and Alertmanager as the operator's objects ([#767](https://github.com/JorisJonkers-dev/deploy-kit/issues/767)) ([d918a1d](https://github.com/JorisJonkers-dev/deploy-kit/commit/d918a1da53fd590d0bce710326cb03da94239b88))
* **model:** scrape k3s's kubelet, API server and DNS where the bootstrap set records them ([#770](https://github.com/JorisJonkers-dev/deploy-kit/issues/770)) ([4e3364c](https://github.com/JorisJonkers-dev/deploy-kit/commit/4e3364cc90bddb7a7013bf7d39f007e0c4b71104))


### Bug Fixes

* **model:** derive the API access a tier's proxy reads its routes with ([#756](https://github.com/JorisJonkers-dev/deploy-kit/issues/756)) ([0a68b3d](https://github.com/JorisJonkers-dev/deploy-kit/commit/0a68b3def60ebcde6bd64fe0d88fa08211ca7486))
* **model:** resolve a mongo's own Service name to itself, so its replica set member finds itself ([#757](https://github.com/JorisJonkers-dev/deploy-kit/issues/757)) ([5bc9819](https://github.com/JorisJonkers-dev/deploy-kit/commit/5bc9819c92dbd7558692605cbbc8c3c81e376ac6))

## [1.5.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v1.4.0...v1.5.0) (2026-10-30)


### Features

* **model:** run the l4-speaker with memberlist, keyed by the node Project's own generated key ([#758](https://github.com/JorisJonkers-dev/deploy-kit/issues/758)) ([a65de6c](https://github.com/JorisJonkers-dev/deploy-kit/commit/a65de6c57f2902bde18b3965591ba6b64ef30c76))


### Bug Fixes

* **model:** give an hourly policy or catalog run up within the hour ([#752](https://github.com/JorisJonkers-dev/deploy-kit/issues/752)) ([ad069fa](https://github.com/JorisJonkers-dev/deploy-kit/commit/ad069fa03e30bca9332183e51e3ae8d90140a6a5))
* **model:** hand out each GPU by its index, as the hosts' CDI specification names it ([#754](https://github.com/JorisJonkers-dev/deploy-kit/issues/754)) ([0f81e24](https://github.com/JorisJonkers-dev/deploy-kit/commit/0f81e24d5d2f53e36bd65227abdccee3441badd4))
* **model:** start the l4-speaker and its controller on MetalLB 0.15.3 ([#753](https://github.com/JorisJonkers-dev/deploy-kit/issues/753)) ([5c5a98b](https://github.com/JorisJonkers-dev/deploy-kit/commit/5c5a98b98113edb20d5bf6ea309d0c83a7dacda7))

## [1.4.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v1.3.1...v1.4.0) (2026-10-30)


### Features

* **emf:** bring the model-driven implementation level with main ([#745](https://github.com/JorisJonkers-dev/deploy-kit/issues/745)) ([ac8a3ec](https://github.com/JorisJonkers-dev/deploy-kit/commit/ac8a3ecf3777f1f7c1a4c9e9de5c27380a67baec))


### Bug Fixes

* **examples:** run the worked Secret Store as a raft Vault on its volume, never in dev mode ([#749](https://github.com/JorisJonkers-dev/deploy-kit/issues/749)) ([c4202c1](https://github.com/JorisJonkers-dev/deploy-kit/commit/c4202c164649eb748ac66d53879214d72b04b986))
* **model:** mark every rendered namespace never to be pruned ([#746](https://github.com/JorisJonkers-dev/deploy-kit/issues/746)) ([828dbab](https://github.com/JorisJonkers-dev/deploy-kit/commit/828dbabf4254a37af82fff27ee3a2947075ba73e))

## [1.3.1](https://github.com/JorisJonkers-dev/deploy-kit/compare/v1.3.0...v1.3.1) (2026-10-30)


### Bug Fixes

* **model:** add NET_BIND_SERVICE for a low port, and HOME=/tmp where /tmp is writable ([#741](https://github.com/JorisJonkers-dev/deploy-kit/issues/741)) ([cd459b8](https://github.com/JorisJonkers-dev/deploy-kit/commit/cd459b81bf8a5940db311ccb54619ed7a47ece4f))

## [1.3.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v1.2.0...v1.3.0) (2026-10-29)


### Features

* **model:** let a native Client name a back-channel logout path ([#720](https://github.com/JorisJonkers-dev/deploy-kit/issues/720)) ([dbf7623](https://github.com/JorisJonkers-dev/deploy-kit/commit/dbf7623a60f0721c21af46aa5953f71f7df9b9cf))
* **model:** render each Application's external checks, one per route, for Gatus to gather ([#719](https://github.com/JorisJonkers-dev/deploy-kit/issues/719)) ([98660ad](https://github.com/JorisJonkers-dev/deploy-kit/commit/98660ad8b311d1672d056b67d7821d417d341520))


### Bug Fixes

* **model:** drop the path plan nothing computes, and align four spec passages with the compiler ([#717](https://github.com/JorisJonkers-dev/deploy-kit/issues/717)) ([188e714](https://github.com/JorisJonkers-dev/deploy-kit/commit/188e7148744ae515c1d35b893df720293f8293f3))

## [1.2.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v1.1.0...v1.2.0) (2026-10-29)


### Features

* **model:** let a sidecar mount its Process's Assets ([#716](https://github.com/JorisJonkers-dev/deploy-kit/issues/716)) ([572c79a](https://github.com/JorisJonkers-dev/deploy-kit/commit/572c79ab9468f9cb6504d09165c25767c4a271c4)), closes [#707](https://github.com/JorisJonkers-dev/deploy-kit/issues/707)


### Bug Fixes

* **check:** validate refuses a Node Agent with no catalog entry where the set holds the node contract ([#714](https://github.com/JorisJonkers-dev/deploy-kit/issues/714)) ([180954a](https://github.com/JorisJonkers-dev/deploy-kit/commit/180954a2332bd3192ff38ea3380673bb685ea3db)), closes [#710](https://github.com/JorisJonkers-dev/deploy-kit/issues/710)

## [1.1.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v1.0.1...v1.1.0) (2026-10-29)


### Features

* **model:** a Process names its command and arguments, and a writable path may be held in memory ([#700](https://github.com/JorisJonkers-dev/deploy-kit/issues/700)) ([3152b95](https://github.com/JorisJonkers-dev/deploy-kit/commit/3152b95e32365d53fa7f0ccb381c566697d618dd))
* **model:** ask the Release Gate whether to roll back a release that can no longer pass ([#678](https://github.com/JorisJonkers-dev/deploy-kit/issues/678)) ([c123e20](https://github.com/JorisJonkers-dev/deploy-kit/commit/c123e20a7199f50d6cd5e0ffa4a6c28c7fce660d))
* **model:** let a grant's key be optional, and render every reference to it optional ([#701](https://github.com/JorisJonkers-dev/deploy-kit/issues/701)) ([a37f826](https://github.com/JorisJonkers-dev/deploy-kit/commit/a37f82607ed2d67ec2ffbe092fa66632b09ac507)), closes [#696](https://github.com/JorisJonkers-dev/deploy-kit/issues/696)
* **model:** let an Application and a Process describe themselves ([#703](https://github.com/JorisJonkers-dev/deploy-kit/issues/703)) ([27a0406](https://github.com/JorisJonkers-dev/deploy-kit/commit/27a04069c1947d0b9bc2d2d48d9e094c3eb612bd)), closes [#432](https://github.com/JorisJonkers-dev/deploy-kit/issues/432)
* **model:** let an exposure bypass the DNS provider's proxy, pointing at the tier's direct address ([#704](https://github.com/JorisJonkers-dev/deploy-kit/issues/704)) ([a61ac03](https://github.com/JorisJonkers-dev/deploy-kit/commit/a61ac03ea704eb56b2f7a6f7d94b1bb7d9cb763f)), closes [#694](https://github.com/JorisJonkers-dev/deploy-kit/issues/694)
* **model:** mount the ServiceAccount token for an api holder with no rules ([#713](https://github.com/JorisJonkers-dev/deploy-kit/issues/713)) ([7bae339](https://github.com/JorisJonkers-dev/deploy-kit/commit/7bae339df021c9a45a42bb84cdd8f1413e087888)), closes [#708](https://github.com/JorisJonkers-dev/deploy-kit/issues/708)
* **model:** retry a failed release from its pin, rendered onto every gated pod template ([#677](https://github.com/JorisJonkers-dev/deploy-kit/issues/677)) ([9ec50ab](https://github.com/JorisJonkers-dev/deploy-kit/commit/9ec50ab0b0f64afbb97ceb34229322f65de300e2))
* **model:** scrape Flux where the bootstrap set records its metrics, and derive the metrics stack's egress ([#699](https://github.com/JorisJonkers-dev/deploy-kit/issues/699)) ([bb4c741](https://github.com/JorisJonkers-dev/deploy-kit/commit/bb4c7415c685f9f43cb76dbd560345c9dd24c3b3))
* **model:** seed an Asset onto a Process's volume before each start ([#712](https://github.com/JorisJonkers-dev/deploy-kit/issues/712)) ([38e6764](https://github.com/JorisJonkers-dev/deploy-kit/commit/38e67648af0a0d5aa5e67b0cf07050a0097d64bf)), closes [#693](https://github.com/JorisJonkers-dev/deploy-kit/issues/693) [#709](https://github.com/JorisJonkers-dev/deploy-kit/issues/709)


### Bug Fixes

* **ci:** validate manifests against production's Kubernetes and a pinned CRD catalog ([#685](https://github.com/JorisJonkers-dev/deploy-kit/issues/685)) ([d8b24dd](https://github.com/JorisJonkers-dev/deploy-kit/commit/d8b24dd7ea2ada1aee90126836808cf2f3cb820d))

## [1.0.1](https://github.com/JorisJonkers-dev/deploy-kit/compare/v1.0.0...v1.0.1) (2026-10-27)


### Bug Fixes

* **model:** read back a lock that records a schema refusal ([#672](https://github.com/JorisJonkers-dev/deploy-kit/issues/672)) ([4a96373](https://github.com/JorisJonkers-dev/deploy-kit/commit/4a9637329e387230849f7bc8faafa3a9a0bd19a1))

## [1.0.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.32.0...v1.0.0) (2026-10-27)


### ⚠ BREAKING CHANGES

* **model:** drop the rollback-backup annotation and the snapshot's backups list ([#652](https://github.com/JorisJonkers-dev/deploy-kit/issues/652))
* **model:** encrypt every off-cluster copy to a recipient the platform names ([#636](https://github.com/JorisJonkers-dev/deploy-kit/issues/636))
* **model:** `observability.alertClass`, `reviewBy` on a dormant participant and per-cluster env overlays are refused; a `self` grant needs the Process's own Vault client; the schema version is the package version.

### Features

* **cli:** generate an Application's App Roles in its language ([#632](https://github.com/JorisJonkers-dev/deploy-kit/issues/632)) ([f1dd8ae](https://github.com/JorisJonkers-dev/deploy-kit/commit/f1dd8ae6a9f829dd0da50b3b0152653c907e4dab))
* **model:** admit the Release Gate's own requests to every gate member ([#606](https://github.com/JorisJonkers-dev/deploy-kit/issues/606)) ([928c1f2](https://github.com/JorisJonkers-dev/deploy-kit/commit/928c1f29e209a0059a28f251d759257c210deb58))
* **model:** cut the model to what 1.0 keeps ([#628](https://github.com/JorisJonkers-dev/deploy-kit/issues/628)) ([660f519](https://github.com/JorisJonkers-dev/deploy-kit/commit/660f519c1c7bcbee7603e6d6a4aeddf1ba559dce)), closes [#379](https://github.com/JorisJonkers-dev/deploy-kit/issues/379)
* **model:** declare the rest of the foundation and its bootstrap set ([#627](https://github.com/JorisJonkers-dev/deploy-kit/issues/627)) ([73ec006](https://github.com/JorisJonkers-dev/deploy-kit/commit/73ec006e08c06c1f8a5e806a27dcc2d0ec6a3ee0))
* **model:** derive a bucket catalog from the edges into an object store ([#647](https://github.com/JorisJonkers-dev/deploy-kit/issues/647)) ([3556e65](https://github.com/JorisJonkers-dev/deploy-kit/commit/3556e6550d4e1498c1c7f3cde369cd8da2fdf5f7))
* **model:** derive a Move from a Process and its active Instance ([#648](https://github.com/JorisJonkers-dev/deploy-kit/issues/648)) ([e81d842](https://github.com/JorisJonkers-dev/deploy-kit/commit/e81d842546c0c94991803f1c5465fc9e1307465f))
* **model:** derive and render the Stable Address, and point every alias at it ([#646](https://github.com/JorisJonkers-dev/deploy-kit/issues/646)) ([dc4d040](https://github.com/JorisJonkers-dev/deploy-kit/commit/dc4d040731bf4f1a3090f49701ebe69ce2305e7f))
* **model:** drop the rollback-backup annotation and the snapshot's backups list ([#652](https://github.com/JorisJonkers-dev/deploy-kit/issues/652)) ([e255f84](https://github.com/JorisJonkers-dev/deploy-kit/commit/e255f846e97e969bb329dec5de3e825e572851c8))
* **model:** encrypt every off-cluster copy to a recipient the platform names ([#636](https://github.com/JorisJonkers-dev/deploy-kit/issues/636)) ([b11de5d](https://github.com/JorisJonkers-dev/deploy-kit/commit/b11de5db30083f86ee6e1769861eb2baaec9ab8b))
* **model:** let a Process create pods only from a spawn template it declares ([#641](https://github.com/JorisJonkers-dev/deploy-kit/issues/641)) ([5e3684a](https://github.com/JorisJonkers-dev/deploy-kit/commit/5e3684ab21d7183436949c350ab7ff1787f649d4))
* **model:** let a sidecar mount the Process's volumes it names, and run before it as an init step ([#651](https://github.com/JorisJonkers-dev/deploy-kit/issues/651)) ([79cf13f](https://github.com/JorisJonkers-dev/deploy-kit/commit/79cf13f8df3c5e369d23d6afd912071b1a3d3a2e))
* **model:** move an Application between Projects by declaring it in the new one first ([#650](https://github.com/JorisJonkers-dev/deploy-kit/issues/650)) ([30bc541](https://github.com/JorisJonkers-dev/deploy-kit/commit/30bc54147d22651198f7d7fa2ea868eba75e963d))
* **model:** name the member that serves a native Client's protected path ([#630](https://github.com/JorisJonkers-dev/deploy-kit/issues/630)) ([3afe557](https://github.com/JorisJonkers-dev/deploy-kit/commit/3afe55707aed0d14d58cee83f59d134e5386452a))
* **model:** pin the facts a Move is derived from ([#644](https://github.com/JorisJonkers-dev/deploy-kit/issues/644)) ([1e01c28](https://github.com/JorisJonkers-dev/deploy-kit/commit/1e01c285397f17a7bfe4131d6c3e1a0b0f87d951))
* **model:** reach the Kubernetes API without holding a rule ([#643](https://github.com/JorisJonkers-dev/deploy-kit/issues/643)) ([3fd3e16](https://github.com/JorisJonkers-dev/deploy-kit/commit/3fd3e169718171a9b3591f976047587f20ea601f))
* **model:** refuse a fragment written at a model version the toolkit does not read ([#670](https://github.com/JorisJonkers-dev/deploy-kit/issues/670)) ([8568aaf](https://github.com/JorisJonkers-dev/deploy-kit/commit/8568aafc5eae91ef294b6bf85d75f2e1ad2ca6a8)), closes [#665](https://github.com/JorisJonkers-dev/deploy-kit/issues/665)
* **model:** render an open Move: its Instances, step Jobs and move identity ([#649](https://github.com/JorisJonkers-dev/deploy-kit/issues/649)) ([f00fc54](https://github.com/JorisJonkers-dev/deploy-kit/commit/f00fc54e9c06df95afebe01d272e7816a0556ccd))
* **model:** resolve a DNS-serving Process through the platform's upstream nameservers ([#639](https://github.com/JorisJonkers-dev/deploy-kit/issues/639)) ([c46b561](https://github.com/JorisJonkers-dev/deploy-kit/commit/c46b561863600cbe8cf29d54d1c4286345c72ab9))
* **model:** scope an api rule to its Process's namespace or the cluster ([#640](https://github.com/JorisJonkers-dev/deploy-kit/issues/640)) ([7bc3655](https://github.com/JorisJonkers-dev/deploy-kit/commit/7bc3655771a0f4229984fb24e7c67dd4adc5aaf0))
* **model:** scrape a rolling Process through a ServiceMonitor ([#638](https://github.com/JorisJonkers-dev/deploy-kit/issues/638)) ([0c7ebf8](https://github.com/JorisJonkers-dev/deploy-kit/commit/0c7ebf88c8542c17af35999db18575a5e3759507))
* **model:** take a route's TLS from its tier ([#625](https://github.com/JorisJonkers-dev/deploy-kit/issues/625)) ([a0cddd3](https://github.com/JorisJonkers-dev/deploy-kit/commit/a0cddd30555d8bb118a0b59f129301b6d8ec28c5)), closes [#582](https://github.com/JorisJonkers-dev/deploy-kit/issues/582)

## [0.32.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.31.0...v0.32.0) (2026-10-26)


### Features

* **compose:** remove the estate-scoped pin source once its artifact is empty ([#604](https://github.com/JorisJonkers-dev/deploy-kit/issues/604)) ([5cc93ff](https://github.com/JorisJonkers-dev/deploy-kit/commit/5cc93ffb2bf01000135e20ede67dcf9eb2ff093e))
* **compose:** routes flip with the edge's own handover ([#610](https://github.com/JorisJonkers-dev/deploy-kit/issues/610)) ([e29f8fc](https://github.com/JorisJonkers-dev/deploy-kit/commit/e29f8fc8d1b7142cdd9c921586bfd1223893f45f))
* **edge:** derive Traefik's static configuration for a tier's proxy ([#614](https://github.com/JorisJonkers-dev/deploy-kit/issues/614)) ([a422ad1](https://github.com/JorisJonkers-dev/deploy-kit/commit/a422ad1bac1e949e7171417df7eb132119b1e7cc))
* **edge:** render the shared Middlewares every route names ([#609](https://github.com/JorisJonkers-dev/deploy-kit/issues/609)) ([8db4b60](https://github.com/JorisJonkers-dev/deploy-kit/commit/8db4b60d716e74450a169f2a58f76c442898e253)), closes [#580](https://github.com/JorisJonkers-dev/deploy-kit/issues/580)
* **model:** a host is unique on a tier, so one host may sit on two ([#605](https://github.com/JorisJonkers-dev/deploy-kit/issues/605)) ([35cc41b](https://github.com/JorisJonkers-dev/deploy-kit/commit/35cc41bf59580c962708923eb2dfc88707a3dbb4)), closes [#384](https://github.com/JorisJonkers-dev/deploy-kit/issues/384)
* **model:** a Process may listen below 1024, because the substrate binds any port without a capability ([#591](https://github.com/JorisJonkers-dev/deploy-kit/issues/591)) ([607836b](https://github.com/JorisJonkers-dev/deploy-kit/commit/607836ba5be458c6c9f6437ae5bbe1e21e0760e9)), closes [#383](https://github.com/JorisJonkers-dev/deploy-kit/issues/383)
* **model:** a rendered route carries its tier's DNS annotations ([#618](https://github.com/JorisJonkers-dev/deploy-kit/issues/618)) ([1bb1b78](https://github.com/JorisJonkers-dev/deploy-kit/commit/1bb1b786a9288ca0ce939235a8995ad809193e25))
* **model:** a rendered route carries its tier's ingress class ([#607](https://github.com/JorisJonkers-dev/deploy-kit/issues/607)) ([1f444cb](https://github.com/JorisJonkers-dev/deploy-kit/commit/1f444cb3f2d9618f4b46457c41af3bc843d705f8))
* **model:** a tier's forward-auth names its provider, not a URL ([#612](https://github.com/JorisJonkers-dev/deploy-kit/issues/612)) ([2e19bcf](https://github.com/JorisJonkers-dev/deploy-kit/commit/2e19bcfb833aeeed8edca9149f7b210aca99bfc8)), closes [#396](https://github.com/JorisJonkers-dev/deploy-kit/issues/396)
* **model:** add the mongo engine ([#592](https://github.com/JorisJonkers-dev/deploy-kit/issues/592)) ([25dcb6e](https://github.com/JorisJonkers-dev/deploy-kit/commit/25dcb6e17b25fd6c4ed1156a1b508ffb09384d37))
* **model:** an Application's client block, and what composition refuses in it ([#577](https://github.com/JorisJonkers-dev/deploy-kit/issues/577)) ([b825adf](https://github.com/JorisJonkers-dev/deploy-kit/commit/b825adfd064c09cb774a4c88811f296aa08506b6))
* **model:** declare a scheduled Process ([#593](https://github.com/JorisJonkers-dev/deploy-kit/issues/593)) ([cb4568a](https://github.com/JorisJonkers-dev/deploy-kit/commit/cb4568a9425638dc84ef5742ee4e2d9c229170fa))
* **model:** declare alert rules, the monitoring stack and receivers ([#616](https://github.com/JorisJonkers-dev/deploy-kit/issues/616)) ([93ac372](https://github.com/JorisJonkers-dev/deploy-kit/commit/93ac372eb6feeab5922dd10b72020f6f31e37fc2))
* **model:** declare Human Grants in the Platform document ([#600](https://github.com/JorisJonkers-dev/deploy-kit/issues/600)) ([9754587](https://github.com/JorisJonkers-dev/deploy-kit/commit/9754587f81ceef7415117ec3eb44b354428d13fc))
* **model:** derive a Process's priority class ([#621](https://github.com/JorisJonkers-dev/deploy-kit/issues/621)) ([31f6e3c](https://github.com/JorisJonkers-dev/deploy-kit/commit/31f6e3ca8ebb455689ec7123f84e49ee5b48511a))
* **model:** derive the Node Agents from node facts and pools ([#623](https://github.com/JorisJonkers-dev/deploy-kit/issues/623)) ([98551cb](https://github.com/JorisJonkers-dev/deploy-kit/commit/98551cb433acbed1b2924b2ae07d876bb80d0013)), closes [#404](https://github.com/JorisJonkers-dev/deploy-kit/issues/404)
* **model:** enrol the Projects the Platform document names in the ambient mesh ([#599](https://github.com/JorisJonkers-dev/deploy-kit/issues/599)) ([aa26bb5](https://github.com/JorisJonkers-dev/deploy-kit/commit/aa26bb5ff30d5e4f7baa7da5e645acee0775d85a))
* **model:** every monitor carries the labels the monitoring stack selects by ([#601](https://github.com/JorisJonkers-dev/deploy-kit/issues/601)) ([1fb3072](https://github.com/JorisJonkers-dev/deploy-kit/commit/1fb30729e5a5bfe007e37e148e9febb4d24adc15)), closes [#588](https://github.com/JorisJonkers-dev/deploy-kit/issues/588)
* **model:** expose a raw surface on a node's own address ([#622](https://github.com/JorisJonkers-dev/deploy-kit/issues/622)) ([3999cb1](https://github.com/JorisJonkers-dev/deploy-kit/commit/3999cb174918d30b9ef9d32d26479abb0357875d))
* **model:** expose a raw surface on a Platform-declared L4 Address ([#603](https://github.com/JorisJonkers-dev/deploy-kit/issues/603)) ([2e0b429](https://github.com/JorisJonkers-dev/deploy-kit/commit/2e0b4298bbb9c1875013a56a95a56f2819220237))
* **model:** give a tier its L4 Address and its own certificate ([#624](https://github.com/JorisJonkers-dev/deploy-kit/issues/624)) ([50ea3b3](https://github.com/JorisJonkers-dev/deploy-kit/commit/50ea3b390215a1e919dd77d428678a9fce73fd44)), closes [#405](https://github.com/JorisJonkers-dev/deploy-kit/issues/405)
* **model:** grant read on a transit key ([#595](https://github.com/JorisJonkers-dev/deploy-kit/issues/595)) ([544f24c](https://github.com/JorisJonkers-dev/deploy-kit/commit/544f24cb05362d926d6c11d1cf18b4d41ed80781)), closes [#587](https://github.com/JorisJonkers-dev/deploy-kit/issues/587)
* **model:** park a Process without pruning what it owns ([#619](https://github.com/JorisJonkers-dev/deploy-kit/issues/619)) ([fcc8493](https://github.com/JorisJonkers-dev/deploy-kit/commit/fcc84937852cf243fb8771d8021ce83afda93dd4)), closes [#389](https://github.com/JorisJonkers-dev/deploy-kit/issues/389)
* **model:** render a route's redirect as its own Middleware ([#608](https://github.com/JorisJonkers-dev/deploy-kit/issues/608)) ([201cab9](https://github.com/JorisJonkers-dev/deploy-kit/commit/201cab990cd20d9f9f16834e5d474686de137892)), closes [#581](https://github.com/JorisJonkers-dev/deploy-kit/issues/581)
* **model:** ship an Application's Grafana dashboards ([#615](https://github.com/JorisJonkers-dev/deploy-kit/issues/615)) ([4b8e249](https://github.com/JorisJonkers-dev/deploy-kit/commit/4b8e249bbde9e3bde65b84f3789cbf1ad9087cd6)), closes [#406](https://github.com/JorisJonkers-dev/deploy-kit/issues/406)
* **model:** spread a Process's replicas across nodes ([#611](https://github.com/JorisJonkers-dev/deploy-kit/issues/611)) ([dd1101f](https://github.com/JorisJonkers-dev/deploy-kit/commit/dd1101fa320531260e7c0e2dd09c10f9ad1096df))
* **model:** what a Client derives: the Client object, the Gate's route, the credential and its grants ([#597](https://github.com/JorisJonkers-dev/deploy-kit/issues/597)) ([c286544](https://github.com/JorisJonkers-dev/deploy-kit/commit/c286544086d8b1fb4e2394634cd2a184ca92e72c))


### Bug Fixes

* **model:** refuse an image whose locked uid is 0 ([#596](https://github.com/JorisJonkers-dev/deploy-kit/issues/596)) ([c109d51](https://github.com/JorisJonkers-dev/deploy-kit/commit/c109d51b0333d6d881682d05c6f2eaafb2ca426c)), closes [#586](https://github.com/JorisJonkers-dev/deploy-kit/issues/586)

## [0.31.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.30.0...v0.31.0) (2026-10-22)


### Features

* **composition:** isolate the provider, not the run, when it drops a Surface a consumer still names ([#568](https://github.com/JorisJonkers-dev/deploy-kit/issues/568)) ([c968e86](https://github.com/JorisJonkers-dev/deploy-kit/commit/c968e868cc755a7107e13cccbbe0b2a2e9c623b2))
* **delivery:** a Rollback relies on the scheduled backups, so no estate-scoped backup unit remains ([#566](https://github.com/JorisJonkers-dev/deploy-kit/issues/566)) ([7863779](https://github.com/JorisJonkers-dev/deploy-kit/commit/78637796e47084c53da036d50bc8edb8dcbd6431))
* **delivery:** apply a Project's routes from its own unit, after the edge Project ([#567](https://github.com/JorisJonkers-dev/deploy-kit/issues/567)) ([9a86895](https://github.com/JorisJonkers-dev/deploy-kit/commit/9a86895a570492e295dc710708b68108f59c30a0))
* **model:** a provider admits its consumers by a label each carries, so a new consumer re-renders only itself ([#569](https://github.com/JorisJonkers-dev/deploy-kit/issues/569)) ([9945074](https://github.com/JorisJonkers-dev/deploy-kit/commit/9945074ed855aa59832315e406249900a05542f8))
* **model:** a Vault policy job per Project, in its own unit ([#564](https://github.com/JorisJonkers-dev/deploy-kit/issues/564)) ([b8d7ce0](https://github.com/JorisJonkers-dev/deploy-kit/commit/b8d7ce073aa26b0ea1042b0f06938abdf3300dea))
* **model:** render the rollout events per Project, in its own unit ([#565](https://github.com/JorisJonkers-dev/deploy-kit/issues/565)) ([f769454](https://github.com/JorisJonkers-dev/deploy-kit/commit/f7694540412c37a093d4103bd451fcb8f126566e))


### Bug Fixes

* **model:** a datastore's catalog method carries its surface's consumer label, so the datastore admits it ([#575](https://github.com/JorisJonkers-dev/deploy-kit/issues/575)) ([176dd54](https://github.com/JorisJonkers-dev/deploy-kit/commit/176dd5442c914e13457ca567c105ca56dd215ffd))
* **model:** apply a datastore's catalog from its own Project's unit ([#561](https://github.com/JorisJonkers-dev/deploy-kit/issues/561)) ([a7ccd2c](https://github.com/JorisJonkers-dev/deploy-kit/commit/a7ccd2cdd9e316f0cfae0a2a55e0420f7f36f042))

## [0.30.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.29.0...v0.30.0) (2026-10-21)


### Features

* a Rollback's backup dumps the Project's own database with its own credential ([#543](https://github.com/JorisJonkers-dev/deploy-kit/issues/543)) ([9fd70de](https://github.com/JorisJonkers-dev/deploy-kit/commit/9fd70debde6fc7462bf17922a75af00a776125a9))

## [0.29.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.28.0...v0.29.0) (2026-10-21)


### Features

* **model:** an images-lock entry without a version is refused ([#540](https://github.com/JorisJonkers-dev/deploy-kit/issues/540)) ([ce78178](https://github.com/JorisJonkers-dev/deploy-kit/commit/ce78178af3ea22ec6e8582d058e50c00ce4bdd9a))

## [0.28.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.27.1...v0.28.0) (2026-10-21)


### ⚠ BREAKING CHANGES

* **model:** every Platform document writes these eight fields as <project>/<application>.

### Bug Fixes

* **delivery:** a removed grant's sync objects outlive the release that removes it ([#542](https://github.com/JorisJonkers-dev/deploy-kit/issues/542)) ([e0c2380](https://github.com/JorisJonkers-dev/deploy-kit/commit/e0c2380b663bf2eebdc7193eb0fbb981c14c7ed6))
* **model:** a privileged role names the Project that holds it ([#539](https://github.com/JorisJonkers-dev/deploy-kit/issues/539)) ([5f86b64](https://github.com/JorisJonkers-dev/deploy-kit/commit/5f86b64e2a129913b75e3ea4e7d65a018965c662))

## [0.27.1](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.27.0...v0.27.1) (2026-10-21)


### Bug Fixes

* a required: false edge orders no Reconcile Unit ([#538](https://github.com/JorisJonkers-dev/deploy-kit/issues/538)) ([b0cfee0](https://github.com/JorisJonkers-dev/deploy-kit/commit/b0cfee01f6d0316e07f9a6c0e61c0c37a67e282d)), closes [#537](https://github.com/JorisJonkers-dev/deploy-kit/issues/537)
* recreate the catalog and Vault policy Jobs where only the render changed their template ([#534](https://github.com/JorisJonkers-dev/deploy-kit/issues/534)) ([2472c9e](https://github.com/JorisJonkers-dev/deploy-kit/commit/2472c9ea4ef95d54b315f741f3e5fc7a658cfb2b)), closes [#529](https://github.com/JorisJonkers-dev/deploy-kit/issues/529)
* refuse a claim two volumes of one project reserve ([#536](https://github.com/JorisJonkers-dev/deploy-kit/issues/536)) ([ae94351](https://github.com/JorisJonkers-dev/deploy-kit/commit/ae9435196b263f87f3ad3750e8accffe7b0b4114))

## [0.27.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.26.1...v0.27.0) (2026-10-21)


### Features

* hold every rendered pod template to Pod Security's restricted profile ([#530](https://github.com/JorisJonkers-dev/deploy-kit/issues/530)) ([4350fc1](https://github.com/JorisJonkers-dev/deploy-kit/commit/4350fc1fa7f847be01a12432d629dff6e606ac93)), closes [#484](https://github.com/JorisJonkers-dev/deploy-kit/issues/484)


### Bug Fixes

* **model:** only an engine with a move method needs its image's version as major.minor.patch ([#532](https://github.com/JorisJonkers-dev/deploy-kit/issues/532)) ([5fe1a03](https://github.com/JorisJonkers-dev/deploy-kit/commit/5fe1a03588265da074c9f6e502fa9c530d96c675))

## [0.26.1](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.26.0...v0.26.1) (2026-10-21)


### Bug Fixes

* a fresh Project is Ready before its first backup ([#527](https://github.com/JorisJonkers-dev/deploy-kit/issues/527)) ([cc1e2c1](https://github.com/JorisJonkers-dev/deploy-kit/commit/cc1e2c1b04288dfbf64055342ce73b54a93ffbba)), closes [#485](https://github.com/JorisJonkers-dev/deploy-kit/issues/485)

## [0.26.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.25.0...v0.26.0) (2026-10-20)


### Features

* **model:** every images-lock entry may carry its version, and the render writes it on each pod ([#518](https://github.com/JorisJonkers-dev/deploy-kit/issues/518)) ([130d034](https://github.com/JorisJonkers-dev/deploy-kit/commit/130d034d2cf86e5af3cbf9d5c8f4d8cf3a9f463d))


### Bug Fixes

* **model:** the restricted posture forbids privilege escalation ([#524](https://github.com/JorisJonkers-dev/deploy-kit/issues/524)) ([110fb66](https://github.com/JorisJonkers-dev/deploy-kit/commit/110fb66bf484e22559dc844da06838a37a547e08))
* **tooling:** local link lint and pr-report test agree with CI ([#522](https://github.com/JorisJonkers-dev/deploy-kit/issues/522)) ([49be0b1](https://github.com/JorisJonkers-dev/deploy-kit/commit/49be0b11512b382258ec4496c8ae53942847e1d9)), closes [#515](https://github.com/JorisJonkers-dev/deploy-kit/issues/515)

## [0.25.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.24.1...v0.25.0) (2026-10-20)


### Features

* a route may bound how many requests one client sends it ([#512](https://github.com/JorisJonkers-dev/deploy-kit/issues/512)) ([5dec854](https://github.com/JorisJonkers-dev/deploy-kit/commit/5dec85478759d16afb24054b54b07cd0419a66da))


### Bug Fixes

* **deps:** update minor and patch dependencies ([#510](https://github.com/JorisJonkers-dev/deploy-kit/issues/510)) ([d959f2f](https://github.com/JorisJonkers-dev/deploy-kit/commit/d959f2fa7cd1dbee9c8fc7d85f804e591b61e215))
* **model:** start a gated member only after the stop-start Processes it requires in its own Project ([#519](https://github.com/JorisJonkers-dev/deploy-kit/issues/519)) ([be7b1a9](https://github.com/JorisJonkers-dev/deploy-kit/commit/be7b1a9ff8d560a0cefc9cb3acf85a93723c010b))

## [0.24.1](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.24.0...v0.24.1) (2026-10-20)


### Bug Fixes

* **model:** move the pin of a Project whose pinned artifact labels no release ([#509](https://github.com/JorisJonkers-dev/deploy-kit/issues/509)) ([d42d41c](https://github.com/JorisJonkers-dev/deploy-kit/commit/d42d41cbfc7a702e92bfc0c1a9667988f29871db))

## [0.24.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.23.1...v0.24.0) (2026-10-19)


### Features

* a consumer reaches its provider by the provider's Application Id ([#508](https://github.com/JorisJonkers-dev/deploy-kit/issues/508)) ([7a32874](https://github.com/JorisJonkers-dev/deploy-kit/commit/7a32874a0f5dcc9d26dec92327df2bf0fff8e7b4))
* a release's SQL is linted and its locks are bounded ([#504](https://github.com/JorisJonkers-dev/deploy-kit/issues/504)) ([93e1a37](https://github.com/JorisJonkers-dev/deploy-kit/commit/93e1a37209a084594a7087dec1b0fa7829253fcb))

## [0.23.1](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.23.0...v0.23.1) (2026-10-19)


### Bug Fixes

* give each attached Process its own VPN credential ([#503](https://github.com/JorisJonkers-dev/deploy-kit/issues/503)) ([a296af7](https://github.com/JorisJonkers-dev/deploy-kit/commit/a296af73539eaee6ee11f2a92c563fad6e4dbb4d))

## [0.23.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.22.0...v0.23.0) (2026-10-19)


### Features

* mount the Process's writable paths in every sidecar ([#500](https://github.com/JorisJonkers-dev/deploy-kit/issues/500)) ([bea969f](https://github.com/JorisJonkers-dev/deploy-kit/commit/bea969f9b5a2cc2977ddc0999fe75ba932e35e00))

## [0.22.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.21.0...v0.22.0) (2026-10-19)


### Features

* attach a Process to the platform's VPN ([#497](https://github.com/JorisJonkers-dev/deploy-kit/issues/497)) ([81c271b](https://github.com/JorisJonkers-dev/deploy-kit/commit/81c271b2b3a5b67e154f82f3c19e954f00533b1f))

## [0.21.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.20.0...v0.21.0) (2026-10-19)


### Features

* derive a GPU request from the placement that selects the card ([#495](https://github.com/JorisJonkers-dev/deploy-kit/issues/495)) ([a3e238c](https://github.com/JorisJonkers-dev/deploy-kit/commit/a3e238c0e09cff7c2345a554f1bbdee7f0e5c2db))

## [0.20.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.19.3...v0.20.0) (2026-10-19)


### Features

* declare internet egress ([#494](https://github.com/JorisJonkers-dev/deploy-kit/issues/494)) ([52d20b3](https://github.com/JorisJonkers-dev/deploy-kit/commit/52d20b36b62114fffffb7c4b426080d625287ee4))
* deliver an edge's credential to files, and sync every static secret at one derived interval ([#492](https://github.com/JorisJonkers-dev/deploy-kit/issues/492)) ([fd45e24](https://github.com/JorisJonkers-dev/deploy-kit/commit/fd45e24d838a4c7d5a8a46b6643dbd8de9fa6ae3))


### Bug Fixes

* **deps:** update minor and patch dependencies ([#490](https://github.com/JorisJonkers-dev/deploy-kit/issues/490)) ([7cfd1d4](https://github.com/JorisJonkers-dev/deploy-kit/commit/7cfd1d4b05097a1f4e4f862fd5b04568d25a7f72))
* **model:** carry the release label in the artifact, not the pin source ([#491](https://github.com/JorisJonkers-dev/deploy-kit/issues/491)) ([3d48724](https://github.com/JorisJonkers-dev/deploy-kit/commit/3d487246c904282220c4595b0144e7a53214902a)), closes [#487](https://github.com/JorisJonkers-dev/deploy-kit/issues/487)

## [0.19.3](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.19.2...v0.19.3) (2026-10-19)


### Bug Fixes

* **model:** run a files backup as the Process that owns the volume ([#488](https://github.com/JorisJonkers-dev/deploy-kit/issues/488)) ([4fdd49d](https://github.com/JorisJonkers-dev/deploy-kit/commit/4fdd49d291e888c72aa84c08c75f925c7f020b00))

## [0.19.2](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.19.1...v0.19.2) (2026-10-18)


### Bug Fixes

* **model:** allow the substrate's image pull on every derived deadline ([#479](https://github.com/JorisJonkers-dev/deploy-kit/issues/479)) ([ca9a100](https://github.com/JorisJonkers-dev/deploy-kit/commit/ca9a100a0ecb23ff10af5f6e36a58b11b64da336)), closes [#422](https://github.com/JorisJonkers-dev/deploy-kit/issues/422)

## [0.19.1](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.19.0...v0.19.1) (2026-10-18)


### Bug Fixes

* name a datastore's Secret Store connection after its Process, not its engine ([#477](https://github.com/JorisJonkers-dev/deploy-kit/issues/477)) ([b504ab0](https://github.com/JorisJonkers-dev/deploy-kit/commit/b504ab06c7e3ee0a105ea93b84a9d93daa9b0195))

## [0.19.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.18.0...v0.19.0) (2026-10-17)


### Features

* a library is a directory on one node that the Platform grants to projects ([#475](https://github.com/JorisJonkers-dev/deploy-kit/issues/475)) ([4bb6c72](https://github.com/JorisJonkers-dev/deploy-kit/commit/4bb6c728c294ce92db047f34920fe8e7e5c2b784))


### Bug Fixes

* retry a derived estate Job until it succeeds, and keep it off the SD-card nodes ([#473](https://github.com/JorisJonkers-dev/deploy-kit/issues/473)) ([96067e3](https://github.com/JorisJonkers-dev/deploy-kit/commit/96067e3ea395886c1c335ba5acdd889cfc8fe87f))

## [0.18.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.17.0...v0.18.0) (2026-10-16)


### Features

* deliver the database credential an edge derives, as itself or to the environment ([#462](https://github.com/JorisJonkers-dev/deploy-kit/issues/462)) ([ae4fbfc](https://github.com/JorisJonkers-dev/deploy-kit/commit/ae4fbfc8291f5c4e37d421d869d24281692bfd37))

## [0.17.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.16.0...v0.17.0) (2026-10-16)


### Features

* apply the database catalog in the cluster by its engine's method ([#459](https://github.com/JorisJonkers-dev/deploy-kit/issues/459)) ([f8570f6](https://github.com/JorisJonkers-dev/deploy-kit/commit/f8570f6d3f2fd4e24c0e9445dd703bce99740dfc))
* let a generated key adopt the value an old location holds ([#456](https://github.com/JorisJonkers-dev/deploy-kit/issues/456)) ([2edb472](https://github.com/JorisJonkers-dev/deploy-kit/commit/2edb472ca013aaa047d936249dfadc7d81e4974d))


### Bug Fixes

* name the Vault policy job for what its pod runs with, not its documents alone ([#457](https://github.com/JorisJonkers-dev/deploy-kit/issues/457)) ([526d5c9](https://github.com/JorisJonkers-dev/deploy-kit/commit/526d5c9b9394366b906c15c80d69ca52f0dc15db))

## [0.16.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.15.0...v0.16.0) (2026-10-15)


### Features

* generate a declared secret key in the Vault policy job ([#451](https://github.com/JorisJonkers-dev/deploy-kit/issues/451)) ([1914446](https://github.com/JorisJonkers-dev/deploy-kit/commit/19144464b7430c66089903c5943171ba54d46178))

## [0.15.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.14.0...v0.15.0) (2026-10-15)


### Features

* label every pod a Project's unit applies with its release ([#433](https://github.com/JorisJonkers-dev/deploy-kit/issues/433)) ([57d2630](https://github.com/JorisJonkers-dev/deploy-kit/commit/57d26303d9c9ce4447b10f67602abfe63fd60fc4))

## [0.14.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.13.0...v0.14.0) (2026-10-14)


### Features

* give a Rollout the URL its release is reachable at ([#426](https://github.com/JorisJonkers-dev/deploy-kit/issues/426)) ([3530241](https://github.com/JorisJonkers-dev/deploy-kit/commit/3530241b94936334d4a1b2c21d8b4646ed695a99))

## [0.13.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.12.0...v0.13.0) (2026-10-14)


### Features

* render a Rollback's backup as one-shot Jobs while its pin asks for one ([#424](https://github.com/JorisJonkers-dev/deploy-kit/issues/424)) ([c40f6fc](https://github.com/JorisJonkers-dev/deploy-kit/commit/c40f6fc7e918070135234efac9d7e728663203fc))

## [0.12.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.11.1...v0.12.0) (2026-10-13)


### ⚠ BREAKING CHANGES

* delivery.analysis requires errorRate and latency. A Platform document that states a delivery policy without them is refused.

### Features

* hand the Release Gate its check paths, warmup hostnames and thresholds through the Canary ([#417](https://github.com/JorisJonkers-dev/deploy-kit/issues/417)) ([2d521a1](https://github.com/JorisJonkers-dev/deploy-kit/commit/2d521a1b2d26ec0aa9b23b2bb3bc9aa7efe2cfb5))
* name the Reporter in the Platform document, and admit Flux's events to it ([#418](https://github.com/JorisJonkers-dev/deploy-kit/issues/418)) ([d25765e](https://github.com/JorisJonkers-dev/deploy-kit/commit/d25765e268c9a85ee7bca56a352cec03403c3b2e))
* record a Rollout for every moved pin, and carry it on the pin source ([#415](https://github.com/JorisJonkers-dev/deploy-kit/issues/415)) ([3dc9bec](https://github.com/JorisJonkers-dev/deploy-kit/commit/3dc9becb52f255edaf524112ca352e5f0644b80c))
* send Flux's events about every unit to the Reporter, from the estate-scoped artifact ([#420](https://github.com/JorisJonkers-dev/deploy-kit/issues/420)) ([f5b4109](https://github.com/JorisJonkers-dev/deploy-kit/commit/f5b4109ea296aee93f79e207f5571b25bafbe0e7))

## [0.11.1](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.11.0...v0.11.1) (2026-10-13)


### Bug Fixes

* hold a committed pin source against the derived one by the objects it holds, not its text ([#413](https://github.com/JorisJonkers-dev/deploy-kit/issues/413)) ([e22d569](https://github.com/JorisJonkers-dev/deploy-kit/commit/e22d569eb558b50178ce48409c6e3d5d2b5cf591)), closes [#412](https://github.com/JorisJonkers-dev/deploy-kit/issues/412)

## [0.11.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.10.0...v0.11.0) (2026-10-12)


### Features

* reach a legacy Application where the handover ledger states the old path runs it ([#319](https://github.com/JorisJonkers-dev/deploy-kit/issues/319)) ([ef35f6c](https://github.com/JorisJonkers-dev/deploy-kit/commit/ef35f6c8490da0e3b3abd35b8697486caaec2689))


### Bug Fixes

* rewrite a pin source when what it holds changes, not only when its artifact moves ([#410](https://github.com/JorisJonkers-dev/deploy-kit/issues/410)) ([57c60e9](https://github.com/JorisJonkers-dev/deploy-kit/commit/57c60e9dd5cc663491cb65f2a2399d6c049c885f))

## [0.10.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.9.1...v0.10.0) (2026-10-08)


### Features

* pull each render with the Secret the Platform document names for a private artifact repository ([#312](https://github.com/JorisJonkers-dev/deploy-kit/issues/312)) ([de76810](https://github.com/JorisJonkers-dev/deploy-kit/commit/de768109515bc5c8c0ef8454d62b211f5805989c))

## [0.9.1](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.9.0...v0.9.1) (2026-10-08)


### Bug Fixes

* recreate a Project's Deployments on its first delivery, since a live selector cannot be updated in place ([#308](https://github.com/JorisJonkers-dev/deploy-kit/issues/308)) ([f077383](https://github.com/JorisJonkers-dev/deploy-kit/commit/f077383149e2884030a1d72cd1f60ed0c261f46b))

## [0.9.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.8.1...v0.9.0) (2026-10-08)


### Features

* move a rolled-back Project's pin to the release it was rolled back to ([#303](https://github.com/JorisJonkers-dev/deploy-kit/issues/303)) ([cc4340a](https://github.com/JorisJonkers-dev/deploy-kit/commit/cc4340a78c26ab2daed3e91f89095bd7f59900d4)), closes [#301](https://github.com/JorisJonkers-dev/deploy-kit/issues/301)


### Bug Fixes

* publish the estate-scoped artifact beside the Projects' repository ([#305](https://github.com/JorisJonkers-dev/deploy-kit/issues/305)) ([d7f69a3](https://github.com/JorisJonkers-dev/deploy-kit/commit/d7f69a36bcdc67910037e6be04da58fe3a7db885)), closes [#304](https://github.com/JorisJonkers-dev/deploy-kit/issues/304)

## [0.8.1](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.8.0...v0.8.1) (2026-10-08)


### Bug Fixes

* depend only on units on the estate path while the estate is handed over ([#299](https://github.com/JorisJonkers-dev/deploy-kit/issues/299)) ([685e305](https://github.com/JorisJonkers-dev/deploy-kit/commit/685e305720b03a0b6a834722620d67a4f553d7a4)), closes [#298](https://github.com/JorisJonkers-dev/deploy-kit/issues/298)
* hold each Process's pods to the nodes its placement resolved ([#296](https://github.com/JorisJonkers-dev/deploy-kit/issues/296)) ([5415788](https://github.com/JorisJonkers-dev/deploy-kit/commit/5415788af12ddb31b1b1cd27785b60f226d14621)), closes [#259](https://github.com/JorisJonkers-dev/deploy-kit/issues/259)

## [0.8.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.7.0...v0.8.0) (2026-10-07)


### Features

* answer the union's identity and reference invariants in the model-driven implementation ([#283](https://github.com/JorisJonkers-dev/deploy-kit/issues/283)) ([b5de85b](https://github.com/JorisJonkers-dev/deploy-kit/commit/b5de85b258b12e35011c7b60c8cf9dabb55edc41))
* declare the knowledge platform's shared intent above the Process ([#277](https://github.com/JorisJonkers-dev/deploy-kit/issues/277)) ([18ab8c1](https://github.com/JorisJonkers-dev/deploy-kit/commit/18ab8c162f5952971126fa9cf91d88f3e0309c23))
* deliver the estate's secrets unit while a Project is still legacy ([#288](https://github.com/JorisJonkers-dev/deploy-kit/issues/288)) ([3c124ff](https://github.com/JorisJonkers-dev/deploy-kit/commit/3c124fff45b551916872adaec4c0a3c1682d3882))
* hand a backup method the Process it dumps and the credential it logs in with ([#293](https://github.com/JorisJonkers-dev/deploy-kit/issues/293)) ([28248d4](https://github.com/JorisJonkers-dev/deploy-kit/commit/28248d4b6b37b6593d35f78869f8ed00718804df)), closes [#284](https://github.com/JorisJonkers-dev/deploy-kit/issues/284)
* model and render the knowledge platform, with its file grant mounted ([#273](https://github.com/JorisJonkers-dev/deploy-kit/issues/273)) ([790b124](https://github.com/JorisJonkers-dev/deploy-kit/commit/790b1246cc46dbf685d8f1a68bf28c77526518c1))
* refuse every authored mistake before resolution, in both implementations ([#279](https://github.com/JorisJonkers-dev/deploy-kit/issues/279)) ([05ec550](https://github.com/JorisJonkers-dev/deploy-kit/commit/05ec5503ff360a9acc5111dcbb3b0c93b0874213))
* refuse the identity and reference invariants over the composed union ([#278](https://github.com/JorisJonkers-dev/deploy-kit/issues/278)) ([6d3ec7d](https://github.com/JorisJonkers-dev/deploy-kit/commit/6d3ec7deeaf1ca51d096d033cdd44dcb5953a193))


### Bug Fixes

* rewrite an artifact's pin source whenever its pin moves ([#291](https://github.com/JorisJonkers-dev/deploy-kit/issues/291)) ([b5b6cae](https://github.com/JorisJonkers-dev/deploy-kit/commit/b5b6cae67a14ce5b8be8bd6227b4f5cc5829599c)), closes [#287](https://github.com/JorisJonkers-dev/deploy-kit/issues/287)

## [0.7.0](https://github.com/JorisJonkers-dev/deploy-kit/compare/v0.6.0...v0.7.0) (2026-10-06)


### Features

* hold the CLI to its conventions at the process seam, and answer help and --json as they say ([#267](https://github.com/JorisJonkers-dev/deploy-kit/issues/267)) ([e9518b2](https://github.com/JorisJonkers-dev/deploy-kit/commit/e9518b2edecb3c85ec53480269fefbc8802efc08))

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
