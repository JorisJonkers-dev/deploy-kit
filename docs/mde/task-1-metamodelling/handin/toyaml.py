"""Render an XMI instance or a JSON document as YAML, mechanically.

XMI: an element is a mapping, its attributes are fields, and its children are
fields named by the containing feature, a list exactly where the Ecore feature
is many-valued. xsi:type becomes `type`. A reference written as an XMI path
(`//@applications.0/@processes.0`) is resolved to the name or id of the object
it points at. Nothing is added and nothing is dropped.
"""
import json, re, sys, xml.etree.ElementTree as ET
import yaml

XSI='{http://www.w3.org/2001/XMLSchema-instance}type'
FIRST=['apiVersion','kind','schemaVersion','id','name','project','owner','type']

def load_ecore(paths):
    classes={}
    for p in paths:
        root=ET.parse(p).getroot()
        for c in root.iter('eClassifiers'):
            name=c.get('name'); sup=[s.split('//')[-1] for s in (c.get('eSuperTypes') or '').split()]
            feats={}
            for f in c.iter('eStructuralFeatures'):
                ub=f.get('upperBound')
                feats[f.get('name')]={'type':(f.get('eType') or '').split('//')[-1],'many':ub=='-1',
                    'kind':f.get('{http://www.w3.org/2001/XMLSchema-instance}type','')}
            classes[name]={'feats':feats,'sup':sup}
    return classes

def feature(classes, cls, fname):
    seen=[cls]
    while seen:
        c=seen.pop()
        if c in classes:
            if fname in classes[c]['feats']: return classes[c]['feats'][fname]
            seen.extend(classes[c]['sup'])
    return None

def scalar(v, etype=''):
    # Typed by the Ecore attribute, never guessed from the text: "50" in an
    # EString stays a string.
    if etype in ('EInt','EIntegerObject','ELong','ELongObject','EShort'): return int(v)
    if etype in ('EBoolean','EBooleanObject'): return v=='true'
    return v

def order(d):
    keys=[k for k in FIRST if k in d]+[k for k in d if k not in FIRST]
    return {k:d[k] for k in keys}

def xmi_to_obj(path, ecores, parsed=None):
    """`parsed` is the same model's intent JSON, read only to name a proxy."""
    classes=load_ecore(ecores)
    root=ET.parse(path).getroot()
    def label(el):
        return el.get('name') or el.get('id') or el.get('claim') or el.get('path')
    def resolve(ref):
        if not ref.startswith('//'): return ref
        el=root
        for step in ref[2:].split('/'):
            m=re.fullmatch(r'@(\w+)(?:\.(\d+))?', step)
            kids=[c for c in el if c.tag==m.group(1)]
            el=kids[int(m.group(2) or 0)]
        return label(el) or ref
    def conv(el, cls, js=None):
        # A reference into another document stays a proxy, and XMI keeps only
        # its index; the name it was written as is the parsed intent's.
        if set(el.attrib)=={'href'}:
            return js if isinstance(js,str) else el.get('href')
        if el.get(XSI): cls=el.get(XSI).split(':')[-1]
        out={}
        if el.get(XSI): out['type']=cls
        for k,v in el.attrib.items():
            if k==XSI or k.startswith('{') : continue
            f=feature(classes, cls, k)
            parts=v.split() if (f and f['many']) else [v]
            vals=[resolve(x) if x.startswith('//') else scalar(x, f['type'] if f else '') for x in parts]
            out[k]=vals if (f and f['many']) else vals[0]
        groups={}; seen={}
        for child in el:
            if not isinstance(child.tag,str): continue
            f=feature(classes, cls, child.tag)
            sub=js.get(child.tag) if isinstance(js,dict) else None
            if f and f['many'] and isinstance(sub,list):
                n=seen.get(child.tag,0); seen[child.tag]=n+1
                sub=sub[n] if n<len(sub) else None
            if child.text and child.text.strip() and len(child)==0 and not child.attrib:
                v=scalar(child.text.strip(), f['type'] if f else '')
            else:
                v=conv(child, f['type'] if f else child.tag, sub)
            if f and f['many']: groups.setdefault(child.tag,[]).append(v)
            else: groups[child.tag]=v
        # An EMF map is a list of key/value entries; it reads as the mapping it is.
        for k,v in groups.items():
            if isinstance(v,list) and v and all(isinstance(e,dict) and set(e)=={'key','value'} for e in v):
                groups[k]={e['key']:e['value'] for e in v}
        out.update(groups)
        return order(out)
    tag=root.tag.split('}')[-1]
    return conv(root, tag.split(':')[-1], json.load(open(parsed)) if parsed else None)

def json_to_obj(path):
    def o(x):
        if isinstance(x,dict): return order({k:o(v) for k,v in x.items()})
        if isinstance(x,list): return [o(v) for v in x]
        return x
    return o(json.load(open(path)))

def dump(obj):
    return yaml.safe_dump(obj, sort_keys=False, default_flow_style=False, width=100, allow_unicode=True)

if __name__=='__main__':
    src=sys.argv[1]; ecores=sys.argv[2:]
    obj=json_to_obj(src) if src.endswith('.json') else xmi_to_obj(src, ecores)
    sys.stdout.write(dump(obj))
