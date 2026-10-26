// REQ-098 (docs/requirements.md): the Node Agents are derived from node facts
// and pools, never authored: every node runs node-metrics, a node with an
// nvidia card runs gpu-device and gpu-metrics, and the nodes of a site with a
// pool run l4-speaker, each held to exactly those nodes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { parsePlatformIntent } from "../../src/index.ts";
import { nodeAgentsOf } from "../../src/model/node-agents.ts";
import { readNodeContract } from "../../src/read/pinned-inputs.ts";

const EXAMPLES = join(
  import.meta.dirname,
  "..",
  "..",
  "spec",
  "v1",
  "examples",
);
const text = (path: string): string =>
  readFileSync(join(EXAMPLES, path), "utf8");

const inputs = (
  edit: (platform: string) => string = (platform) => platform,
) => {
  const platform = parsePlatformIntent(
    edit(text("platform/platform.intent.yml")),
  );
  const contract = readNodeContract(
    parseYaml(text("platform/node-contract.yml")),
  );
  if (!platform.ok || !contract.ok)
    throw new Error("the worked inputs did not read");
  return { platform: platform.value.document, contract: contract.value };
};

const ENSCHEDE = [
  "enschede-t1000-1",
  "enschede-rx7900xtx-1",
  "enschede-gtx-960m-1",
  "enschede-pi-1",
  "enschede-pi-2",
  "enschede-pi-3",
];

describe("the Node Agents", () => {
  it("derive each agent on the nodes its facts name, in the node contract's order", () => {
    const { platform, contract } = inputs();
    expect(
      nodeAgentsOf(platform, contract).map(({ agent, nodes }) => ({
        agent,
        nodes,
      })),
    ).toStrictEqual([
      {
        agent: "gpu-device",
        nodes: ["enschede-t1000-1", "enschede-gtx-960m-1"],
      },
      {
        agent: "gpu-metrics",
        nodes: ["enschede-t1000-1", "enschede-gtx-960m-1"],
      },
      { agent: "node-metrics", nodes: [...ENSCHEDE, "frankfurt-contabo-1"] },
      { agent: "l4-speaker", nodes: ENSCHEDE },
    ]);
  });

  it("derive no speaker where the Platform declares no pool", () => {
    const { platform, contract } = inputs((document) =>
      document
        .replace(/\nl4Addresses:\n( {2}.*\n)+/, "\n")
        // With no address declared, no tier names one.
        .replaceAll(/\n {4}address: [a-z-]+[^\n]*/g, ""),
    );
    expect(
      nodeAgentsOf(platform, contract).map(({ agent }) => agent),
    ).toStrictEqual(["gpu-device", "gpu-metrics", "node-metrics"]);
  });

  it("hand the speaker each pool with the nodes of its site", () => {
    const { platform, contract } = inputs();
    const speaker = nodeAgentsOf(platform, contract).find(
      ({ agent }) => agent === "l4-speaker",
    );
    expect(speaker?.pools).toStrictEqual([
      { name: "lan-dns", range: "192.168.0.98/32", nodes: ENSCHEDE },
      { name: "lan-edge", range: "192.168.0.99/32", nodes: ENSCHEDE },
      { name: "lan-mqtt", range: "192.168.0.97/32", nodes: ENSCHEDE },
    ]);
  });
});
