#!/usr/bin/env python3
"""Render chapter 10's class diagram from the mermaid block that mirrors it.

The drawing and the mermaid cannot disagree, because the mermaid IS the source:
this reads the `classDiagram` block out of spec/v1/10-service-intent.md and
emits a .drawio file, which draw.io then exports to the committed SVG.

Layout rules, in the order they matter:

1. The composition edges form a spanning tree. Every node sits exactly one
   layer below its tree parent. The closed vocabularies are NOT in this
   drawing: seventeen boxes of two or three words each said nothing the
   attribute's type name had not already said, and the lines reaching them are
   what made the model unreadable. They live in a table in the chapter, under
   "The closed vocabularies".
2. **One lane per child.** A parent's edges never share a horizontal run:
   each child gets its own lane in the gap above its row, and the lanes are
   ordered farthest-child-first so a near child's drop starts below the runs
   that pass over it. Nothing crosses.
3. **Labels sit on the vertical drop**, not on the horizontal run, so a wide
   fan reads as that many separately named lines.
4. A row gap is sized to hold the deepest lane stack any parent above it needs,
   plus a reserved band above the row for sibling cross-links, which sits above
   the tree labels rather than among them.
5. Edges that are not tree edges are routed by distance. Between two nodes on
   the same layer that sibling order has put next to each other, a short run in
   the reserved band. Anything spanning two or more layers is not drawn as a
   line at all: it becomes a `«...»` note row inside the source's own box,
   because a line that long is what made this drawing unreadable twice.

Usage:
    python3 scripts/diagrams/class-diagram.py out.drawio
    /Applications/draw.io.app/Contents/MacOS/draw.io -x -f svg -e -b 10 \
        -o spec/v1/diagrams/10-service-intent-model.drawio.svg out.drawio

CHILDREN below is the only hand-maintained part: it fixes the tree parent of
each node and the sibling order. Sibling order is chosen so that cross-links
land between neighbours. Adding a class or an enumeration to the mermaid
without adding it here fails loudly.
"""
import re, sys, xml.etree.ElementTree as ET

MD = "spec/v1/10-service-intent.md"
src = open(MD).read()
body = re.search(r"```mermaid\nclassDiagram\n(.*?)\n```", src, re.S).group(1)

nodes = {}
for name, blk in re.findall(r"    class (\w+) \{(.*?)\n    \}", body, re.S):
    rows = [l.strip() for l in blk.strip("\n").split("\n") if l.strip()]
    kind = "enum" if "<<enumeration>>" in rows else "class"
    rows = [r for r in rows if not r.startswith("<<")]
    if kind == "class":
        rows = [re.sub(r"^\+\s*(\S+)\s+(\S+)$", r"+ \1  \2", r) for r in rows]
    nodes[name] = {"kind": kind, "rows": rows, "notes": []}

comp, dep = [], []
for line in body.split("\n"):
    m = re.match(r'\s*(\w+)\s+"([^"]+)"\s+\*--\s+"([^"]+)"\s+(\w+)\s*:\s*(.*)', line)
    if m:
        comp.append((m.group(1), m.group(4), m.group(3), m.group(5).strip()))
        continue
    m = re.match(r"\s*(\w+)\s+\.\.>\s+(\w+)\s*:\s*(.*)", line)
    if m:
        dep.append((m.group(1), m.group(2), m.group(3).strip()))

# The tree. Sibling order puts cross-link partners next to each other:
# Surface is Workload's last child and Route is Exposure's first, so the two
# `resolves by name` edges and `Route -> Audience` all land between neighbours.
CHILDREN = {
    "Domain": ["Service"],
    "Service": ["Observability", "Grant", "Workload", "Exposure"],
    "Observability": ["Scrape"],
    "Grant": ["Rotation"],
    # Surface stays last, and Route stays Exposure's first, so the two
    # `resolves by name` cross-links land between neighbours.
    "Workload": [
        "Capacity", "Sidecar", "Probe", "Asset", "Volume", "Placement",
        "EnvFile", "DependencyEdge", "Surface",
    ],
    "Placement": ["GpuRequest", "DiskRequest"],
    "EnvFile": ["Placeholder"],
    "Exposure": ["Route"],
}
placed = {"Domain"}
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
setdepth("Domain", 0)
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
layout("Domain")

tree = {(p, k) for p, ks in CHILDREN.items() for k in ks}
cx = lambda n: x[n] + W / 2.0

# one lane per child, farthest first, left and right of the parent independently
lane_of = {}
stack_at = {d: 0 for d in range(maxd + 1)}
for p, ks in CHILDREN.items():
    d = depth[p]
    left = sorted([k for k in ks if cx(k) < cx(p)], key=lambda k: -abs(cx(k) - cx(p)))
    right = sorted([k for k in ks if cx(k) >= cx(p)], key=lambda k: -abs(cx(k) - cx(p)))
    for side in (left, right):
        for i, k in enumerate(side):
            lane_of[(p, k)] = i
    stack_at[d] = max(stack_at[d], len(left), len(right))

rowh = {d: max(height(n) for n in nodes if depth[n] == d) for d in range(maxd + 1)}
y, acc = {}, float(ROWSTART)
for d in range(maxd + 1):
    y[d] = acc
    acc += rowh[d] + MARGIN + max(stack_at[d], 1) * LANE + BAND
FLOOR = acc + 20

def lane_y(p, k):
    d = depth[p]
    return y[d] + rowh[d] + MARGIN + lane_of[(p, k)] * LANE

LANE_C = ("swimlane;html=0;childLayout=stackLayout;horizontal=1;startSize=36;horizontalStack=0;"
          "resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;"
          "fillColor=#dbeafe;swimlaneFillColor=#f4f8ff;strokeColor=#1e40af;strokeWidth=1.5;"
          "fontFamily=Helvetica;fontSize=12;fontStyle=1;align=center;verticalAlign=middle;")
LANE_E = LANE_C.replace("startSize=36", "startSize=54").replace(
    "fillColor=#dbeafe;swimlaneFillColor=#f4f8ff;strokeColor=#1e40af",
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

# anything spanning two layers or more becomes a note row in the source's box
keep = []
for a, b, label in dep:
    if (a, b) not in tree and abs(depth[a] - depth[b]) >= 2:
        nodes[a]["notes"].append(f"«{label}» {b}")
    else:
        keep.append((a, b, label))
dep = keep

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

def add_edge(eid, style, s, t, label, points, at=0.5, lift=None):
    c = ET.SubElement(root, "mxCell", {"id": eid, "value": label, "style": style,
                                       "parent": "1", "edge": "1",
                                       "source": ident[s], "target": ident[t]})
    g = ET.SubElement(c, "mxGeometry", {"relative": "1", "x": str(at), "as": "geometry"})
    arr = ET.SubElement(g, "Array", {"as": "points"})
    for px, py in points:
        ET.SubElement(arr, "mxPoint", {"x": str(int(px)), "y": str(int(py))})
    if lift is not None:
        ET.SubElement(g, "mxPoint", {"x": "0", "y": str(int(lift)), "as": "offset"})

seen = {}
def tree_edge(eid, style, a, b, label):
    k = seen.get((a, b), 0)
    seen[(a, b)] = k + 1
    ly = lane_y(a, b) + k * LANE
    off = 62 * k
    st = style
    if k:
        st = style.replace("exitX=0.5;", "exitX=0.82;").replace("entryX=0.5;", "entryX=0.82;")
    # the label rides the child's vertical drop, where no other line is
    add_edge(eid, st, a, b, label, [(cx(a) + off, ly), (cx(b) + off, ly)],
             at=1, lift=-16 - 20 * k)

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
cross = [(E_COMP, a, b, f"{a} · {m}  {l}") for a, b, m, l in comp if (a, b) not in tree]
cross += [(E_ENUM, a, b, f"«{l}»") for a, b, l in dep if (a, b) not in tree]
taken = {}
for j, (style, a, b, label) in enumerate(cross):
    d = max(depth[a], depth[b])
    assert depth[a] == depth[b], f"{a}->{b} spans layers and should be a note"
    lo, hi = sorted((cx(a), cx(b)))
    k = 0
    while any(not (hi <= l or lo >= h) for l, h in taken.get((d, k), [])):
        k += 1
    taken.setdefault((d, k), []).append((lo, hi))
    ly = y[d] - 36 - k * 15
    side = 0.26 if cx(a) < cx(b) else 0.74
    st = (style.replace("exitX=0.5;exitY=1;", "exitX=0.5;exitY=0;")
               .replace("entryX=0.5;entryY=0;", f"entryX={side};entryY=0;"))
    add_edge(f"x{j}", st, a, b, label, [(cx(a), ly), (cx(b), ly)], at=0.14)

open(sys.argv[1], "w").write(
    '<mxfile host="Electron" agent="scripts/diagrams/class-diagram.py" version="29.0.3">'
    f'<diagram name="Service Intent — the layer-1 model" id="0">'
    f'{ET.tostring(model, encoding="unicode")}</diagram></mxfile>')
print(f"nodes={len(nodes)} depth={maxd} size={int(cursor[0])}x{int(FLOOR)} "
      f"lanes/row={stack_at} cross={len(cross)} notes="
      f"{sum(len(v['notes']) for v in nodes.values())}")
