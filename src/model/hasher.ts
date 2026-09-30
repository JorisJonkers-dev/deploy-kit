// The hash primitive, as a port (docs/architecture.md#ports): the domain decides
// what is digested and never imports the crypto that digests it.

/** The `<algorithm>:<hex>` digest of a JSON value's canonical form. */
export type Hasher = (value: unknown) => string;
