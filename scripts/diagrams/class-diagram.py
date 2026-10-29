#!/usr/bin/env python3
"""Render chapter 10's class diagram from the mermaid block that mirrors it.

The drawing and the mermaid cannot disagree, because the mermaid IS the source:
this reads the `classDiagram` block out of spec/v1/10-project-intent.md and
emits a .drawio file, which draw.io then exports to the committed SVG.

Layout rules, in the order they matter:

1. The composition edges form a spanning tree. Every node sits exactly one
   layer below its tree parent. The closed vocabularies are NOT in this
   drawing: seventeen boxes of two or three words each said nothing the
   attribute's type name had not already said, and the lines reaching them are
   what made the model unreadable. They live in a table in the chapter, under
   "The closed vocabularies".
2. **One bus per parent.** All of a parent's edges share one horizontal run, so
   its children read as one aligned fan, and each parent's bus sits at its own
   height in the gap so no two fans overlay. Nothing crosses.
3. **Labels sit on the child's vertical drop**, close to the target, not on the
   shared run. That is what lets the run be shared: the drops are at distinct x,
   so the names never pile up.
4. A row gap is sized to hold the deepest lane stack any parent above it needs,
   plus a reserved band above the row for sibling cross-links, which sits above
   the tree labels rather than among them.
5. Edges that are not tree edges are routed by distance.
   - Two nodes on the same layer that sibling order made **neighbours** get a
     short run in the band **below** their row, out of the way of the fan that
     feeds them from above.
   - Two nodes on the same layer with boxes **facing each other** get a single
     straight line side to side, at a height inside both.
   - Anything spanning two or more layers is **not drawn**. Those relations are
     prose in the chapter, and a line that long is what made this drawing
     unreadable twice.

Usage:
    python3 scripts/diagrams/class-diagram.py [chapter] out.drawio
    /Applications/draw.io.app/Contents/MacOS/draw.io -x -f svg -e -b 10 \
        -o spec/v1/diagrams/<chapter>-model.drawio.svg out.drawio

`chapter` is `10-project-intent` (the default) or `14-platform-intent`.

The Task 1 report's three landscape class diagrams use `--report`:
    F=docs/mde/task-1-metamodelling/Figures
    python3 scripts/diagrams/class-diagram.py --report \
        --source=$F/project-document.md 10-project-intent p.drawio
    python3 scripts/diagrams/class-diagram.py --report 14-platform-intent s.drawio
    python3 scripts/diagrams/class-diagram.py --report 20-resolved-deployment t.drawio
    /Applications/draw.io.app/Contents/MacOS/draw.io -x -f pdf --crop -b 4 \
        -o $F/project-document.pdf p.drawio   # and so on for the other two

The Task 2 report's three class diagrams use `--report` the same way, each
from its own mermaid block, and `--changes` where the drawing compares the
model with Task 1's:
    F=docs/mde/task-2-transformations/Figures
    python3 scripts/diagrams/class-diagram.py --report \
        --source=$F/pinned-inputs.md task2-pinned-inputs i.drawio
    for v in application process; do
      python3 scripts/diagrams/class-diagram.py --report --changes --view=$v \
          --source=$F/target-decisions.md task2-target-decisions d-$v.drawio
    done
    python3 scripts/diagrams/class-diagram.py --report --changes \
        --source=$F/target-files.md task2-target-files f.drawio

`--font-size=N` and `--heading-font-size=N` set report diagram text sizes
(draw.io pixels), with defaults of 12 and 13. Choose them for the size at
which the PDF is included, so printed labels meet the report's 10 pt minimum.
`--layout=file.json` supplies report `columns`, `roots` and optional `beside`
groups for a view of the same Mermaid source. `root_columns` can stack
independent root classes in columns instead of rows. Only the classes named
by that layout are drawn; their features and relationships still come from
the source. `--view=NAME` does the same from the script's own
`REPORT_LAYOUTS["<chapter>/NAME"]`, and a layout's `rows` wraps one parent's
children onto several fans, one below the other.

With `--changes`, a class marked `<<new>>` shows «new» above its name, and
every class keeps its layer's colours as in Task 1; an attribute row ending in `[new]` is bold, and one
ending in `[removed]` is struck through. A class marked `<<abstract>>` has its
name in italics, and `Parent <|-- Child` draws generalisation, a hollow
triangle at the parent, as a tree edge in place of a containment.

CHILDREN below is the only hand-maintained part: it fixes the tree parent of
each node and the sibling order. Sibling order is chosen so that cross-links
land between neighbours. Adding a class or an enumeration to the mermaid
without adding it here fails loudly.
"""
import json, re, sys, xml.etree.ElementTree as ET

# `chapter` may name one class after a colon, and then any number of classes to
# leave out after a minus: `20-resolved-deployment:ResolvedProcess-ResolvedGrant`.
# The drawing is that class's own subtree with the named subtrees cut out of it,
# which is how a diagram too wide for a printed page is split without a second
# source: the mermaid stays one block and every part is cut from it.
#
# `--report` draws the whole model compactly for one landscape page instead
# (REPORT_LAYOUTS below), and `--source=<file.md>` reads the mermaid block from
# that file instead of the chapter.
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
FLAGS = {a[2:].partition("=")[0]: a[2:].partition("=")[2]
         for a in sys.argv[1:] if a.startswith("--")}
CHAPTER = ARGS[0] if len(ARGS) > 1 else "10-project-intent"
CHAPTER, _, SUBTREE = CHAPTER.partition(":")
SUBTREE, *DROPPED = SUBTREE.split("-")
OUT = ARGS[-1]
MD = FLAGS.get("source") or f"spec/v1/{CHAPTER}.md"
REPORT = "report" in FLAGS
CHANGES = "changes" in FLAGS
src = open(MD).read()
body = re.search(r"```mermaid\nclassDiagram\n(.*?)\n```", src, re.S).group(1)

nodes = {}
for name, blk in re.findall(r"    class (\w+) \{(.*?)\n    \}", body, re.S):
    rows = [l.strip() for l in blk.strip("\n").split("\n") if l.strip()]
    flags = {r[2:-2] for r in rows if r.startswith("<<")}
    kind = "enum" if "enumeration" in flags else "class"
    rows = [r for r in rows if not r.startswith("<<")]
    # a row ending in [new] or [removed] marks a change against Task 1
    marks = [(re.search(r"\s\[(new|removed)\]$", r) or [None, None])[1] for r in rows]
    rows = [re.sub(r"\s\[(new|removed)\]$", "", r) for r in rows]
    if kind == "class":
        rows = [re.sub(r"^\+\s*(\S+)\s+(\S+)$", r"+ \1  \2", r) for r in rows]
    nodes[name] = {"kind": kind, "rows": rows, "notes": [], "flags": flags, "marks": marks}

comp, dep, assoc, gen = [], [], [], set()
for line in body.split("\n"):
    m = re.match(r"\s*(\w+)\s+<\|--\s+(\w+)\s*$", line)
    if m:
        gen.add((m.group(1), m.group(2)))
        continue
    m = re.match(r'\s*(\w+)\s+"([^"]+)"\s+\*--\s+"([^"]+)"\s+(\w+)\s*:\s*(.*)', line)
    if m:
        comp.append((m.group(1), m.group(4), m.group(3), m.group(5).strip()))
        continue
    m = re.match(r"\s*(\w+)\s+\.\.>\s+(\w+)\s*:\s*(.*)", line)
    if m:
        dep.append((m.group(1), m.group(2), m.group(3).strip()))
        continue
    # an association: a reference the model resolves, drawn as a solid open arrow
    m = re.match(r"\s*(\w+)\s+-->\s+(\w+)\s*:\s*(.*)", line)
    if m:
        assoc.append((m.group(1), m.group(2), m.group(3).strip()))

# The tree. Sibling order puts cross-link partners next to each other:
# Surface is Process's last child and Route is Exposure's first, so the two
# `resolves by name` edges and `Route -> Audience` all land between neighbours.
TREES = {"10-project-intent": {
    "Project": ["Application"],
    "Application": ["Dashboard", "AlertRules", "Client", "Migration", "Observability", "Process",
                    "Exposure", "L4Exposure"],
    "Observability": ["Scrape"],
    # No Shared Intent family is drawn. Eight of them at three levels each is
    # more relations than a reader can hold, and drawing them at one level
    # would say the level is where they live. The levels are the chapter's own
    # table and each family's own section.
    # Surface stays last, and Route stays Exposure's first, so the one
    # cross-link lands between neighbours.
    "Process": ["Capacity", "ApiAccess", "SpawnTemplate", "Sidecar", "Probe", "Volume", "LibraryMount", "Surface"],
    "ApiAccess": ["ApiRule"],
    "Exposure": ["Route"],
    "Route": ["RateLimit"],
}, "14-platform-intent": {
    "Platform": [
        "PlatformMetadata", "Substrate", "Bootstrap", "Tier", "DurabilityPolicies",
        "EnginePolicies", "MonitorCadence", "TelemetryPolicy", "ProbeCadence",
        "EphemeralPolicy", "MigrationPolicy", "DeliveryPolicy", "ApiAccessPolicy",
        "VaultPolicyJob", "Provider", "Library", "GpuVendor", "VpnPolicy", "Acme", "Monitoring",
        "HumanGrant", "L4Address", "PriorityPolicy", "MeshPolicy", "SignIn", "NodeAgent",
    ],
    "Bootstrap": ["FluxSource", "VaultState"],
    "FluxSource": ["RenderedArtifacts"],
    "RenderedArtifacts": ["ArtifactSigner"],
    "DurabilityPolicies": ["DurabilityPolicy"],
    "DurabilityPolicy": ["OffClusterCopy"],
    "OffClusterCopy": ["DestinationRange"],
    "EnginePolicies": ["EnginePolicy"],
    "EnginePolicy": ["MoveMethod"],
    "DeliveryPolicy": ["AnalysisPolicy", "MovePolicy"],
    "Tier": ["ForwardAuth", "TierDns"],
    "TelemetryPolicy": ["DashboardPolicy"],
    "Monitoring": ["Receiver", "SeverityRoute"],
    "PriorityPolicy": ["PriorityClass"],
}, "20-resolved-deployment": {
    # Sibling order puts GateMember next to ResolvedProbe, so the one
    # cross-link on the drawing joins two neighbours: the migration, whose
    # database sits a layer down, comes before the gate and not between them.
    "ResolvedDeployment": [
        "Provenance", "PathAssignment", "ReconcileUnit", "ResolvedPolicyJob",
        "ResolvedCatalogJob", "ResolvedEvents",
        "ResolvedApplication",
    ],
    "Provenance": ["InputDigest"],
    "ResolvedCatalogJob": ["ResolvedCatalog", "ResolvedBucketCatalog"],
    "ResolvedBucketCatalog": ["CatalogAdminToken", "CatalogKey"],
    "ResolvedCatalog": ["CatalogAdmin", "CatalogDatabase"],
    "ResolvedApplication": [
        "ResolvedDashboards", "ResolvedAlertRules", "ResolvedAlerting", "ResolvedClient",
        "ResolvedMesh", "ResolvedMigration", "ReleaseGate", "ResolvedScrape", "ResolvedProcess",
        "ResolvedExposure",
    ],
    "ReleaseGate": ["GateMigration", "GateAnalysis", "GateMember"],
    "GateMember": ["GateProvider"],
    "ResolvedMigration": ["MigratedDatabase"],
    "ResolvedProcess": [
        "ResolvedProbe", "StartupProbe", "ResolvedPlacement", "ResolvedApiAccess",
        "ResolvedVolume", "ResolvedLibraryMount", "ResolvedGpu", "ResolvedVpn",
        "ResolvedGrant", "ResolvedEngineGrant", "ResolvedAsset",
        "ResolvedSidecar", "ResolvedEdge",
        "WritablePath", "EnvEntry", "ResolvedSurface", "IngressPeer",
        "EgressPeer", "InternetEgress", "GateMembersPeer", "ResolvedClientGrant",
        "ResolvedSpawn", "ResolvedMove", "ResolvedPoolExposure", "ResolvedNodeExposure",
        "ResolvedEdgeProxy",
    ],
    "ResolvedDashboards": ["ResolvedDashboard"],
    "ResolvedAlerting": ["ResolvedReceiver", "ResolvedSeverityRoute"],
    "ResolvedPoolExposure": ["ResolvedL4Port"],
    "ResolvedEdgeProxy": ["ResolvedResolver"],
    "ResolvedApiAccess": ["ResolvedApiRule"],
    "ResolvedVolume": ["BackupPlan"],
    "BackupPlan": ["BackupPeer", "DestinationRange", "OffClusterPlan"],
    "EnvEntry": ["SecretReference"],
    "ResolvedEngineGrant": ["PolicyPath"],
    "ResolvedEdge": ["PolicyPeer"],
    "ResolvedExposure": ["ResolvedRoute", "TierProxy", "ResolvedTierDns"],
    "ResolvedRoute": ["MiddlewareStep", "GateAddress"],
}}
NAMES = {"10-project-intent": "Project Intent - the layer-1 model",
         "14-platform-intent": "Platform Intent - the model",
         "20-resolved-deployment": "Resolved Deployment - the layer-2 model",
         "task2-pinned-inputs": "Pinned inputs - the Task 2 metamodel",
         "task2-target-decisions": "Resolved Deployment - decisions changed in Task 2",
         "task2-target-files": "Resolved Deployment - generated files in Task 2"}
# the layer palette of spec/v1/diagrams/README.md
FILL, WASH, STROKE = {"10-project-intent": ("#dbeafe", "#f4f8ff", "#1e40af"),
                      "14-platform-intent": ("#e0e7ff", "#f5f6ff", "#4338ca"),
                      "20-resolved-deployment": ("#fef3c7", "#fffbf0", "#b45309"),
                      "task2-pinned-inputs": ("#e2e8f0", "#f8fafc", "#475569"),
                      "task2-target-decisions": ("#fef3c7", "#fffbf0", "#b45309"),
                      "task2-target-files": ("#fef3c7", "#fffbf0", "#b45309")}[CHAPTER]
CHILDREN = TREES.get(CHAPTER, {})

# --report: the whole model on one landscape page. The layered layout above
# gives every leaf its own column, which for a whole model is several times
# wider than a page. Here each parent's children are grouped into columns by
# hand: a column of one child hangs below the parent's bus, as above, and a
# column of several is a stack whose trunk runs down its left edge and enters
# each child from the left. A child in `beside` sits to the right of its
# parent instead. Links that are not containment are drawn only where the two
# boxes face each other or one bend joins them without crossing a box.
REPORT_LAYOUTS = {"10-project-intent": {
    "columns": {
        "Project": [["Application"]],
        # Grant sits left of Process, so Process's own `secrets` link is short
        "Application": [["Grant", "Migration", "Observability"], ["Process"], ["Exposure"]],
        "Observability": [["Scrape"]],
        "Grant": [["Rotation"]],
        # DependencyEdge and Surface open their columns, so both links into
        # Surface, from DependencyEdge and from Route, are straight lines
        "Process": [["Capacity", "ApiAccess", "Sidecar", "Probe", "Asset"], ["Volume", "Placement"],
                    ["DependencyEdge", "EnvFile"], ["Surface"]],
        "ApiAccess": [["ApiRule"]],
        "Placement": [["GpuRequest", "DiskRequest"]],
        "DependencyEdge": [["Credentials"]],
        "EnvFile": [["Placeholder"]],
        "Exposure": [["Route"]],
        "Route": [["RateLimit"]],
    },
    "beside": {"Application"},
    "gaps": {("Process", 3): 150, ("Application", 2): 70},
}, "14-platform-intent": {
    "columns": {
        "Platform": [
            ["PlatformMetadata", "Substrate", "MonitorCadence", "TelemetryPolicy", "ProbeCadence",
             "EphemeralPolicy"],
            ["Bootstrap"], ["Tier", "Provider"], ["DurabilityPolicies", "EnginePolicies"],
            ["MigrationPolicy", "DeliveryPolicy", "ApiAccessPolicy", "VaultPolicyJob"],
        ],
        "Bootstrap": [["FluxSource", "VaultState"]],
        "FluxSource": [["RenderedArtifacts"]],
        "RenderedArtifacts": [["ArtifactSigner"]],
        "DurabilityPolicies": [["DurabilityPolicy"]],
        "DurabilityPolicy": [["OffClusterCopy"]],
        "OffClusterCopy": [["DestinationRange"]],
        "EnginePolicies": [["EnginePolicy"]],
        "DeliveryPolicy": [["AnalysisPolicy"]],
    },
    "beside": set(),
    "gaps": {},
}, "20-resolved-deployment": {
    "columns": {
        "ResolvedDeployment": [["Provenance", "PathAssignment", "ReconcileUnit",
                                "ResolvedPolicyJob", "ResolvedEvents"],
                               ["ResolvedApplication"]],
        "Provenance": [["InputDigest"]],
        "ResolvedApplication": [["ResolvedMigration", "ReleaseGate"], ["ResolvedProcess"],
                                ["ResolvedExposure"]],
        "ReleaseGate": [["GateMember", "GateAnalysis", "GateMigration"]],
        "ResolvedMigration": [["MigratedDatabase"]],
        "ResolvedProcess": [["ResolvedProbe", "StartupProbe", "ResolvedPlacement"],
                            ["ResolvedVolume", "ResolvedEdge", "ResolvedApiAccess"],
                            ["ResolvedGrant", "WritablePath", "EnvEntry"]],
        "ResolvedVolume": [["BackupPlan"]],
        "BackupPlan": [["BackupPeer", "DestinationRange"]],
        "ResolvedApiAccess": [["ResolvedApiRule"]],
        "ResolvedEdge": [["PolicyPeer"]],
        "ResolvedExposure": [["ResolvedRoute"]],
        "ResolvedRoute": [["MiddlewareStep"]],
    },
    "beside": {"ResolvedApplication"},
    "gaps": {},
}, "task2-pinned-inputs": {
    "columns": {
        "NodeContract": [["Node"]],
        "Node": [["Allocatable"], ["Gpu"], ["Disk"]],
        "ImagesLock": [["LockedImage"]],
        "ClusterState": [["Binding"], ["CurrentPlacement"], ["RollbackBackup"]],
        "MigrationProof": [["ProvenApplication"]],
    },
    "roots": [["NodeContract", "ImagesLock"], ["ClusterState", "MigrationProof", "AssetFile"]],
    "beside": set(),
    "gaps": {},
}, "task2-target-decisions": {
    "columns": {
        "ResolvedDeployment": [["ResolvedPolicyJob", "ResolvedEvents"], ["ResolvedApplication"]],
        "ResolvedPolicyJob": [["PolicyPeer"]],
        "ResolvedApplication": [["ReleaseGate", "ResolvedScrape"], ["ResolvedMigration"],
                                ["ResolvedProcess"], ["ResolvedExposure"]],
        "ReleaseGate": [["GateAnalysis", "GateMigration"]],
        "ResolvedMigration": [["MigratedDatabase"], ["ResolvedGrant"]],
        "ResolvedGrant": [["PolicyPath"]],
        "ResolvedProcess": [["StartupProbe", "ResolvedApiAccess", "EnvEntry"],
                            ["ResolvedVolume", "ResolvedAsset", "ResolvedSidecar"]],
        "ResolvedApiAccess": [["ResolvedApiRule", "AdmittedRange"]],
        "ResolvedVolume": [["BackupPlan"]],
        "BackupPlan": [["BackupPeer"]],
        "EnvEntry": [["SecretReference"]],
    },
    "beside": {"ResolvedApplication"},
    "gaps": {},
}, "task2-target-decisions/application": {
    # the Task 2 report's decision classes in two fans: the deployment and
    # application level here, the process subtree in the next view
    "columns": {
        "ResolvedDeployment": [["ResolvedPolicyJob"], ["ResolvedEvents"], ["ResolvedApplication"]],
        "ResolvedPolicyJob": [["PolicyPeer"]],
        "ResolvedApplication": [["ReleaseGate"], ["ResolvedScrape"], ["ResolvedMigration"],
                                ["ResolvedExposure"]],
        "ReleaseGate": [["GateAnalysis"], ["GateMigration"]],
        "ResolvedMigration": [["MigratedDatabase"], ["ResolvedGrant"]],
        "ResolvedGrant": [["PolicyPath"]],
    },
    "beside": set(),
    "gaps": {},
}, "task2-target-decisions/process": {
    "columns": {
        "ResolvedProcess": [["StartupProbe"], ["ResolvedApiAccess"], ["EnvEntry"],
                            ["ResolvedVolume"], ["ResolvedAsset"], ["ResolvedSidecar"]],
        "ResolvedApiAccess": [["ResolvedApiRule"], ["AdmittedRange"]],
        "ResolvedVolume": [["BackupPlan"]],
        "BackupPlan": [["BackupPeer"]],
        "EnvEntry": [["SecretReference"]],
    },
    "beside": set(),
    "gaps": {},
}, "task2-target-files": {
    # one fan wrapped onto four rows: the Task 1 file kinds in the first two,
    # the kinds Task 2 added in the last two
    "columns": {
        "NetworkPolicyFile": [["ProcessPolicy"]],
        "SecretFile": [["SecretHolder"]],
        "PolicyJobFile": [["PolicyDocument"]],
    },
    "rows": {
        "Deliverable": [["NamespaceFile", "IndexFile", "WorkloadFile", "SwitchoverFile",
                         "IdentityFile"],
                        ["NetworkPolicyFile", "IngressRouteFile", "MonitorFile", "SecretFile"],
                        ["MigrationFile", "BudgetFile", "RbacFile", "ServiceFile", "ClaimFile",
                         "ConfigMapFile"],
                        ["BackupFile", "ConnectionFile", "VaultPolicyFile", "PolicyJobFile",
                         "EventsFile", "VaultRoleFile"]],
    },
    "beside": set(),
    "gaps": {},
}}

# Helvetica advance widths, per 1000 units of the font size
HELV = dict(zip(
    " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`"
    "abcdefghijklmnopqrstuvwxyz{|}~",
    [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278]
    + [556] * 10
    + [278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278,
       500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667,
       611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222,
       222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
       500, 334, 260, 334, 584]))


def report():
    layout_file, view = FLAGS.get("layout"), FLAGS.get("view")
    if layout_file:
        with open(layout_file) as f:
            lay = json.load(f)
    else:
        lay = REPORT_LAYOUTS[f"{CHAPTER}/{view}" if view else CHAPTER]
    cols_of, beside, gaps = lay["columns"], set(lay.get("beside", [])), lay.get("gaps", {})
    FS = int(FLAGS.get("font-size") or 12)
    HFS = int(FLAGS.get("heading-font-size") or 13)
    ROW, HEAD = 18, 30
    INDENT, LBL, SGAP, HG, VG1, BUS1, BUS2 = 26, 17, 14, 34, 42, 16, 42

    def textw(s, fs=FS, bold=False):
        return sum(HELV.get(ch, 600) for ch in s) / 1000.0 * fs * (1.1 if bold else 1.0)

    kids = {p: [c for col in cs for c in col] for p, cs in cols_of.items()}
    # `rows`: a parent whose children are too many for one fan wraps them onto
    # several rows, each row a fan on its own bus; the trunk joining the buses
    # runs down the left edge, clear of the rows above
    rows_of = lay.get("rows", {})
    for p, rs in rows_of.items():
        kids[p] = [c for r in rs for c in r]
    # a model with several root classes lists them in `roots`: rows top to
    # bottom, each row's roots left to right
    root_rows = lay.get("root_columns") or lay.get("roots") or [[next(p for p in kids
                                           if all(p not in ks for ks in kids.values()))]]
    roots = [r for row in root_rows for r in row]
    placed = set(roots) | {c for ks in kids.values() for c in ks}
    render_nodes = ({n: d for n, d in nodes.items() if n in placed}
                    if layout_file or view else nodes)
    assert placed == set(render_nodes), (f"missing {sorted(set(render_nodes) - placed)}, "
                                  f"unknown {sorted(placed - set(nodes))}")
    tree = {(p, c) for p, ks in kids.items() for c in ks}
    for p, c in tree:
        assert (p, c) in gen or any(e[0] == p and e[1] == c for e in comp), \
            f"{p} neither contains nor generalises {c}"

    # --changes: a class new in Task 2 carries «new» above its name, on a header
    # one line taller; every class keeps its layer's colours, as in Task 1
    def head(n):
        return HEAD + 16 if CHANGES and "new" in render_nodes[n]["flags"] else HEAD

    size = {}
    for n, d in render_nodes.items():
        w = max([textw(n, HFS, True) + 24]
                + [textw(r, bold=m == "new") + 22 for r, m in zip(d["rows"], d["marks"])] + [110])
        size[n] = (int(w + 1) // 2 * 2, head(n) + ROW * len(d["rows"]))

    comp_label = {(a, b): [""] for a, b in gen}
    for a, b, mult, label in comp:
        comp_label.setdefault((a, b), []).append(f"{mult}  {label}")

    # a block: its size, where each box sits, its edges and its free labels,
    # all relative to the block's top left corner
    def shift(blk, dx, dy):
        blk["boxes"] = {n: (x + dx, y + dy) for n, (x, y) in blk["boxes"].items()}
        blk["edges"] = [dict(e, pts=[(x + dx, y + dy) for x, y in e["pts"]])
                        for e in blk["edges"]]
        blk["labels"] = [(x + dx, y + dy, t) for x, y, t in blk["labels"]]
        return blk

    def merge(into, blk):
        into["boxes"].update(blk["boxes"])
        into["edges"] += blk["edges"]
        into["labels"] += blk["labels"]

    def stacked(p, c, blk, trunk_x, from_pts, exit_x):
        """Edges from p into the stacked child c, entering its left side."""
        bx, by = blk["boxes"][c]
        _, hc = size[c]
        labels = comp_label[(p, c)]
        out = []
        for k in range(len(labels)):
            ey = by + HEAD * (0.5 if len(labels) == 1 else 0.3 + 0.45 * k)
            out.append({"kind": "comp", "a": p, "b": c, "label": "",
                        "pts": from_pts + [(trunk_x, ey)], "exit": (exit_x, 1),
                        "entry": (0, (ey - by) / hc)})
        return out, (bx + 2, by - band(p, c), "\n".join(labels))

    def band(p, c):
        """The height above a stacked child that holds its link names, one a line."""
        return LBL * len([l for l in comp_label[(p, c)] if l])

    def wrapped(n):
        wn, hn = size[n]
        blk = {"w": wn, "h": hn, "boxes": {}, "edges": [], "labels": []}
        rows = []
        for r in rows_of[n]:
            x, parts = 0.0, []
            for c in r:
                cb = layout(c)
                cx, _ = cb["boxes"][c]
                parts.append((x, cb, c, cx + size[c][0] / 2))
                x += cb["w"] + HG
            rows.append(parts)
        first, last = rows[0][0][0] + rows[0][0][3], rows[0][-1][0] + rows[0][-1][3]
        nx = INDENT + (first + last) / 2 - wn / 2
        dx = max(0, -nx)
        blk["boxes"][n] = (nx + dx, 0)
        ncx, trunk = nx + dx + wn / 2, INDENT / 2 + dx
        bus, h = hn + BUS1, hn
        for k, parts in enumerate(rows):
            top, bottom = bus + BUS2, bus + BUS2
            for px, cb, c, anchor in parts:
                shift(cb, INDENT + dx + px, top)
                merge(blk, cb)
                bottom = max(bottom, top + cb["h"])
                drop = INDENT + dx + px + anchor
                route = ([(ncx, bus), (drop, bus)] if k == 0 else
                         [(ncx, hn + BUS1), (trunk, hn + BUS1), (trunk, bus), (drop, bus)])
                for lab in comp_label[(n, c)]:
                    blk["edges"].append({"kind": "comp", "a": n, "b": c, "label": lab,
                                         "pts": route, "exit": (0.5, 1), "entry": (0.5, 0),
                                         "at": 1, "lift": -16})
                blk["w"] = max(blk["w"], INDENT + dx + px + cb["w"], nx + dx + wn)
            h, bus = bottom, bottom + BUS1 + 8
        blk["h"] = h
        return blk

    def layout(n, min_bus=0):
        if n in rows_of:
            return wrapped(n)
        wn, hn = size[n]
        blk = {"w": wn, "h": hn, "boxes": {n: (0, 0)}, "edges": [], "labels": []}
        cols = [[c for c in col if c not in beside] for col in cols_of.get(n, [])]
        cols = [col for col in cols if col]
        side = [c for c in kids.get(n, []) if c in beside]
        bus = max(hn + BUS1, min_bus)
        if len(cols) == 1 and len(cols[0]) == 1:
            c = cols[0][0]
            cb = layout(c)
            cx, _ = cb["boxes"][c]
            wc, _ = size[c]
            nx = cx + wc / 2 - wn / 2
            shift(cb, max(0, -nx), hn + VG1)
            nx = max(0, nx)
            blk["boxes"][n] = (nx, 0)
            merge(blk, cb)
            blk["w"], blk["h"] = max(nx + wn, cb["w"] + max(0, -(cx + wc / 2 - wn / 2))), hn + VG1 + cb["h"]
            for k, lab in enumerate(comp_label[(n, c)]):
                blk["edges"].append({"kind": "comp", "a": n, "b": c, "label": lab, "pts": [],
                                     "exit": (0.5, 1), "entry": (0.5, 0), "at": 0})
        elif len(cols) == 1:
            y = max(hn + 8, min_bus)
            w = wn
            for c in cols[0]:
                y += band(n, c)
                cb = shift(layout(c), INDENT, y)
                merge(blk, cb)
                es, lab = stacked(n, c, cb, INDENT / 2, [], (INDENT / 2) / wn)
                blk["edges"] += es
                blk["labels"].append(lab)
                w = max(w, INDENT + cb["w"])
                y += cb["h"] + SGAP
            blk["w"], blk["h"] = w, y - SGAP
        elif cols:
            top = bus + BUS2
            x, parts = 0.0, []
            for i, col in enumerate(cols):
                if i:
                    x += gaps.get((n, i), HG)
                if len(col) == 1:
                    cb = layout(col[0])
                    cx, _ = cb["boxes"][col[0]]
                    parts.append((x, "top", [cb], cx + size[col[0]][0] / 2))
                    x += cb["w"]
                else:
                    y, cbs, w = 0.0, [], 0
                    for k, c in enumerate(col):
                        y += band(n, c) if k else 0
                        cb = shift(layout(c), INDENT, y)
                        cbs.append(cb)
                        w = max(w, INDENT + cb["w"])
                        y += cb["h"] + SGAP
                    parts.append((x, "stack", cbs, INDENT / 2))
                    x += w
            first, last = parts[0][0] + parts[0][3], parts[-1][0] + parts[-1][3]
            nx = (first + last) / 2 - wn / 2
            dx = max(0, -nx)
            nx += dx
            blk["boxes"][n] = (nx, 0)
            ncx = nx + wn / 2
            h = hn
            for px, mode, cbs, anchor in parts:
                ax = px + dx + anchor
                for cb in cbs:
                    shift(cb, px + dx, top)
                    merge(blk, cb)
                    h = max(h, top + cb["h"])
                if mode == "top":
                    c = next(iter(k for k in cbs[0]["boxes"] if k in kids.get(n, [])))
                    for k, lab in enumerate(comp_label[(n, c)]):
                        drop = ax + 0.24 * size[c][0] * k
                        blk["edges"].append({"kind": "comp", "a": n, "b": c, "label": lab,
                                             "pts": [(ncx, bus), (drop, bus)],
                                             "exit": (0.5, 1), "entry": (0.5 + 0.24 * k, 0),
                                             "at": 1, "lift": -16 - 18 * k})
                else:
                    for cb in cbs:
                        c = next(iter(k for k in cb["boxes"] if k in kids.get(n, [])))
                        es, lab = stacked(n, c, cb, ax, [(ncx, bus), (ax, bus)], 0.5)
                        blk["edges"] += es
                        blk["labels"].append(lab)
            blk["w"], blk["h"] = max(x + dx, nx + wn), h
        for c in side:
            # the parent sits left of the child's box, at its height; the
            # child's bus drops below the parent so the parent clears it
            bare = len(blk["boxes"]) == 1
            cb = layout(c, min_bus=hn + 12 if bare else 0)
            cx, _ = cb["boxes"][c]
            lab = "  ·  ".join(comp_label[(n, c)])
            gap = textw(lab) + 40
            if bare:
                # the parent may sit over the child's children, left of its box
                ox = max(0, wn + gap - cx)
                shift(cb, ox, 0)
                nx = cx + ox - gap - wn
                blk["boxes"][n] = (nx, 0)
            else:
                # the parent keeps its own children below it, and the child's
                # block starts right of them
                nx, _ = blk["boxes"][n]
                ox = max(blk["w"] + HG, nx + wn + gap - cx)
                shift(cb, ox, 0)
                gap = cx + ox - nx - wn
            merge(blk, cb)
            yl = HEAD / 2
            blk["edges"].append({"kind": "comp", "a": n, "b": c, "label": lab, "pts": [],
                                 "exit": (1, yl / hn), "entry": (0, yl / size[c][1]),
                                 "at": 0, "lift": -10})
            blk["w"], blk["h"] = max(nx + wn, blk["w"], cb["w"] + ox), max(blk["h"], cb["h"])
        return blk

    def beside_each_other(blocks, gap):
        out = blocks[0]
        for b in blocks[1:]:
            dx = out["w"] + gap
            merge(out, shift(b, dx, 0))
            out["w"], out["h"] = dx + b["w"], max(out["h"], b["h"])
        return out

    def one_above_another(blocks):
        out = blocks[0]
        for b in blocks[1:]:
            dy = out["h"] + VG1
            merge(out, shift(b, 0, dy))
            out["w"], out["h"] = max(out["w"], b["w"]), dy + b["h"]
        return out

    if lay.get("root_columns"):
        top_blk = beside_each_other(
            [one_above_another([layout(r) for r in col]) for col in root_rows], HG * 2)
    else:
        top_blk = one_above_another(
            [beside_each_other([layout(r) for r in row], HG * 2) for row in root_rows])
    for e in top_blk["edges"]:
        if (e["a"], e["b"]) in gen:
            e["kind"] = "gen"
    top_blk["labels"] = [(x, y, t) for x, y, t in top_blk["labels"] if t]
    boxes = {n: (int(x) + 12, int(y) + 12) for n, (x, y) in top_blk["boxes"].items()}
    shift(top_blk, 12, 12)

    def rect(n):
        x, y = boxes[n]
        return x, y, size[n][0], size[n][1]

    names = [(x, y, max(textw(t) for t in lab.split("\n")) + 4, LBL * (lab.count("\n") + 1))
             for x, y, lab in top_blk["labels"]]

    def clear(seg, skip):
        (x1, y1), (x2, y2) = seg
        lo_x, hi_x, lo_y, hi_y = min(x1, x2), max(x1, x2), min(y1, y2), max(y1, y2)
        for x, y, w, h in [rect(m) for m in boxes if m not in skip] + names:
            if x - 4 < hi_x and lo_x < x + w + 4 and y - 4 < hi_y and lo_y < y + h + 4:
                return False
        return True

    cross = [("comp", a, b, f"{m}  {l}") for a, b, m, l in comp if (a, b) not in tree]
    cross += [("assoc", a, b, l) for a, b, l in assoc]
    cross += [("dep", a, b, f"«{l}»") for a, b, l in dep]
    skipped = []
    for kind, a, b, label in cross:
        if a not in boxes or b not in boxes:
            continue
        xa, ya, wa, ha = rect(a)
        xb, yb, wb, hb = rect(b)
        edge = None
        lo, hi = max(ya, yb) + 8, min(ya + ha, yb + hb) - 8
        if lo <= hi and (xa + wa < xb or xb + wb < xa):
            for y in sorted(range(int(lo), int(hi) + 1, 4), key=lambda v: abs(v - (lo + hi) / 2)):
                left, right = (a, b) if xa < xb else (b, a)
                xl, _, wl, _ = rect(left)
                xr, _, _, _ = rect(right)
                if clear(((xl + wl, y), (xr, y)), {a, b}):
                    sa = (1, (y - ya) / ha) if left == a else (0, (y - ya) / ha)
                    sb = (0, (y - yb) / hb) if left == a else (1, (y - yb) / hb)
                    edge = {"pts": [], "exit": sa, "entry": sb, "at": 0, "lift": -10,
                            "dx": 0}
                    break
        lo, hi = max(xa, xb) + 8, min(xa + wa, xb + wb) - 8
        if edge is None and lo <= hi and (ya + ha < yb or yb + hb < ya):
            for x in sorted(range(int(lo), int(hi) + 1, 4), key=lambda v: abs(v - (lo + hi) / 2)):
                upper, lower = (a, b) if ya < yb else (b, a)
                _, yu, _, hu = rect(upper)
                _, yl, _, _ = rect(lower)
                if clear(((x, yu + hu), (x, yl)), {a, b}):
                    sa = ((x - xa) / wa, 1) if upper == a else ((x - xa) / wa, 0)
                    sb = ((x - xb) / wb, 0) if upper == a else ((x - xb) / wb, 1)
                    edge = {"pts": [], "exit": sa, "entry": sb, "at": 0, "lift": 0,
                            "dx": 0}
                    break
        if edge is None:
            # one bend: out of a's side, then into b's top or bottom
            for y in range(int(ya + 8), int(ya + ha - 8), 6):
                for x in range(int(xb + 20), int(xb + wb - 20), 10):
                    if xa < x < xa + wa:
                        continue
                    ex = xa + wa if x > xa else xa
                    ey = yb if y < yb else yb + hb
                    if (y < yb or y > yb + hb) and clear(((ex, y), (x, y)), {a}) \
                            and clear(((x, y), (x, ey)), {b}):
                        edge = {"pts": [(x, y)],
                                "exit": (1 if x > xa else 0, (y - ya) / ha),
                                "entry": ((x - xb) / wb, 0 if y < yb else 1),
                                "at": 0, "lift": -10, "dx": 0}
                        break
                if edge:
                    break
        if edge is None:
            skipped.append(f"{a} -> {b} ({label})")
            continue
        edge.update({"kind": kind, "a": a, "b": b, "label": label})
        top_blk["edges"].append(edge)

    model = ET.Element("mxGraphModel", {
        "dx": "0", "dy": "0", "grid": "0", "gridSize": "10", "guides": "1",
        "tooltips": "1", "connect": "1", "arrows": "1", "fold": "0", "page": "0",
        "pageScale": "1", "pageWidth": "1600", "pageHeight": "1200", "math": "0",
        "shadow": "0", "adaptiveColors": "auto"})
    root_el = ET.SubElement(model, "root")
    ET.SubElement(root_el, "mxCell", {"id": "0"})
    ET.SubElement(root_el, "mxCell", {"id": "1", "parent": "0"})
    box = ("swimlane;html=0;childLayout=stackLayout;horizontal=1;"
           f"startSize={HEAD};horizontalStack=0;resizeParent=1;resizeParentMax=0;"
           "resizeLast=0;collapsible=0;marginBottom=0;"
           f"fillColor={FILL};swimlaneFillColor={WASH};strokeColor={STROKE};strokeWidth=1.5;"
           f"fontFamily=Helvetica;fontSize={HFS};fontStyle=1;align=center;verticalAlign=middle;")
    attr = ("text;html=0;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;"
            f"spacingLeft=8;spacingRight=4;overflow=hidden;fontFamily=Helvetica;fontSize={FS};")
    marked = {None: attr, "new": attr + "fontStyle=1;",
              "removed": attr + "fontStyle=8;fontColor=#64748b;"}
    ident = {}
    for i, n in enumerate(sorted(render_nodes)):
        ident[n] = f"n{i}"
        x, y = boxes[n]
        w, h = size[n]
        d = render_nodes[n]
        st = box.replace(f"startSize={HEAD};", f"startSize={head(n)};")
        if "abstract" in d["flags"]:
            st = st.replace("fontStyle=1;", "fontStyle=3;")
        label = f"\u00abnew\u00bb\n{n}" if head(n) > HEAD else n
        c = ET.SubElement(root_el, "mxCell", {"id": ident[n], "value": label, "style": st,
                                              "parent": "1", "vertex": "1"})
        ET.SubElement(c, "mxGeometry", {"x": str(x), "y": str(y), "width": str(w),
                                        "height": str(h), "as": "geometry"})
        for j, (r, m) in enumerate(zip(d["rows"], d["marks"])):
            k = ET.SubElement(root_el, "mxCell", {"id": f"{ident[n]}a{j}", "value": r,
                                                  "style": marked[m], "parent": ident[n],
                                                  "vertex": "1"})
            ET.SubElement(k, "mxGeometry", {"y": str(head(n) + ROW * j), "width": str(w),
                                            "height": str(ROW), "as": "geometry"})
    base = ("edgeStyle=orthogonalEdgeStyle;rounded=0;html=0;jettySize=auto;orthogonalLoop=1;"
            f"strokeWidth=1.5;fontSize={FS};fontFamily=Helvetica;labelBackgroundColor=#ffffff;")
    kinds = {
        "comp": base + "strokeColor=#475569;startArrow=diamondThin;startFill=1;startSize=12;"
                       "endArrow=none;",
        "gen": base + "strokeColor=#475569;startArrow=block;startFill=0;startSize=12;"
                      "endArrow=none;",
        "assoc": base + "strokeColor=#6d28d9;fontColor=#6d28d9;endArrow=open;endFill=0;"
                        "endSize=10;",
        "dep": base + "strokeColor=#6d28d9;fontColor=#6d28d9;dashed=1;dashPattern=8 4;"
                      "endArrow=open;endFill=0;endSize=10;",
    }
    for i, e in enumerate(top_blk["edges"]):
        (ex, ey), (nx_, ny_) = e["exit"], e["entry"]
        st = kinds[e["kind"]] + (f"exitX={round(ex, 4)};exitY={round(ey, 4)};exitDx=0;exitDy=0;"
                                 f"entryX={round(nx_, 4)};entryY={round(ny_, 4)};"
                                 "entryDx=0;entryDy=0;")
        c = ET.SubElement(root_el, "mxCell", {"id": f"e{i}", "value": e["label"], "style": st,
                                              "parent": "1", "edge": "1",
                                              "source": ident[e["a"]], "target": ident[e["b"]]})
        g = ET.SubElement(c, "mxGeometry", {"relative": "1", "x": str(e.get("at", 0.5)),
                                            "as": "geometry"})
        arr = ET.SubElement(g, "Array", {"as": "points"})
        for px, py in e["pts"]:
            ET.SubElement(arr, "mxPoint", {"x": str(int(px)), "y": str(int(py))})
        if "lift" in e:
            ET.SubElement(g, "mxPoint", {"x": str(int(e.get("dx", 0))),
                                         "y": str(int(e["lift"])), "as": "offset"})
    free = ("text;html=0;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;"
            f"spacingLeft=0;fontFamily=Helvetica;fontSize={FS};fontColor=#334155;")
    for i, (x, y, t) in enumerate(top_blk["labels"]):
        c = ET.SubElement(root_el, "mxCell", {"id": f"l{i}", "value": t, "style": free,
                                              "parent": "1", "vertex": "1"})
        ET.SubElement(c, "mxGeometry", {"x": str(int(x)), "y": str(int(y)),
                                        "width": str(int(max(textw(u) for u in t.split("\n"))) + 8),
                                        "height": str(LBL * (t.count("\n") + 1)),
                                        "as": "geometry"})
    open(OUT, "w").write(
        '<mxfile host="Electron" agent="scripts/diagrams/class-diagram.py" version="29.0.3">'
        f'<diagram name="{NAMES[CHAPTER]}" id="0">'
        f'{ET.tostring(model, encoding="unicode")}</diagram></mxfile>')
    # Nested stacks can extend beyond the layout block's cached dimensions.
    # Estimate print size from the actual boxes and labels written to XML.
    geometry = [c.find("mxGeometry") for c in root_el.findall("mxCell")
                if c.get("vertex") == "1" and c.get("parent") == "1"]
    W_ = int(max(float(g.get("x", 0)) + float(g.get("width", 0)) for g in geometry)) + 12
    H_ = int(max(float(g.get("y", 0)) + float(g.get("height", 0)) for g in geometry)) + 12
    # the largest scale that fits a landscape A4 page of this report
    # (242 mm by 160 mm), and the attribute text height that gives
    s = min(242 / W_, 160 / H_)
    print(f"nodes={len(render_nodes)} size={W_}x{H_} scale={s:.3f}mm/px "
          f"text={FS * s / 0.3528:.1f}pt not drawn: {skipped or 'none'}")


if REPORT:
    report()
    sys.exit(0)

if SUBTREE:
    assert SUBTREE in nodes, f"unknown node {SUBTREE}"
    for name in DROPPED:
        assert name in nodes, f"unknown node {name}"
    kept, frontier = {SUBTREE}, [SUBTREE]
    while frontier:
        for child in CHILDREN.get(frontier.pop(), []):
            if child in DROPPED:
                continue
            kept.add(child)
            frontier.append(child)
    CHILDREN = {
        p: [k for k in ks if k in kept]
        for p, ks in ({SUBTREE: CHILDREN.get(SUBTREE, [])} | CHILDREN).items()
        if p in kept
    }
    nodes = {n: d for n, d in nodes.items() if n in kept}
    comp = [e for e in comp if e[0] in kept and e[1] in kept]
    dep = [e for e in dep if e[0] in kept and e[1] in kept]
    assoc = [e for e in assoc if e[0] in kept and e[1] in kept]

ROOT = next(iter(CHILDREN))
placed = {ROOT}
for p, ks in CHILDREN.items():
    for k in ks:
        assert k in nodes, f"unknown node {k}"
        placed.add(k)
assert not set(nodes) - placed, f"not in the tree: {sorted(set(nodes) - placed)}"

W, HGAP = 200, 26
LANE, MARGIN, BAND = 17, 26, 30
ROWSTART = 16

depth = {}
def setdepth(n, d):
    depth[n] = d
    for c in CHILDREN.get(n, []):
        setdepth(c, d + 1)
setdepth(ROOT, 0)
maxd = max(depth.values())

def height(n):
    d = nodes[n]
    return (54 if d["kind"] == "enum" else 36) + 20 * len(d["rows"])

x, cursor = {}, [0.0]
def layout(n):
    ks = CHILDREN.get(n, [])
    if not ks:
        x[n] = cursor[0]
        cursor[0] += W + HGAP
        return
    for c in ks:
        layout(c)
    x[n] = (x[ks[0]] + x[ks[-1]]) / 2.0
layout(ROOT)

tree = {(p, k) for p, ks in CHILDREN.items() for k in ks}
cx = lambda n: x[n] + W / 2.0

# one bus per parent: shallowest fan on top, so a parent's run never sits under
# the drops of a fan that starts lower down
lane_of = {}
stack_at = {d: 0 for d in range(maxd + 1)}
for d in range(maxd + 1):
    parents = sorted([n for n in nodes if depth[n] == d and CHILDREN.get(n)], key=cx)
    for i, n in enumerate(parents):
        lane_of[n] = i
    stack_at[d] = len(parents)

rowh = {d: max(height(n) for n in nodes if depth[n] == d) for d in range(maxd + 1)}
y, acc = {}, float(ROWSTART)
for d in range(maxd + 1):
    y[d] = acc
    acc += rowh[d] + MARGIN + max(stack_at[d], 1) * LANE + BAND
FLOOR = acc + 20

def lane_y(p):
    d = depth[p]
    return y[d] + rowh[d] + MARGIN + lane_of[p] * LANE

LANE_C = ("swimlane;html=0;childLayout=stackLayout;horizontal=1;startSize=36;horizontalStack=0;"
          "resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;"
          f"fillColor={FILL};swimlaneFillColor={WASH};strokeColor={STROKE};strokeWidth=1.5;"
          "fontFamily=Helvetica;fontSize=12;fontStyle=1;align=center;verticalAlign=middle;")
LANE_E = LANE_C.replace("startSize=36", "startSize=54").replace(
    f"fillColor={FILL};swimlaneFillColor={WASH};strokeColor={STROKE}",
    "fillColor=#f5f3ff;swimlaneFillColor=#fdfcff;strokeColor=#6d28d9")
ATTR = ("text;html=0;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;"
        "spacingLeft=8;spacingRight=4;overflow=hidden;fontFamily=Helvetica;fontSize=11;")
NOTE = ATTR + "fontColor=#6d28d9;fontStyle=2;"
BASE = ("edgeStyle=orthogonalEdgeStyle;rounded=0;html=0;jettySize=auto;orthogonalLoop=1;"
        "strokeWidth=1.5;fontSize=11;fontFamily=Helvetica;labelBackgroundColor=#ffffff;")
E_COMP = BASE + ("strokeColor=#475569;startArrow=diamondThin;startFill=1;startSize=12;endArrow=none;"
                 "exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;")
E_ENUM = BASE + ("strokeColor=#6d28d9;fontColor=#6d28d9;dashed=1;dashPattern=8 4;endArrow=open;"
                 "endFill=0;endSize=10;exitX=0.5;exitY=1;exitDx=0;exitDy=0;"
                 "entryX=0.5;entryY=0;entryDx=0;entryDy=0;")

# a relation between two layers is not drawn; the chapter states it. The router
# below places a non-tree edge along one row, so both ends must sit on that row.
dep = [(a, b, l) for a, b, l in dep
       if (a, b) in tree or depth[a] == depth[b]]

model = ET.Element("mxGraphModel", {
    "dx": "0", "dy": "0", "grid": "0", "gridSize": "10", "guides": "1", "tooltips": "1",
    "connect": "1", "arrows": "1", "fold": "0", "page": "0", "pageScale": "1",
    "pageWidth": "1600", "pageHeight": "1200", "math": "0", "shadow": "0",
    "adaptiveColors": "auto"})
root = ET.SubElement(model, "root")
ET.SubElement(root, "mxCell", {"id": "0"})
ET.SubElement(root, "mxCell", {"id": "1", "parent": "0"})

ident = {}
for i, n in enumerate(sorted(nodes)):
    ident[n] = f"n{i}"
    d = nodes[n]
    style = LANE_E if d["kind"] == "enum" else LANE_C
    start = 54 if d["kind"] == "enum" else 36
    val = f"«enumeration»\n{n}" if d["kind"] == "enum" else n
    rows = d["rows"] + d["notes"]
    c = ET.SubElement(root, "mxCell", {"id": ident[n], "value": val, "style": style,
                                       "parent": "1", "vertex": "1"})
    ET.SubElement(c, "mxGeometry", {"x": str(int(x[n])), "y": str(int(y[depth[n]])),
                                    "width": str(W), "height": str(start + 20 * len(rows)),
                                    "as": "geometry"})
    for j, r in enumerate(rows):
        st = NOTE if j >= len(d["rows"]) else ATTR
        k = ET.SubElement(root, "mxCell", {"id": f"{ident[n]}a{j}", "value": r, "style": st,
                                           "parent": ident[n], "vertex": "1"})
        ET.SubElement(k, "mxGeometry", {"y": str(start + 20 * j), "width": str(W),
                                        "height": "20", "as": "geometry"})

def add_edge(eid, style, s, t, label, points, at=0.5, lift=None, shift=0):
    c = ET.SubElement(root, "mxCell", {"id": eid, "value": label, "style": style,
                                       "parent": "1", "edge": "1",
                                       "source": ident[s], "target": ident[t]})
    g = ET.SubElement(c, "mxGeometry", {"relative": "1", "x": str(at), "as": "geometry"})
    arr = ET.SubElement(g, "Array", {"as": "points"})
    for px, py in points:
        ET.SubElement(arr, "mxPoint", {"x": str(int(px)), "y": str(int(py))})
    if lift is not None:
        ET.SubElement(g, "mxPoint", {"x": str(int(shift)), "y": str(int(lift)),
                                     "as": "offset"})

seen = {}
def tree_edge(eid, style, a, b, label):
    k = seen.get((a, b), 0)
    seen[(a, b)] = k + 1
    ly = lane_y(a)
    st = style
    drop = cx(b)
    if k:
        # same exit, same run: it diverges from its twin only on the way down
        drop = cx(b) + 0.24 * W
        st = style.replace("entryX=0.5;", "entryX=0.74;")
    add_edge(eid, st, a, b, label, [(cx(a), ly), (drop, ly)],
             at=1, lift=-16 - 18 * k, shift=0)

i = 0
for a, b, mult, label in comp:
    if (a, b) in tree:
        tree_edge(f"e{i}", E_COMP, a, b, f"{mult}  {label}")
        i += 1
for a, b, label in dep:
    if (a, b) in tree:
        tree_edge(f"e{i}", E_ENUM, a, b, label)
        i += 1

# what is left links two nodes on one layer that sibling order made neighbours
E_ASSOC = E_ENUM.replace("dashed=1;dashPattern=8 4;", "")
cross = [(E_COMP, a, b, f"{m}  {l}") for a, b, m, l in comp if (a, b) not in tree]
cross += [(E_ASSOC, a, b, l) for a, b, l in assoc]
cross += [(E_ENUM, a, b, f"«{l}»") for a, b, l in dep if (a, b) not in tree]
# a second owner of a box already placed under its first is a relation across
# layers, which the README's rule leaves to the chapter's prose
cross = [c for c in cross if depth[c[1]] == depth[c[2]]]
def neighbours(a, b):
    """True when nothing on their row sits between the two boxes."""
    lo, hi = sorted((cx(a), cx(b)))
    row = [n for n in nodes if depth[n] == depth[a] and n not in (a, b)]
    return not any(lo < cx(n) < hi for n in row)

# two links into one box that say the same thing are named once, under that box
labelled = set()
taken = {}
deep = {}
for j, (style, a, b, label) in enumerate(cross):
    if (b, label) in labelled:
        label = ""
    else:
        labelled.add((b, label))
    d = depth[a]
    assert depth[a] == depth[b], f"{a}->{b} spans layers and is not drawn"
    gap = max(cx(a), cx(b)) - min(cx(a), cx(b)) - W
    if neighbours(a, b) and gap < W:
        # a short run in the band below the row, clear of the fan above it
        k = taken.get(d, 0)
        taken[d] = k + 1
        ly = y[d] + rowh[d] + 14 + k * 26
        # each link enters the shared target on its own side, and the last
        # waypoint sits under that entry point so the final segment is vertical
        # and its arrow head points into the box rather than across it
        into = 0.34 if cx(a) < cx(b) else 0.66
        ex = x[b] + into * W
        st = style.replace("entryX=0.5;entryY=0;", f"entryX={into};entryY=1;")
        add_edge(f"x{j}", st, a, b, "", [(cx(a), ly), (ex, ly)])
        # the name goes below every lane feeding this box, as its own text,
        # clear of both arrow heads and of any run
        prev_y, prev_l = deep.get(b, (0, []))
        # every distinct name, left to right in the order the links arrive
        named = prev_l + [(cx(a), label)] if label and label not in [l for _, l in prev_l] else prev_l
        deep[b] = (max(prev_y, ly), named)
    else:
        # the boxes face each other: one straight line, side to side, at a
        # height that is inside both of them
        ha, hb = height(a), height(b)
        mid = y[d] + min(ha, hb) / 2.0
        ea, eb = (mid - y[d]) / ha, (mid - y[d]) / hb
        left, right = (a, b) if cx(a) < cx(b) else (b, a)
        el, er = (ea, eb) if left is a else (eb, ea)
        st = (style.replace("exitX=0.5;exitY=1;exitDx=0;exitDy=0;",
                            f"exitX=1;exitY={round(el, 4)};exitDx=0;exitDy=0;")
                   .replace("entryX=0.5;entryY=0;entryDx=0;entryDy=0;",
                            f"entryX=0;entryY={round(er, 4)};entryDx=0;entryDy=0;"))
        if left is not a:
            st = (style.replace("exitX=0.5;exitY=1;exitDx=0;exitDy=0;",
                                f"exitX=0;exitY={round(ea, 4)};exitDx=0;exitDy=0;")
                       .replace("entryX=0.5;entryY=0;entryDx=0;entryDy=0;",
                                f"entryX=1;entryY={round(eb, 4)};entryDx=0;entryDy=0;"))
        add_edge(f"x{j}", st, a, b, label, [], at=0.86, lift=-12)

LABEL = ("text;html=0;strokeColor=none;fillColor=none;align=center;"
         "verticalAlign=middle;fontFamily=Helvetica;fontSize=11;fontColor=#6d28d9;")
for t, (ly, labels) in deep.items():
    c = ET.SubElement(root, "mxCell", {"id": f"L{ident[t]}",
                                       "value": "  ·  ".join(l for _, l in sorted(labels)),
                                       "style": LABEL, "parent": "1", "vertex": "1"})
    ET.SubElement(c, "mxGeometry", {"x": str(int(cx(t) - 130)), "y": str(int(ly + 12)),
                                    "width": "260", "height": "18", "as": "geometry"})

open(OUT, "w").write(
    '<mxfile host="Electron" agent="scripts/diagrams/class-diagram.py" version="29.0.3">'
    f'<diagram name="{NAMES[CHAPTER]}" id="0">'
    f'{ET.tostring(model, encoding="unicode")}</diagram></mxfile>')
print(f"nodes={len(nodes)} depth={maxd} size={int(cursor[0])}x{int(FLOOR)} "
      f"lanes/row={stack_at} cross={len(cross)} notes="
      f"{sum(len(v['notes']) for v in nodes.values())}")
