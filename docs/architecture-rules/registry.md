# The `registry` family

Rules on the registries: adapters, and the estate-wide invariants.

| id | family | the rule | enforced by | proved by |
|---|---|---|---|---|
| RULE-045 | registry | Every registered adapter satisfies the adapter port, attributes every Deliverable to itself, and renders deterministically | `file:test/adapters/contract.test.ts` | [test/adapters/contract.test.ts](../../test/adapters/contract.test.ts) `names an adapter that attributes, places or renders wrongly` |
| RULE-046 | registry | Every estate-wide invariant is registered with its code, its spec anchor and its test, so an unregistered one is detectable rather than merely absent | pending (#44): the invariant registry is that ticket's deliverable | pending |
