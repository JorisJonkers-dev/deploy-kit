# The `tests` family

Rules on what a test may do, and must do.

| id | family | the rule | enforced by | proved by |
|---|---|---|---|---|
| RULE-027 | tests | No committed `.only`: a focused test is a suite that is green for the wrong reason | `eslint:vitest/no-focused-tests` | [test/harness.test.ts](../../test/harness.test.ts) `vitest/no-focused-tests` |
| RULE-028 | tests | No committed `.skip`: a disabled test proves nothing and reads as covered | `eslint:vitest/no-disabled-tests` | [test/harness.test.ts](../../test/harness.test.ts) `vitest/no-disabled-tests` |
| RULE-029 | tests | No test without an assertion: a test that asserts nothing passes for ever | `eslint:vitest/expect-expect` | [test/harness.test.ts](../../test/harness.test.ts) `vitest/expect-expect` |
| RULE-030 | tests | No fixed sleep through a timer global: slow when it passes, flaky when the machine is busy | `eslint:no-restricted-globals` | [test/harness.test.ts](../../test/harness.test.ts) `no-restricted-globals` |
| RULE-031 | tests | No fixed sleep through the timers module either, which is the same defect under another import | `eslint:no-restricted-imports` | [test/harness.test.ts](../../test/harness.test.ts) `no-restricted-imports` |
| RULE-032 | tests | No test reaches the network: the capability is removed, and using it fails the test that tried | `file:test/setup.ts` | [test/harness.test.ts](../../test/harness.test.ts) `tried to reach` |
| RULE-033 | tests | A test never imports another test: a shared fixture belongs in `test/support/` | `eslint:deploy-kit/no-test-imports-test` | [test/code-rules.test.ts](../../test/code-rules.test.ts) `a shared fixture belongs in test/support/` |
| RULE-034 | tests | The rendered tree is compared byte for byte against a committed golden tree, and a double render inside one process and in a fresh one agrees with it | `file:test/model/render.test.ts` | [test/model/render.test.ts](../../test/model/render.test.ts) `differs from the committed tree when one authored field moves` |
