---
tier: decision
status: accepted
claim: open
owner: joris
date: 2026-10-19
normative: spec/v1/14-platform-intent.md#vpn
rests-on: ["0004", "0005", "0006"]
---

# A VPN attachment is a derived sidecar the platform owns, the one container that holds network privileges, and the forwarded port reaches the Process as a file

A Process declares that its traffic leaves through the VPN, and whether it
needs an inbound port forwarded to it. The render adds the platform's VPN
container to that Process's pod: the image, settings and credential the
Platform document names, running as root with `NET_ADMIN` and `NET_RAW`, as a
native sidecar that starts before the Process. Where a port is forwarded, the
VPN container writes it to a file the Process reads.

## Rests on

Which provider, which servers and which credential carry the estate's traffic
are one decision for every Process that needs it, so the platform makes it once
([0004](0004-contention-decides-authority.md)). The container, its settings,
the forwarded-port file and the egress rule follow from that declaration and
the attachment, and nothing about them is authored a second time
([0005](0005-derivation-is-total.md)). The image is resolved through the images
lock like every other ([0006](0006-pinned-inputs.md)).

**False if:** a Process needs a different tunnel than every other attached
Process, or two attached pods must share one exit address without sharing a pod.
**Settled by:** qbittorrent seeding through a forwarded port, and prowlarr and
flaresolverr resolving indexers behind one exit address, with no privilege in
any Project's own containers.

## Why

**The tunnel must share the Process's network namespace.** A torrent client
needs both directions: peers dial the port the provider forwards, over TCP and
UDP. An HTTP or SOCKS proxy carries egress only, and routing a pod through a
gateway pod needs a privileged init container in every client pod. A container
in the same pod sees the same interfaces, so the tunnel becomes the Process's
default route with no change to the Process.

**Privilege is the platform's, never a Project's.** The tunnel needs
`NET_ADMIN` and `NET_RAW`, which the posture refuses every Process
([0020](0020-hardening-is-one-platform-posture.md)). A Project authors no
control. The privileged container is derived and named by the Platform
document, which is the one authority that may run it. Its credential is synced
to a Secret only that container reads.

**One key per Process.** A provider takes a WireGuard key for one device, and two
tunnels on one key knock each other off: the second handshake takes the first
one's session, and a forwarded port moves with it. So the Platform names a
prefix, and each attached Process reads its own key below it.

**The model names no client.** Applying a forwarded port is client-specific: a
torrent client's API call, a config reload, a restart. The VPN container writes
the port to a file. The Process's own image applies it, so nothing executable
is authored and no vocabulary of clients enters the model.

**One pod, one tunnel, one exit address.** Cloudflare's clearance is tied to
the address that solved it, so flaresolverr must leave where prowlarr does. Two
pods hold two tunnels, which may land on two servers. Two Processes that must
share an exit share a pod, one as the other's sidecar.

## Alternatives

| option | cost if taken | why rejected |
|---|---|---|
| A gateway pod every attached pod routes through | one tunnel, one exit address for all | every client pod needs a privileged init container and an overlay to the gateway |
| An HTTP or SOCKS proxy the platform runs | no privilege anywhere but the proxy | no inbound connection reaches a client behind a proxy, so peers cannot dial it |
| Let a Process author its own VPN sidecar | no new Platform field | a privileged container authored in a Project is the exception surface the posture closed |
| A derived sidecar that calls each client's API with the port | the image needs no watcher | a closed vocabulary of clients in the model, and an authored command for every new one |
| Typed VPN settings in the Platform document | the model owns their meaning | a field for every gluetun option, and a release of deploy-kit whenever one is needed |

## Reversibility

Undo cost today: one Platform field, one Process field, one derived container
in one adapter: a day. Becomes costly once: the downloads Project runs on it,
and its images apply the forwarded port from the file.

## Consequences

- The Platform document carries `vpn`
  ([chapter 14](../../../spec/v1/14-platform-intent.md#vpn)), and a Process
  carries `vpn: {forwardedPort}`
  ([chapter 10](../../../spec/v1/10-project-intent.md#vpn-attachment)).
- The posture covers every container a Project runs, and the VPN container is
  the one outside it ([0020](0020-hardening-is-one-platform-posture.md)).
- An attached Process derives internet egress and holds the VPN's credential,
  so its Application waits for the secrets-provisioning unit.
- `E_NO_VPN_POLICY` refuses an attachment the platform runs no VPN for.
- The serializer writes YAML a 1.1 reader parses back the same, so a setting
  such as `on` stays a string to the Kubernetes API.
