// REQ-034 (docs/requirements.md): the node contract, and chapter 60's table of
// what it must publish.
//
// The contract is the other half of every placement comparison, so the facts it
// publishes are checked against the chapter that enumerates them rather than
// read by eye: the seven nodes, their sites and architectures, and the count of
// nodes carrying each capability.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { MEDIA } from "../../src/domain/project-intent/vocabularies.ts";
import { NODE_MEDIA } from "../../src/domain/node-contract/vocabularies.ts";
import { nodeContract } from "../../src/wire/node-contract/schema.ts";

const REPOSITORY = join(import.meta.dirname, "..", "..");
const CONTRACT = join(
  REPOSITORY,
  "spec",
  "v1",
  "examples",
  "platform",
  "node-contract.yml",
);
const CHAPTER = join(REPOSITORY, "spec", "v1", "60-setup.md");

const worked = (): unknown => parse(readFileSync(CONTRACT, "utf8"));
const parsed = () => nodeContract.parse(worked());

/** A node contract with one value changed, as text, so the schema sees it whole. */
const mutated = (from: string, to: string): unknown => {
  const text = readFileSync(CONTRACT, "utf8");
  expect(text, `the contract no longer contains ${from}`).toContain(from);
  return parse(text.replace(from, to));
};

describe("the worked node contract", () => {
  it("validates against the schema", () => {
    const result = nodeContract.safeParse(worked());

    expect(result.error?.issues ?? []).toStrictEqual([]);
    expect(result.success).toBe(true);
  });

  it("publishes the seven nodes chapter 60 enumerates, with their sites", () => {
    const sites = Object.fromEntries(
      parsed().nodes.map((node) => [node.name, node.site]),
    );

    expect(sites).toStrictEqual({
      "enschede-t1000-1": "enschede",
      "enschede-rx7900xtx-1": "enschede",
      "enschede-gtx-960m-1": "enschede",
      "enschede-pi-1": "enschede",
      "enschede-pi-2": "enschede",
      "enschede-pi-3": "enschede",
      "frankfurt-contabo-1": "frankfurt",
    });
  });

  it("carries the capability counts chapter 60 states, and no tailscale", () => {
    // A capability on all seven nodes excludes nothing, so it is not one.
    const counts: Record<string, number> = {};
    for (const node of parsed().nodes)
      for (const capability of node.capabilities ?? [])
        counts[capability] = (counts[capability] ?? 0) + 1;

    expect(counts).toStrictEqual({
      adguard: 5,
      "lan-ingress": 3,
      nvidia: 2,
      samba: 1,
      "public-ingress": 1,
      "llm-host": 1,
      "backup-store": 1,
      "amd-gpu": 1,
    });
    const chapter = readFileSync(CHAPTER, "utf8");
    expect(chapter).toContain("Tailscale is on 7 of 7 nodes");
  });

  it("separates two cards of one class by memory, not by vendor", () => {
    // `nvidia` cannot tell a 2048MiB Maxwell from a T1000, which is why a
    // Process selects on `class` and `memory_mib`.
    const cards = parsed()
      .nodes.flatMap((node) => node.gpus ?? [])
      .filter((gpu) => gpu.class === "transcode");

    expect(cards).toHaveLength(2);
    expect(new Set(cards.map((gpu) => gpu.vendor))).toStrictEqual(
      new Set(["nvidia"]),
    );
    expect(new Set(cards.map((gpu) => gpu.memory_mib)).size).toBe(2);
  });

  it("publishes a medium no Process may ask for", () => {
    // 0123: the contract's vocabulary is the wider one. Three Pis boot from SD
    // cards, and `sdcard` is not a `placement.disk.media` value.
    const media = new Set(
      parsed()
        .nodes.flatMap((node) => node.disks ?? [])
        .map((disk) => disk.media),
    );

    expect(media.has("sdcard")).toBe(true);
    expect(NODE_MEDIA).toContain("sdcard");
    // The asking vocabulary is the smaller one, and stays a subset of it.
    expect([...MEDIA]).not.toContain("sdcard");
    expect(MEDIA.every((medium) => NODE_MEDIA.includes(medium))).toBe(true);
  });
});

describe("the schema refuses", () => {
  it("a storage medium the contract has no name for", () => {
    expect(
      nodeContract.safeParse(mutated("media: sdcard", "media: tape")).success,
    ).toBe(false);
  });

  it("an architecture layer 1 cannot ask for", () => {
    expect(
      nodeContract.safeParse(mutated("arch: arm64", "arch: riscv64")).success,
    ).toBe(false);
  });

  it("an allocatable quantity that is not a quantity", () => {
    expect(
      nodeContract.safeParse(mutated("cpu: 5750m", "cpu: plenty")).success,
    ).toBe(false);
  });

  it("a node fact the contract does not publish", () => {
    // Node totals, the reserve and taints are the AUTHORED file's; the contract
    // publishes what is left after the reserve, and nothing else.
    expect(
      nodeContract.safeParse(mutated("site: frankfurt", "reserve: 512Mi"))
        .success,
    ).toBe(false);
  });
});
