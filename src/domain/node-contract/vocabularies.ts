// The closed vocabularies of the node contract, spec/v1/60-setup.md#node-facts.
//
// The contract publishes what a node HAS. A Process asks for what it NEEDS,
// from the vocabularies of spec/v1/10-project-intent.md. The two sets are not
// the same set, and the storage medium is where they part
// (docs/adr/model/0123-a-node-publishes-media-no-process-may-ask-for.md).

/**
 * A storage medium a node may publish. Wider than the `Medium` a Process may
 * ask for: three Raspberry Pis boot from SD cards, which is a fact about the
 * estate, and no Process may request one.
 */
export const NODE_MEDIA = ["nvme", "ssd", "hdd", "sdcard"] as const;

export type NodeMedium = (typeof NODE_MEDIA)[number];
