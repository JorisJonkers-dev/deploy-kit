// A container-level proof of host-narrowed egress, run by hand where Docker is
// available: `node test/e2e/egress-proxy.e2e.ts`. It is no vitest test, because
// the suite removes the network (RULE-032) and this reaches it on purpose.
//
// It runs the proxy the way the render does, the allowlist `proxyConfigOf`
// writes under a read-only root filesystem, as the image's own non-root user,
// with every capability dropped. A client with no route but the proxy stands in
// for the pod whose policy admits nothing else: its internal network has no
// way out, which is what the policy the render writes gives the real pod.
// Then it asks: a declared host connects through the proxy, an undeclared host,
// an address and a declared host on an undeclared port are refused by it, and
// a request that bypasses the proxy has nowhere to go.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { proxyConfigOf } from "../../src/model/egress-proxy.ts";

const SQUID =
  process.env["EGRESS_E2E_SQUID"] ??
  "ubuntu/squid@sha256:6a097f68bae708cedbabd6188d68c7e2e7a38cedd05a176e1cc0ba29e3bbe029";
const CURL =
  process.env["EGRESS_E2E_CURL"] ??
  "curlimages/curl@sha256:3fb7e13e5d179a845c97d78204f3f1064d1907037f26a3ebf91710571151fd93";
const RUN = `egress-e2e-${String(process.pid)}`;
const NETWORK = `${RUN}-internal`;
const PROXY = `${RUN}-proxy`;

const docker = (...args: string[]): string =>
  execFileSync("docker", args, { encoding: "utf8" }).trim();

/** What the client sees of one request: curl's exit status and the proxy's CONNECT answer. */
function request(
  url: string,
  viaProxy: boolean,
): { exit: number; connect: string } {
  const proxy = viaProxy ? ["-x", `http://${PROXY}:3128`] : [];
  const result = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      NETWORK,
      "--entrypoint",
      "curl",
      CURL,
      "-s",
      "-o",
      "/dev/null",
      "-m",
      "20",
      "-w",
      "%{http_connect}",
      ...proxy,
      url,
    ],
    { encoding: "utf8" },
  );
  return { exit: result.status ?? -1, connect: result.stdout.trim() };
}

const failures: string[] = [];
const expectThat = (what: string, held: boolean): void => {
  process.stdout.write(`${held ? "ok  " : "FAIL"} ${what}\n`);
  if (!held) failures.push(what);
};

const directory = mkdtempSync(join(tmpdir(), "egress-e2e-"));
try {
  writeFileSync(
    join(directory, "squid.conf"),
    proxyConfigOf("hermes", [
      { host: "api.github.com", port: 443 },
      { host: "github.com", port: 443 },
    ]),
  );
  docker("network", "create", "--internal", NETWORK);
  docker(
    "run",
    "-d",
    "--name",
    PROXY,
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--user",
    "13:13",
    "--tmpfs",
    "/tmp",
    "-v",
    `${directory}/squid.conf:/etc/squid/squid.conf:ro`,
    "--entrypoint",
    "squid",
    SQUID,
    "-N",
    "-f",
    "/etc/squid/squid.conf",
  );
  docker("network", "connect", NETWORK, PROXY);
  // The proxy listens once squid has parsed its configuration.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const state = spawnSync("docker", ["logs", PROXY], { encoding: "utf8" });
    if (`${state.stdout}${state.stderr}`.includes("Accepting HTTP Socket"))
      break;
    spawnSync("sleep", ["1"]);
  }

  const declared = request("https://api.github.com/zen", true);
  expectThat(
    "a declared host connects through the proxy",
    declared.exit === 0 && declared.connect === "200",
  );
  const other = request("https://example.com/", true);
  expectThat(
    "an undeclared host is refused by the proxy",
    other.exit !== 0 && other.connect === "403",
  );
  const address = request("https://1.1.1.1/", true);
  expectThat(
    "an address is refused by the proxy",
    address.exit !== 0 && address.connect === "403",
  );
  const port = request("https://api.github.com:8443/", true);
  expectThat(
    "a declared host on an undeclared port is refused by the proxy",
    port.exit !== 0 && port.connect === "403",
  );
  const direct = request("https://api.github.com/zen", false);
  expectThat(
    "a request that bypasses the proxy has no route",
    direct.exit !== 0 && direct.connect !== "200",
  );
} finally {
  spawnSync("docker", ["rm", "-f", PROXY]);
  spawnSync("docker", ["network", "rm", NETWORK]);
  rmSync(directory, { recursive: true, force: true });
}

if (failures.length > 0) {
  process.stderr.write(`${String(failures.length)} check(s) failed\n`);
  process.exit(1);
}
process.stdout.write("egress proxy: every check held\n");
