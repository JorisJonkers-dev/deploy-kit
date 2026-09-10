#!/usr/bin/env python3
"""Render chapter 10's class diagram from the mermaid block that mirrors it.

The drawing and the mermaid cannot disagree, because the mermaid IS the source:
this reads the `classDiagram` block out of spec/v1/10-service-intent.md and
emits a .drawio file, which draw.io then exports to the committed SVG.

The layout is a tidy tree, so it has no edge crossings by construction. The
composition edges plus each enumeration's owning attribute form a spanning
tree; every node sits one layer below its parent, each parent's fan runs on a
horizontal bus of its own, and the handful of edges that are not tree edges are
routed through the nearest empty gap rather than across the drawing.

Usage:
    python3 scripts/diagrams/class-diagram.py out.drawio
    /Applications/draw.io.app/Contents/MacOS/draw.io -x -f svg -e -b 10 \
        -o spec/v1/diagrams/10-service-intent-model.drawio.svg out.drawio

CHILDREN below is the only hand-maintained part: it fixes the tree parent of
each node and the sibling order. Adding a class or an enumeration to the
mermaid without adding it here fails loudly.
"""
import re, sys, xml.etree.ElementTree as ET

MD='spec/v1/10-service-intent.md'
src=open(MD).read()
body=re.search(r'```mermaid\nclassDiagram\n(.*?)\n```', src, re.S).group(1)

# ---- parse
nodes={}   # name -> {'kind':'class'|'enum', 'rows':[...]}
for name, blk in re.findall(r'    class (\w+) \{(.*?)\n    \}', body, re.S):
    rows=[l.strip() for l in blk.strip('\n').split('\n') if l.strip()]
    kind='enum' if '<<enumeration>>' in rows else 'class'
    rows=[r for r in rows if not r.startswith('<<')]
    if kind=='class':
        rows=[('+ '+r[1:].replace('  ',' ')) if r.startswith('+') else r for r in rows]
        rows=[re.sub(r'^\+\s*(\S+)\s+(\S+)$', r'+ \1  \2', r) for r in rows]
    nodes[name]={'kind':kind,'rows':rows}

comp=[]; dep=[]
for line in body.split('\n'):
    m=re.match(r'\s*(\w+)\s+"([^"]+)"\s+\*--\s+"([^"]+)"\s+(\w+)\s*:\s*(.*)', line)
    if m:
        comp.append((m.group(1), m.group(4), m.group(3), m.group(5).strip())); continue
    m=re.match(r'\s*(\w+)\s+\.\.>\s+(\w+)\s*:\s*(.*)', line)
    if m:
        dep.append((m.group(1), m.group(2), m.group(3).strip()))

# ---- the spanning tree: composition, plus each enum under the class that names it
CHILDREN={
 'Domain':   ['Service'],
 'Service':  ['Observability','Grant','Workload','Exposure'],
 'Observability': ['AlertClass','Scrape'],
 'Grant':    ['SecretEngine','AccessTier','TransitOp','Delivery','Rotation'],
 'Rotation': ['Tolerance'],
 'Workload': ['Lifecycle','Runtime','Engine','Cutover','Capacity','Sidecar','Probe',
              'Asset','Volume','Placement','EnvFile','DependencyEdge','Surface'],
 'Volume':   ['DurabilityClass'],
 'Placement':['Arch','GpuRequest','DiskRequest'],
 'DiskRequest':['Media'],
 'EnvFile':  ['Placeholder'],
 'Placeholder':['PlaceholderKind'],
 'Exposure': ['Route','Audience','ContentPolicy'],
 'Route':    ['Match'],
}
placed=set(['Domain'])
for p,ks in CHILDREN.items():
    for k in ks:
        assert k in nodes, f'unknown node {k}'
        placed.add(k)
missing=set(nodes)-placed
assert not missing, f'not in the tree: {sorted(missing)}'

W=200; HGAP=24; VGAP=96
def height(n):
    d=nodes[n]
    return (54 if d['kind']=='enum' else 36) + 20*len(d['rows'])

depth={'Domain':0}
def setdepth(n,d):
    depth[n]=d
    for c in CHILDREN.get(n,[]): setdepth(c,d+1)
setdepth('Domain',0)

x={}; cursor=[0.0]
def layout(n):
    ks=CHILDREN.get(n,[])
    if not ks:
        x[n]=cursor[0]; cursor[0]+=W+HGAP; return
    for c in ks: layout(c)
    x[n]=(x[ks[0]]+x[ks[-1]])/2.0
layout('Domain')

maxd=max(depth.values())
rowh={d:max([height(n) for n in nodes if depth[n]==d]) for d in range(maxd+1)}
y={}; acc=40.0
for d in range(maxd+1):
    y[d]=acc; acc+=rowh[d]+VGAP

# ---- emit
LANE_C='swimlane;html=0;childLayout=stackLayout;horizontal=1;startSize=36;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;fillColor=#dbeafe;swimlaneFillColor=#f4f8ff;strokeColor=#1e40af;strokeWidth=1.5;fontFamily=Helvetica;fontSize=12;fontStyle=1;align=center;verticalAlign=middle;'
LANE_E='swimlane;html=0;childLayout=stackLayout;horizontal=1;startSize=54;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;fillColor=#f5f3ff;swimlaneFillColor=#fdfcff;strokeColor=#6d28d9;strokeWidth=1.5;fontFamily=Helvetica;fontSize=12;fontStyle=1;align=center;verticalAlign=middle;'
ATTR='text;html=0;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;spacingLeft=8;spacingRight=4;overflow=hidden;fontFamily=Helvetica;fontSize=11;'
E_COMP=('edgeStyle=orthogonalEdgeStyle;rounded=0;html=0;jettySize=auto;orthogonalLoop=1;jumpStyle=arc;jumpSize=8;'
        'strokeColor=#475569;strokeWidth=1.5;fontSize=11;fontFamily=Helvetica;labelBackgroundColor=#ffffff;'
        'startArrow=diamondThin;startFill=1;startSize=12;endArrow=none;'
        'exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;')
E_ENUM=('edgeStyle=orthogonalEdgeStyle;rounded=0;html=0;jettySize=auto;orthogonalLoop=1;jumpStyle=arc;jumpSize=8;'
        'strokeColor=#6d28d9;strokeWidth=1.5;fontSize=11;fontFamily=Helvetica;fontColor=#6d28d9;labelBackgroundColor=#ffffff;'
        'dashed=1;dashPattern=8 4;endArrow=open;endFill=0;endSize=10;'
        'exitX=0.5;exitY=1;exitDx=0;exitDy=0;entryX=0.5;entryY=0;entryDx=0;entryDy=0;')

model=ET.Element('mxGraphModel',{'dx':'0','dy':'0','grid':'0','gridSize':'10','guides':'1','tooltips':'1',
 'connect':'1','arrows':'1','fold':'0','page':'0','pageScale':'1','pageWidth':'1600','pageHeight':'1200',
 'math':'0','shadow':'0','adaptiveColors':'auto'})
root=ET.SubElement(model,'root')
ET.SubElement(root,'mxCell',{'id':'0'})
ET.SubElement(root,'mxCell',{'id':'1','parent':'0'})
ident={}
for i,n in enumerate(sorted(nodes)):
    ident[n]=f'n{i}'
    d=nodes[n]
    val=(f'«enumeration»\n{n}' if d['kind']=='enum' else n)
    style=LANE_E if d['kind']=='enum' else LANE_C
    start=54 if d['kind']=='enum' else 36
    c=ET.SubElement(root,'mxCell',{'id':ident[n],'value':val,'style':style,'parent':'1','vertex':'1'})
    ET.SubElement(c,'mxGeometry',{'x':str(int(x[n])),'y':str(int(y[depth[n]])),
                                  'width':str(W),'height':str(start+20*len(d['rows'])),'as':'geometry'})
    for j,r in enumerate(d['rows']):
        k=ET.SubElement(root,'mxCell',{'id':f'{ident[n]}a{j}','value':r,'style':ATTR,'parent':ident[n],'vertex':'1'})
        ET.SubElement(k,'mxGeometry',{'y':str(start+20*j),'width':str(W),'height':'20','as':'geometry'})

def add_edge(eid,style,s,t,label,points=None):
    c=ET.SubElement(root,'mxCell',{'id':eid,'value':label,'style':style,'parent':'1','edge':'1',
                                   'source':ident[s],'target':ident[t]})
    g=ET.SubElement(c,'mxGeometry',{'relative':'1','as':'geometry'})
    if points:
        arr=ET.SubElement(g,'Array',{'as':'points'})
        for px,py in points: ET.SubElement(arr,'mxPoint',{'x':str(int(px)),'y':str(int(py))})

# tree edges first: parent bottom -> child top, no crossings by construction
tree=set()
for p,ks in CHILDREN.items():
    for k in ks: tree.add((p,k))
# one horizontal bus per parent, stacked in the gap above its children's row
bus={}
for d in range(maxd):
    parents=[n for n in nodes if depth[n]==d and CHILDREN.get(n)]
    parents.sort(key=lambda n: x[n])
    for j,n in enumerate(parents):
        bus[n]=y[d]+rowh[d]+22+j*20

# two edges between the same pair (probes.readiness and probes.liveness) get
# their own lane and their own drop, so neither line nor label lands on the other
seen_pair={}
def tree_points(a,b):
    k=seen_pair.get((a,b),0); seen_pair[(a,b)]=k+1
    off=44*k
    return [(x[a]+W/2+off, bus[a]+16*k), (x[b]+W/2+off, bus[a]+16*k)], k

def tree_edge(eid,style,a,b,label):
    pts,k=tree_points(a,b)
    st=style
    if k:
        st=(style.replace('exitX=0.5;','exitX=0.72;')
                 .replace('entryX=0.5;','entryX=0.72;'))
    add_edge(eid,st,a,b,label,points=pts)

i=0
for a,b,mult,label in comp:
    if (a,b) in tree:
        tree_edge(f'e{i}',E_COMP,a,b,f'{mult}  {label}'); i+=1
for a,b,label in dep:
    if (a,b) in tree:
        tree_edge(f'e{i}',E_ENUM,a,b,label); i+=1
# the enum edges the mermaid draws as dependencies are all tree edges; the rest are cross-links
FLOOR=acc+40
cross=[]
for a,b,mult,label in comp:
    if (a,b) not in tree: cross.append((E_COMP,a,b,f'{mult}  {label}'))
for a,b,label in dep:
    if (a,b) not in tree: cross.append((E_ENUM,a,b,f'«{label}»' if 'name' in label or 'match' in label else label))
# a cross-link is routed in the nearest empty gap, never through the tree:
# same row -> over the top of that row; one row apart -> the gap between them;
# further apart -> a lane under the whole drawing.
floor_n=0; used_lane={}
for j,(style,a,b,label) in enumerate(cross):
    da,db=depth[a],depth[b]
    if da==db:
        base=y[da]-34
        lane=base-14*used_lane.get(('t',da),0); used_lane[('t',da)]=used_lane.get(('t',da),0)+1
        st=(style.replace('exitX=0.5;exitY=1;','exitX=0.5;exitY=0;')
                 .replace('entryX=0.5;entryY=0;','entryX=0.5;entryY=0;'))
    elif abs(da-db)==1:
        deep=max(da,db)
        base=y[deep]-30
        lane=base-14*used_lane.get(('g',deep),0); used_lane[('g',deep)]=used_lane.get(('g',deep),0)+1
        st=style
        if da>db:   # the deeper node is the source: leave from its top
            st=(style.replace('exitX=0.5;exitY=1;','exitX=0.5;exitY=0;')
                     .replace('entryX=0.5;entryY=0;','entryX=0.5;entryY=1;'))
    else:
        lane=FLOOR+floor_n*40; floor_n+=1
        st=style.replace('entryX=0.5;entryY=0;','entryX=0.5;entryY=1;')
    add_edge(f'x{j}',st,a,b,label,
             points=[(x[a]+W/2, lane), (x[b]+W/2, lane)])

open(sys.argv[1],'w').write(
  '<mxfile host="Electron" agent="deploy-kit generator" version="29.0.3">'
  f'<diagram name="Service Intent — the layer-1 model" id="0">{ET.tostring(model, encoding="unicode")}</diagram></mxfile>')
print(f'nodes={len(nodes)} depth={maxd} width={int(cursor[0])} height={int(acc)} cross-links={len(cross)}')
