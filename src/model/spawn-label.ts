// The label every pod a Process makes from a spawn template carries
// (spec/v1/16-dependencies.md#spawn-templates): its value names the Process and
// the template, and the template's policy selects it.
export const SPAWN_LABEL = "deploy-kit.jorisjonkers.dev/spawned-from";
