#!/usr/bin/env python3
"""Draw the appendix's metamodel overviews (mm-*.drawio) from the Ecore files.

Each figure is a containment-tree overview of one metamodel, read from
emf/bundles/metamodel/model/*.ecore:

- A group starts at a root class: a header box reading `ClassName : Super`.
- Under it, one box per containment reference the class declares itself
  (inherited ones are drawn under the supertype's own group), in Ecore order,
  joined to the header by a diamond containment edge, reading
  `role* ClassName (+n) ◁ n`:
    `*`     the reference is many-valued;
    italic  the class is abstract;
    (+n)    n further classes reachable by containment from it, folded away
            (a class with a box earlier in the figure is not counted again);
    ◁ n     the class has n direct subclasses (an abstract class with more
            than eight lists them instead);
    dashed  the class is drawn elsewhere in the figure (a group of its own, or
            an earlier box).
- The tree is folded one level below each root (two for the pinned inputs,
  whose documents are shallow).
- A box is blue when its class is new since Task 2, that is, absent from every
  Ecore file at commit 2be35e58, and white when it existed then.
- The legend names only the symbols the figure uses.

Usage, from the repository root:

    python3 docs/mde/task-3-code-generation/Figures/tools/mm_overview.py
    for f in mm-source mm-platform mm-pinned mm-target; do
      /Applications/draw.io.app/Contents/MacOS/draw.io -x -f pdf --crop \
        -o docs/mde/task-3-code-generation/Figures/$f.pdf \
        docs/mde/task-3-code-generation/Figures/$f.drawio
    done

It needs only the Python standard library and git (for the baseline).
"""
import argparse
import os
import subprocess
import sys
import xml.etree.ElementTree as ET
from html import escape
from xml.sax.saxutils import quoteattr

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, *[os.pardir] * 5))
MODEL = "emf/bundles/metamodel/model"
ECORES = ["project-intent", "pinned-inputs", "resolved-deployment"]
BASELINE = "2be35e58"
XSI = "{http://www.w3.org/2001/XMLSchema-instance}type"

# figure specifications: which Ecore, which groups, how they sit in three columns
FIGURES = {
    "mm-source": dict(
        ecore="project-intent", depth=1,
        columns=[[("Project",), ("Application",)], [("Process",)], [("SharedIntent",)]]),
    "mm-platform": dict(
        ecore="project-intent", depth=1, span="Platform",
        exclude={"HandoverLedger", "ServingLocation", "AdminCredential", "AdminToken", "AdminLogin"},
        columns=[[("Platform", 0, 9)], [("Platform", 9, 18)], [("Platform", 18, None)]]),
    "mm-pinned": dict(
        ecore="pinned-inputs", depth=2,
        columns=[[("NodeContract",)], [("ImagesLock",), ("ClusterState",)],
                 [("MigrationProof",), ("AssetFile",)]]),
    "mm-target": dict(
        ecore="resolved-deployment", depth=1,
        columns=[[("ResolvedDeployment",)],
                 [("ResolvedApplication",), ("ResolvedProcess", 0, 6)],
                 [("ResolvedProcess", 6, None)]]),
}

# drawing constants, in draw.io units
FONT = 10
COLW, GAP = 234, 16
HEAD_H, ROW_H, PITCH, IND = 18, 16, 21, 18
BLOCK_GAP = 10
LIST_THRESHOLD = 8
SLATE, INK, MUTED = "#475569", "#0f172a", "#64748b"
OLD = ("#ffffff", SLATE)
NEW = ("#dbeafe", "#1e40af")


def parse(text):
    root = ET.fromstring(text)
    classes = {}
    for c in root.findall("eClassifiers"):
        if c.get(XSI) != "ecore:EClass":
            continue
        refs = [(f.get("name"), f.get("eType").split("//")[1], f.get("upperBound") == "-1")
                for f in c.findall("eStructuralFeatures")
                if f.get(XSI) == "ecore:EReference" and f.get("containment") == "true"]
        sup = [s.split("//")[1] for s in (c.get("eSuperTypes") or "").split()]
        classes[c.get("name")] = dict(refs=refs, sup=sup, abstract=c.get("abstract") == "true")
    return classes


def baseline_names():
    names = set()
    for e in ECORES:
        text = subprocess.run(["git", "-C", REPO, "show", f"{BASELINE}:{MODEL}/{e}.ecore"],
                              capture_output=True, text=True, check=True).stdout
        names |= set(parse(text))
    return names


class Model:
    def __init__(self, classes, exclude):
        self.c = {k: v for k, v in classes.items() if k not in exclude}
        for v in self.c.values():
            v["refs"] = [r for r in v["refs"] if r[1] not in exclude]

    def subs(self, t):
        return sorted(k for k, v in self.c.items() if t in v["sup"])

    def kids(self, t):
        return [r[1] for r in self.c[t]["refs"]]

    def reach(self, t):
        seen, todo = set(), [t]
        while todo:
            for k in self.kids(todo.pop()):
                if k not in seen:
                    seen.add(k)
                    todo.append(k)
        seen.discard(t)
        return seen


def text_width(s, size=FONT, bold=False):
    """A rough Helvetica advance, to warn when a label would not fit its box."""
    narrow, wide = set("ijlI.,:;|!' "), set("mwMW")
    w = sum(0.28 if ch in narrow else 0.85 if ch in wide else
            0.67 if ch.isupper() else 0.55 for ch in s)
    return 0.87 * w * size * (1.07 if bold else 1.0)


class Figure:
    def __init__(self, name, spec, classes, old):
        self.name, self.spec, self.old = name, spec, old
        self.m = Model(classes, spec.get("exclude", set()))
        self.cells, self.n = [], 0
        self.used = set()
        self.groups = []
        for col in spec["columns"]:
            for blk in col:
                if blk[0] not in self.groups:
                    self.groups.append(blk[0])
        self.drawn = set(self.groups)  # classes with a box so far, for the dashed rule

    def id(self):
        self.n += 1
        return f"n{self.n}"

    def colours(self, cls):
        return OLD if cls in self.old else NEW

    def vertex(self, x, y, w, h, html, cls, dashed=False, valign="middle"):
        fill, stroke = self.colours(cls)
        if cls not in self.old:
            self.used.add("new")
        else:
            self.used.add("old")
        style = (f"rounded=0;whiteSpace=wrap;html=1;align=left;verticalAlign={valign};"
                 f"fillColor={fill};strokeColor={stroke};strokeWidth=1.5;fontFamily=Helvetica;"
                 f"fontSize={FONT};fontColor={INK};spacing=0;spacingLeft=6;spacingRight=4;")
        if dashed:
            style += f"dashed=1;dashPattern=4 3;strokeColor={MUTED};"
            self.used.add("dashed")
        i = self.id()
        self.cells.append(f'<mxCell id="{i}" value={quoteattr(html)} style="{style}" vertex="1" parent="1">'
                          f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')
        return i

    def contain(self, src, dst, trunk_x, child_cy, exit_dx=10):
        style = ("edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=none;startArrow=diamondThin;"
                 f"startFill=1;startSize=10;strokeColor={SLATE};strokeWidth=1.5;"
                 f"exitX=0;exitY=1;exitDx={exit_dx};exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;")
        self.cells.append(f'<mxCell id="{self.id()}" style="{style}" edge="1" parent="1" '
                          f'source="{src}" target="{dst}"><mxGeometry relative="1" as="geometry">'
                          f'<Array as="points"><mxPoint x="{trunk_x}" y="{child_cy}"/></Array>'
                          '</mxGeometry></mxCell>')

    def name_html(self, cls, role=None, many=False, folded=0, count_subs=True):
        c = self.m.c[cls]
        parts, plain = [], ""
        if role:
            parts.append(f'<font color="{MUTED}">{escape(role)}{"*" if many else ""}</font>')
            plain += role + ("*" if many else "") + " "
            if many:
                self.used.add("many")
        name = f"<b>{escape(cls)}</b>"
        if c["abstract"]:
            name = f"<i>{name}</i>"
            self.used.add("abstract")
        parts.append(name)
        plain += cls
        if folded:
            parts.append(f'<font color="{MUTED}">(+{folded})</font>')
            plain += f" (+{folded})"
            self.used.add("folded")
        subs = self.m.subs(cls)
        if count_subs and subs and len(subs) <= LIST_THRESHOLD:
            parts.append(f'<font color="{MUTED}">◁ {len(subs)}</font>')
            plain += f" ◁ {len(subs)}"
            self.used.add("subs")
        return " ".join(parts), plain

    def check(self, plain, w):
        need = text_width(plain, bold=True) + 12
        if need > w:
            print(f"warning: {self.name}: '{plain}' needs about {need:.0f}, box is {w}", file=sys.stderr)

    def rows(self, root, depth, level=1):
        """(level, role, many, cls, folded, dashed) for each box below root, in order.

        (+n) counts the classes reachable from a box that have no box drawn
        before it in the figure (the group roots count as drawn from the start).
        """
        out = []
        for role, cls, many in self.m.c[root]["refs"]:
            dashed = cls in self.drawn
            self.drawn.add(cls)
            expand = level < depth and not dashed and self.m.kids(cls)
            folded = 0 if dashed or expand else len(self.m.reach(cls) - self.drawn)
            out.append((level, role, many, cls, folded, dashed))
            if expand:
                out += self.rows(cls, depth, level + 1)
        return out

    def header_html(self, cls, continued=False):
        html, plain = self.name_html(cls)
        sup = self.m.c[cls]["sup"]
        if sup:
            html += f' <font color="{MUTED}">: {escape(", ".join(sup))}</font>'
            plain += " : " + ", ".join(sup)
        if continued:
            html += f' <font color="{MUTED}">(continued)</font>'
            plain += " (continued)"
        return html, plain

    def build(self):
        depth = self.spec["depth"]
        # every group's rows, computed once in figure order so "dashed" means drawn earlier
        group_rows = {g: self.rows(g, depth) for g in self.groups}
        span = self.spec.get("span")
        y0 = 0
        span_id = None
        if span:
            html, plain = self.header_html(span)
            w = 3 * COLW + 2 * GAP
            span_id = self.vertex(0, 0, w, HEAD_H, html, span)
            y0 = HEAD_H + 8
        bottom = 0
        started = set()
        for k, col in enumerate(self.spec["columns"]):
            x, y = k * (COLW + GAP), y0
            for blk in col:
                g = blk[0]
                start = blk[1] if len(blk) > 1 else 0
                end = blk[2] if len(blk) > 2 else None
                rows = group_rows[g][start:end]
                if span:
                    head = span_id  # each column's trunk leaves the shared header above it
                else:
                    continued = g in started
                    html, plain = self.header_html(g, continued)
                    self.check(plain, COLW)
                    head = self.vertex(x, y, COLW, HEAD_H, html, g, dashed=continued)
                    y += HEAD_H + (PITCH - ROW_H)
                started.add(g)
                parents = {0: head}
                for level, role, many, cls, folded, dashed in rows:
                    bx = x + level * IND
                    bw = COLW - level * IND
                    subs = self.m.subs(cls)
                    top = y
                    if self.m.c[cls]["abstract"] and len(subs) > LIST_THRESHOLD:
                        html, plain = self.name_html(cls, role, many, folded, count_subs=False)
                        kinds = f"{len(subs)} kinds: " + ", ".join(subs)
                        lines = self.wrap(kinds, bw - 36)
                        h = 18 + 12 * len(lines) + 6
                        body = f'{html}<br><font color="{INK}">' + "<br>".join(escape(l) for l in lines) + "</font>"
                        i = self.vertex(bx, y, bw, h, body, cls, dashed=dashed, valign="top")
                        y += h + (PITCH - ROW_H)
                    else:
                        html, plain = self.name_html(cls, role, many, folded)
                        self.check(plain, bw)
                        i = self.vertex(bx, y, bw, ROW_H, html, cls, dashed=dashed)
                        y += PITCH
                    trunk = x + (level - 1) * IND + 10
                    cy = top + ROW_H / 2
                    if level == 1 and span:
                        self.contain(head, i, trunk, cy, exit_dx=x + 10)
                    else:
                        self.contain(parents[level - 1], i, trunk, cy)
                    parents[level] = i
                y += BLOCK_GAP
            bottom = max(bottom, y)
        self.legend(bottom + 4)

    @staticmethod
    def wrap(text, width):
        words, lines, cur = text.split(" "), [], ""
        for w in words:
            trial = (cur + " " + w).strip()
            if text_width(trial) > width and cur:
                lines.append(cur)
                cur = w
            else:
                cur = trial
        lines.append(cur)
        return lines

    def legend(self, y):
        x = 0
        for key, label, (fill, stroke) in (("old", "at Task 2", OLD), ("new", "added since Task 2", NEW)):
            if key not in self.used:
                continue
            self.cells.append(f'<mxCell id="{self.id()}" value="" style="rounded=0;fillColor={fill};'
                              f'strokeColor={stroke};strokeWidth=1.5;" vertex="1" parent="1">'
                              f'<mxGeometry x="{x}" y="{y}" width="20" height="13" as="geometry"/></mxCell>')
            self.text(x + 28, y - 2, 140, 17, escape(label))
            x += 170
        keys = []
        if "abstract" in self.used:
            keys.append("<i>italic</i> abstract")
        if "many" in self.used:
            keys.append("role* many")
        if "dashed" in self.used:
            keys.append("dashed: shown elsewhere")
        if "folded" in self.used:
            keys.append("(+n) classes folded")
        if "subs" in self.used:
            keys.append("◁ n subclasses")
        if keys:
            self.text(0, y + 18, 3 * COLW + 2 * GAP, 17, " · ".join(keys), color=MUTED)

    def text(self, x, y, w, h, html, color=INK):
        style = (f"text;html=1;whiteSpace=nowrap;align=left;verticalAlign=middle;fontFamily=Helvetica;"
                 f"fontSize={FONT};fontColor={color};spacing=0;strokeColor=none;fillColor=none;")
        self.cells.append(f'<mxCell id="{self.id()}" value={quoteattr(html)} style="{style}" vertex="1" parent="1">'
                          f'<mxGeometry x="{x}" y="{y}" width="{w}" height="{h}" as="geometry"/></mxCell>')

    def xml(self):
        return (f'<mxfile host="Electron"><diagram name="{self.name}" id="{self.name}">'
                '<mxGraphModel dx="0" dy="0" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" '
                'arrows="1" fold="0" page="0" pageScale="1" math="0" shadow="0"><root>'
                '<mxCell id="0"/><mxCell id="1" parent="0"/>\n' + "\n".join(self.cells)
                + "\n</root></mxGraphModel></diagram></mxfile>\n")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("figures", nargs="*", default=list(FIGURES))
    ap.add_argument("--out", default=os.path.dirname(HERE))
    args = ap.parse_args()
    old = baseline_names()
    for name in args.figures:
        spec = FIGURES[name]
        with open(os.path.join(REPO, MODEL, spec["ecore"] + ".ecore")) as f:
            classes = parse(f.read())
        fig = Figure(name, spec, classes, old)
        fig.build()
        path = os.path.join(args.out, name + ".drawio")
        with open(path, "w") as f:
            f.write(fig.xml())
        print(path)


if __name__ == "__main__":
    main()
