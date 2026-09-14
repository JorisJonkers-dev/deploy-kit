# emf: the model-driven implementation

Everything under this directory is the model-driven implementation of the
deploy-kit compiler, the second implementation beside the TypeScript production
implementation, built with the Eclipse Modeling Framework toolchain the
model-driven engineering course at the University of Twente requires: Ecore,
Xtext, OCL, QVT-Operational and Acceleo. It is **deprecated from the day it
lands**: it exists for the length of the course and is deleted when its sunset
condition holds
([0107](docs/adr/emf/0107-emf-is-coursework-scoped-and-self-contained.md)).

The repository root stays TypeScript. Nothing outside `emf/` builds, imports or
depends on anything inside it. The Maven build, its modules, its checks, its
ledgers and its decisions all live here, so the sunset is deleting this
directory and the few root lines that name it, listed in
[the architecture](docs/architecture.md#scope-and-sunset).

The one thing this implementation shares with the production implementation is the
[parity contract](../docs/architecture.md#the-parity-contract): the committed
oracle files under `spec/v1/examples/` that both are tested against, separately.

| read | for |
|---|---|
| [docs/architecture.md](docs/architecture.md) | the structure: toolchain, modules, how each stage meets the contract |
| [docs/adr/README.md](docs/adr/README.md) | the decisions that shaped it, and the register |
