// The closed vocabularies of spec/v1/14-platform-intent.md, each declared once.

export const DATASTORES = ["sqlite", "etcd"] as const;
export const POLICY_CONTROLLERS = ["none", "embedded", "cni"] as const;
export const LISTENERS = ["tls", "plain"] as const;
export const CERTIFICATE_SOURCES = ["acme", "none"] as const;
export const HARDENING_CLASSES = ["restricted"] as const;

export type Datastore = (typeof DATASTORES)[number];
export type PolicyController = (typeof POLICY_CONTROLLERS)[number];
export type Listener = (typeof LISTENERS)[number];
export type CertificateSource = (typeof CERTIFICATE_SOURCES)[number];
export type HardeningClass = (typeof HARDENING_CLASSES)[number];
