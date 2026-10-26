// REQ-093 (docs/requirements.md): a rule file's PrometheusRule is named for
// its Application and its file's base name, as a Kubernetes name.
import { describe, expect, it } from "vitest";
import { ruleNameOf } from "../../src/adapters/prometheus/render.ts";

describe("a rule file's PrometheusRule name", () => {
  it.each([
    ["rules/platform.yaml", "prometheus-platform"],
    ["rules/Platform_Alerts.yml", "prometheus-platform-alerts"],
    ["rules/a.yamlx.yaml", "prometheus-a-yamlx"],
    ["platform", "prometheus-platform"],
  ])("for %s is %s", (from, name) => {
    expect(ruleNameOf("prometheus", from)).toBe(name);
  });
});
