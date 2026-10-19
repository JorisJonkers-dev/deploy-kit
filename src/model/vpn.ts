// The VPN attachment (spec/v1/10-project-intent.md#vpn-attachment): where the
// VPN container and the attached Process share the forwarded port.

/** The directory both containers mount, the VPN container writing it. */
export const VPN_DIRECTORY = "/run/vpn";

/** The file holding the port the provider currently forwards. */
export const FORWARDED_PORT_FILE = `${VPN_DIRECTORY}/forwarded-port`;
