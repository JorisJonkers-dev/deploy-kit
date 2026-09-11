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

# a relation spanning two layers or more is not drawn; the chapter states it
dep = [(a, b, l) for a, b, l in dep
       if (a, b) in tree or abs(depth[a] - depth[b]) < 2]

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
cross = [(E_COMP, a, b, f"{m}  {l}") for a, b, m, l in comp if (a, b) not in tree]
cross += [(E_ENUM, a, b, f"«{l}»") for a, b, l in dep if (a, b) not in tree]
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
        prev_y, prev_l = deep.get(b, (0, ""))
        deep[b] = (max(prev_y, ly), prev_l or label)
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
for t, (ly, label) in deep.items():
    c = ET.SubElement(root, "mxCell", {"id": f"L{ident[t]}", "value": label,
                                       "style": LABEL, "parent": "1", "vertex": "1"})
    ET.SubElement(c, "mxGeometry", {"x": str(int(cx(t) - 110)), "y": str(int(ly + 12)),
                                    "width": "220", "height": "18", "as": "geometry"})

open(sys.argv[1], "w").write(
    '<mxfile host="Electron" agent="scripts/diagrams/class-diagram.py" version="29.0.3">'
    f'<diagram name="Service Intent - the layer-1 model" id="0">'
    f'{ET.tostring(model, encoding="unicode")}</diagram></mxfile>')
print(f"nodes={len(nodes)} depth={maxd} size={int(cursor[0])}x{int(FLOOR)} "
      f"lanes/row={stack_at} cross={len(cross)} notes="
      f"{sum(len(v['notes']) for v in nodes.values())}")
