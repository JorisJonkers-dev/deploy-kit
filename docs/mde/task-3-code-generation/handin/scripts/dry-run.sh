#!/usr/bin/env bash
# Holds the generated trees of the Task 3 examples to the consumers that read them: the schema check
# and the Pod Security check scripts/lint-manifests.ts runs on the oracles, and the API server of a
# disposable k3s cluster at the production version, which takes each Project's output with
# --dry-run=server.
#
#   dry-run.sh ROOT [SUBDIR] [LABEL]
#
# ROOT holds one directory per case (an example), and each case's tree is ROOT/<case>/SUBDIR: the
# directory holding apps/<project>/ and estate/. LABEL names the trees in what the script prints,
# by default "generated". From the unpacked archive, after its ./build.sh has written output/:
#
#   dry-run.sh output "" generated
#   dry-run.sh task-3-code-generation/examples expected expected
#
# Per case it runs, in order:
#   1. the schema and profile checks, through scripts/lint-manifests.ts itself, on a copy of the
#      tree laid out as that script expects (spec/v1/examples/<case>/rendered/): kubeconform 0.6.7
#      with -kubernetes-version 1.36.5 -strict against the default schemas, the datreeio CRD
#      catalogue at its pinned commit and the repository's own Client schema, and every pod template
#      against Pod Security's restricted profile plus a read-only root filesystem;
#   2. on a k3s v1.36.5 cluster started in Docker for this run alone, with the CRDs of every
#      non-core kind the trees use installed and the namespaces they declare or name created:
#      kubectl apply --dry-run=server of every Kustomize index (apps/<project>/ and each
#      estate/<share>/), then of every YAML file no index lists (the network policies) one by one.
#
# The cluster is a container named dk-evidence-k3s (DRY_RUN_CONTAINER), removed on every exit. Every
# kubectl call reads only the kubeconfig this script writes into its own temporary directory, with
# KUBECONFIG exported to it and the context named explicitly: no existing kubeconfig or context is
# read, and the script refuses to go on unless that kubeconfig points at the container's port on
# 127.0.0.1. kubeconform, kubectl and the CRDs are downloaded at pinned versions, checked against
# their SHA-256 and cached in DRY_RUN_CACHE (by default $TMPDIR/dk-dry-run-cache).
#
# Needs Docker, curl, Node (the version .nvmrc pins) and the repository this script lives in with
# its dependencies installed (npm ci), or DEPLOY_KIT naming such a checkout: the profile check is the
# repository's scripts/lib/pod-security.ts. kubeconform fetches its schemas over the network.
set -euo pipefail

usage() { echo "usage: $0 ROOT [SUBDIR] [LABEL]" >&2; exit 2; }
[ $# -ge 1 ] && [ $# -le 3 ] || usage
ROOT=$1
SUBDIR=${2:-}
LABEL=${3:-generated}
[ -d "$ROOT" ] || { echo "dry-run: $ROOT is not a directory" >&2; exit 2; }
ROOT=$(cd "$ROOT" && pwd)

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=${DEPLOY_KIT:-$(cd "$HERE/../../../../.." && pwd)}
[ -f "$REPO/scripts/lint-manifests.ts" ] ||
  { echo "dry-run: $REPO is not a deploy-kit checkout; set DEPLOY_KIT" >&2; exit 2; }
[ -d "$REPO/node_modules/yaml" ] ||
  { echo "dry-run: $REPO has no dependencies installed; run npm ci there" >&2; exit 2; }

KUBERNETES=1.36.5
IMAGE=rancher/k3s:v1.36.5-k3s1
CONTAINER=${DRY_RUN_CONTAINER:-dk-evidence-k3s}
CONTEXT=dk-evidence
CACHE=${DRY_RUN_CACHE:-${TMPDIR:-/tmp}/dk-dry-run-cache}

case "$(uname -s)" in Darwin) os=darwin ;; Linux) os=linux ;; *) echo "dry-run: unsupported OS" >&2; exit 2 ;; esac
case "$(uname -m)" in arm64 | aarch64) arch=arm64 ;; x86_64 | amd64) arch=amd64 ;; *) echo "dry-run: unsupported CPU" >&2; exit 2 ;; esac

# kubeconform 0.6.7 (the version CI pins for lint:manifests) and kubectl 1.36.5, per platform.
kubeconform_sha() {
  case "$1" in
    darwin-amd64) echo 3b5324ac4fd38ac60a49823b4051ff42ff7eb70144f1e9741fed1d14bc4fdb4e ;;
    darwin-arm64) echo cbb47d938a8d18eb5f79cb33663b2cecdee0c8ac0bf562ebcfca903df5f0802f ;;
    linux-amd64) echo 95f14e87aa28c09d5941f11bd024c1d02fdc0303ccaa23f61cef67bc92619d73 ;;
    linux-arm64) echo dc82f79bb03c5479b1ae5fd4af221e4b5a3111f62bf01a2795d9c5c20fa96644 ;;
  esac
}
kubectl_sha() {
  case "$1" in
    darwin-amd64) echo 03338828c3ba74c37bf5964573fbfbab132eb5bb15da2f821c25a4043d6eb3f0 ;;
    darwin-arm64) echo c5850a4a6b9469b26cce47c1ab456285f58e308283dcdf72b4ddda3db49b0ec0 ;;
    linux-amd64) echo 33bc88a24c3b09cf55bfd59e6ca977881b61fc3f25ab65bc80c65b430248648e ;;
    linux-arm64) echo 88fc1aca8fd0c1b44fe379f67c39bd6858bdfc50241dc55775f84d0f5b31da3a ;;
  esac
}

# The CRDs of every non-core kind the examples render, from each project's own release at the
# version the production cluster runs (docs/research/unsupported-claims.md records them: Traefik
# v3.7.12, VSO 1.5.1, prometheus-operator v0.93.1, grafana-operator v5.25.0, and Flux's
# helm-controller v1.5.3, which Flux v2.8.3 ships with notification-controller v1.8.2). Flagger is
# not recorded there; its CRDs are those of v1.45.0, the release current when the oracles were cut.
CRDS="
flux-notification.yaml c9070109809e3077376259585f1b3dfba3f2655884a89bbe35fac74c5603caec https://github.com/fluxcd/notification-controller/releases/download/v1.8.2/notification-controller.crds.yaml
flagger.yaml 58bd594b9e33deb0edceac81f6ed160b458a7933039fb295552724f656033ee5 https://raw.githubusercontent.com/fluxcd/flagger/v1.45.0/artifacts/flagger/crd.yaml
traefik.yaml 1d5e8558803804562238b0d4a57174aadd6d87c36e3c4c55199ebcc356a9406c https://raw.githubusercontent.com/traefik/traefik/v3.7.12/docs/content/reference/dynamic-configuration/kubernetes-crd-definition-v1.yml
vso-vaultauths.yaml 153d46642c788c9254c742ed6450f1159c8e7da4699981787408b2e65b20740b https://raw.githubusercontent.com/hashicorp/vault-secrets-operator/v1.5.1/chart/crds/secrets.hashicorp.com_vaultauths.yaml
vso-vaultconnections.yaml ee7f001dd645e39b6bdff44984cf9e9eeb5384518ba484b7d0afce875517283b https://raw.githubusercontent.com/hashicorp/vault-secrets-operator/v1.5.1/chart/crds/secrets.hashicorp.com_vaultconnections.yaml
vso-vaultstaticsecrets.yaml 6c4d9c3b1a6bebb1dc19681d32985b66bece3a8288bb7b1812c14196a1ae97bd https://raw.githubusercontent.com/hashicorp/vault-secrets-operator/v1.5.1/chart/crds/secrets.hashicorp.com_vaultstaticsecrets.yaml
po-podmonitors.yaml eef45bb50df838a85226eb6b03c0c7094c54d605776bdf2ec149f17fba8a1df0 https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/v0.93.1/example/prometheus-operator-crd/monitoring.coreos.com_podmonitors.yaml
po-servicemonitors.yaml 7dd4206947c94bc76f71daa07c45a1010a5d697c54fe079f8207b0e82026a26a https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/v0.93.1/example/prometheus-operator-crd/monitoring.coreos.com_servicemonitors.yaml
grafana-dashboards.yaml a3b4dd01ccf00568a7bd198e4ec4c89ab3a872cb2e962e671492a10f9595415f https://raw.githubusercontent.com/grafana/grafana-operator/v5.25.0/config/crd/bases/grafana.integreatly.org_grafanadashboards.yaml
"

sha256() { shasum -a 256 "$1" | cut -c1-64; }

# fetch URL SHA DEST: DEST holds URL's content, checked against SHA; downloaded once.
fetch() {
  if [ -f "$3" ] && [ "$(sha256 "$3")" = "$2" ]; then return; fi
  mkdir -p "$(dirname "$3")"
  curl -fsSL -o "$3.part" "$1"
  [ "$(sha256 "$3.part")" = "$2" ] || { echo "dry-run: $1 does not match its pinned SHA-256" >&2; rm -f "$3.part"; exit 1; }
  mv "$3.part" "$3"
}

WORK=$(mktemp -d "${TMPDIR:-/tmp}/dk-dry-run.XXXXXX")
cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP PIPE

# Every kubectl call reads this file and nothing else; it exists only once the cluster is up.
export KUBECONFIG="$WORK/kubeconfig"
kc() { "$KUBECTL" --kubeconfig "$KUBECONFIG" --context "$CONTEXT" "$@"; }

started=$(date +%s)

# The cases: every directory under ROOT whose tree holds apps/.
cases=""
for dir in "$ROOT"/*/; do
  name=$(basename "$dir")
  [ -d "$ROOT/$name/$SUBDIR/apps" ] && cases="$cases $name"
done
[ -n "$cases" ] || { echo "dry-run: no case under $ROOT has $SUBDIR/apps/" >&2; exit 2; }

# The tools and CRDs, at their pinned versions.
fetch "https://github.com/yannh/kubeconform/releases/download/v0.6.7/kubeconform-$os-$arch.tar.gz" \
  "$(kubeconform_sha "$os-$arch")" "$CACHE/kubeconform-0.6.7-$os-$arch.tar.gz"
tar -xzf "$CACHE/kubeconform-0.6.7-$os-$arch.tar.gz" -C "$WORK" kubeconform
KUBECONFORM="$WORK/kubeconform"
fetch "https://dl.k8s.io/release/v$KUBERNETES/bin/$os/$arch/kubectl" \
  "$(kubectl_sha "$os-$arch")" "$CACHE/kubectl-$KUBERNETES-$os-$arch"
KUBECTL="$WORK/kubectl"
cp "$CACHE/kubectl-$KUBERNETES-$os-$arch" "$KUBECTL"
chmod +x "$KUBECTL"
mkdir -p "$WORK/crds"
echo "$CRDS" | while read -r file sha url; do
  [ -n "$file" ] || continue
  fetch "$url" "$sha" "$CACHE/crds/$file"
  cp "$CACHE/crds/$file" "$WORK/crds/$file"
done

# The cluster starts in the background while the schema and profile checks run.
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" --privileged --tmpfs /run --tmpfs /var/run \
  -p 127.0.0.1::6443 "$IMAGE" server \
  --disable=traefik,servicelb,metrics-server,local-storage,coredns --disable-helm-controller \
  --disable-network-policy --tls-san 127.0.0.1 >/dev/null

failed=0
fail() { echo "  FAIL: $*"; failed=1; }

echo "== Schema and Pod Security ($LABEL)"
for name in $cases; do
  lint="$WORK/lint/$name"
  mkdir -p "$lint/spec/v1/examples/$name"
  cp -R "$ROOT/$name/$SUBDIR/." "$lint/spec/v1/examples/$name/rendered"
  # node resolves "yaml" for -e from the working directory, so these run in the repository.
  templates=$(cd "$REPO" && node --input-type=module -e '
    import { parseAllDocuments } from "yaml";
    import { readFileSync } from "node:fs";
    const pods = new Set(["Pod", "Deployment", "StatefulSet", "DaemonSet", "ReplicaSet",
      "ReplicationController", "Job", "CronJob"]);
    let n = 0;
    for (const file of process.argv.slice(1))
      for (const doc of parseAllDocuments(readFileSync(file, "utf8")))
        if (pods.has(doc.toJS()?.kind)) n++;
    console.log(n);
  ' $(find "$lint" -name '*.yaml' | sort) 2>/dev/null) || templates="?"
  set +e
  (cd "$REPO" && KUBECONFORM="$KUBECONFORM" node scripts/lint-manifests.ts "$lint") \
    >"$WORK/lint-$name.out" 2>"$WORK/lint-$name.err"
  status=$?
  set -e
  summary=$(grep -E '^Summary:' "$WORK/lint-$name.out" || true)
  findings=$(grep -c 'not restricted:' "$WORK/lint-$name.err" || true)
  echo "$name: schema: ${summary:-no summary}"
  if [ "$findings" = 0 ]; then
    echo "$name: Pod Security restricted: no finding in $templates pod templates"
  else
    echo "$name: Pod Security restricted: $findings findings in $templates pod templates"
  fi
  grep -v '^Summary:' "$WORK/lint-$name.out" | sed 's/^/  /' || true
  grep -v '^$' "$WORK/lint-$name.err" | sed 's/^/  /' || true
  if grep -q SKIPPED "$WORK/lint-$name.out" || [ -z "$summary" ]; then fail "$name: kubeconform did not run"; fi
  [ "$status" = 0 ] || fail "$name: lint-manifests exited $status"
done

# The isolated kubeconfig: the container's own, renamed and pointed at its published port.
deadline=$(($(date +%s) + 120))
until docker exec "$CONTAINER" test -s /etc/rancher/k3s/k3s.yaml 2>/dev/null; do
  [ "$(date +%s)" -lt "$deadline" ] || { echo "dry-run: k3s wrote no kubeconfig" >&2; docker logs "$CONTAINER" 2>&1 | tail -20 >&2; exit 1; }
  sleep 1
done
port=$(docker port "$CONTAINER" 6443/tcp | head -1 | sed 's/.*://')
docker cp "$CONTAINER:/etc/rancher/k3s/k3s.yaml" "$WORK/k3s.yaml" >/dev/null
sed -e "s#server: https://127.0.0.1:6443#server: https://127.0.0.1:$port#" \
  -e "s/: default\$/: $CONTEXT/" "$WORK/k3s.yaml" >"$KUBECONFIG"
chmod 600 "$KUBECONFIG"
[ "$(kc config view --minify -o 'jsonpath={.clusters[0].cluster.server}')" = "https://127.0.0.1:$port" ] ||
  { echo "dry-run: the kubeconfig does not point at the disposable cluster; stopping" >&2; exit 1; }

until kc get --raw /readyz >/dev/null 2>&1; do
  [ "$(date +%s)" -lt "$deadline" ] || { echo "dry-run: k3s did not become ready" >&2; exit 1; }
  sleep 1
done
echo "== Cluster: k3s $(kc version -o json | sed -n 's/.*"gitVersion": "\(v[^"]*k3s[^"]*\)".*/\1/p' | head -1) in $CONTAINER"

kc apply --server-side -f "$WORK/crds" 2>&1 >/dev/null | grep -v 'unrecognized format' >&2 || true
kc wait --for=condition=Established crd --all --timeout=60s >/dev/null
echo "CRDs: $(kc get crd -o name | wc -l | tr -d ' ') installed"

# The namespaces: those the trees declare as Namespace objects and those their objects name.
namespaces=$(cd "$REPO" && node --input-type=module -e '
  import { parseAllDocuments } from "yaml";
  import { readFileSync } from "node:fs";
  const names = new Set();
  for (const file of process.argv.slice(1))
    for (const doc of parseAllDocuments(readFileSync(file, "utf8"))) {
      const o = doc.toJS();
      if (o?.kind === "Namespace") names.add(o.metadata.name);
      if (o?.metadata?.namespace) names.add(o.metadata.namespace);
    }
  console.log([...names].sort().join(" "));
' $(for name in $cases; do find "$ROOT/$name/$SUBDIR" -name '*.yaml'; done))
for ns in $namespaces; do kc create namespace "$ns" --save-config >/dev/null; done
echo "Namespaces created: $namespaces"

# entries DIR: the paths DIR's kustomization lists, one per line.
entries() { sed -n '/^resources:/,/^[^ ]/s/^  - //p' "$1/kustomization.yaml"; }

# indexed DIR: every file the kustomization in DIR lists, followed into the directories it lists.
indexed() {
  for entry in $(entries "$1"); do
    if [ -d "$1/$entry" ]; then indexed "$1/$entry"; else echo "$1/$entry"; fi
  done
}

# objects FILE: the number of objects in a YAML stream.
objects() { grep -c '^kind:' "$1" || true; }

echo "== Server dry-run ($LABEL)"
for name in $cases; do
  tree="$ROOT/$name/$SUBDIR"
  tree=$(cd "$tree" && pwd)
  # The indexes: every kustomization no other kustomization lists.
  all_dirs=$(find "$tree" -name kustomization.yaml | sed 's#/kustomization.yaml$##' | sort)
  listed=$(for d in $all_dirs; do indexed "$d"; done | sort -u)
  inner=$(for d in $all_dirs; do
    for entry in $(entries "$d"); do
      if [ -d "$d/$entry" ]; then echo "$d/$entry"; fi
    done
  done | sort -u)
  total=0 accepted=0 detail=""
  for d in $all_dirs; do
    echo "$inner" | grep -qx "$d" && continue
    rel=${d#"$tree"/}
    kc kustomize "$d" >"$WORK/build.yaml"
    want=$(objects "$WORK/build.yaml")
    set +e
    got=$(kc apply --dry-run=server -f "$WORK/build.yaml" -o name 2>"$WORK/apply.err" | wc -l | tr -d ' ')
    status=$?
    set -e
    total=$((total + want)) accepted=$((accepted + got))
    detail="$detail, $rel $got/$want"
    grep -i '^warning' "$WORK/apply.err" | sed "s#^#  $rel: #" || true
    [ "$status" = 0 ] && [ "$got" = "$want" ] ||
      { sed "s#^#  $rel: #" "$WORK/apply.err"; fail "$name: $rel: $got of $want objects accepted"; }
  done
  echo "$name: indexed objects accepted: $accepted/$total (${detail#, })"
  # The files no index lists, one by one.
  unlisted_total=0 unlisted_ok=0 unlisted=""
  for f in $(find "$tree" -name '*.yaml' ! -name kustomization.yaml | sort); do
    echo "$listed" | grep -qx "$f" && continue
    want=$(objects "$f")
    set +e
    got=$(kc apply --dry-run=server -f "$f" -o name 2>"$WORK/apply.err" | wc -l | tr -d ' ')
    status=$?
    set -e
    unlisted_total=$((unlisted_total + want)) unlisted_ok=$((unlisted_ok + got))
    unlisted="$unlisted $f"
    grep -i '^warning' "$WORK/apply.err" | sed "s#^#  ${f#"$tree"/}: #" || true
    [ "$status" = 0 ] && [ "$got" = "$want" ] ||
      { sed "s#^#  ${f#"$tree"/}: #" "$WORK/apply.err"; fail "$name: ${f#"$tree"/}: $got of $want objects accepted"; }
  done
  echo "$name: objects no index lists, accepted file by file: $unlisted_ok/$unlisted_total ($(
    [ -z "$unlisted" ] || awk '/^kind:/{print $2}' $unlisted | sort | uniq -c | awk '{printf "%s%s %s", sep, $1, $2; sep=", "}'))"
done

echo "== $(($(date +%s) - started)) s; $([ "$failed" = 0 ] && echo "every check passed" || echo "FAILED")"
exit "$failed"
