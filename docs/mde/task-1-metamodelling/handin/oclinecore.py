"""Embed a Complete OCL document's invariants and helpers in its Ecore file as OCL annotations."""
import re

PIVOT = 'http://www.eclipse.org/emf/2002/Ecore/OCL/Pivot'
ECORE = 'http://www.eclipse.org/emf/2002/Ecore'
TYPES = {'Boolean': 'EBoolean', 'String': 'EString', 'Integer': 'EInt'}


def parse(ocl):
    """The (context, kind, head, body) of every `inv` and `def:`, in document order."""
    lines = [re.sub(r'\s*--.*$', '', line) for line in ocl.split('\n')]
    items, context, current = [], None, None
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith('import ') or stripped.startswith('package '):
            continue
        if stripped == 'endpackage':
            break
        m = re.match(r'context (\w+)$', stripped)
        if m:
            context, current = m.group(1), None
            continue
        m = re.match(r'(inv|def:)\s*(.*)$', stripped)
        if m and context:
            kind, rest = m.groups()
            if kind == 'inv':
                name, _, body = rest.partition(':')
                current = [context, 'inv', name.strip(), [body.strip()] if body.strip() else []]
            else:
                head, _, body = rest.partition('=')
                current = [context, 'def', head.strip(), [body.strip()] if body.strip() else []]
            items.append(current)
            continue
        assert current, f'OCL text outside an item: {stripped}'
        current[3].append(line.rstrip())
    return [(c, k, h, '\n'.join(b).strip()) for c, k, h, b in items]


def attr(value):
    return (value.replace('&', '&amp;').replace('"', '&quot;').replace('<', '&lt;')
            .replace('>', '&gt;').replace('\n', '&#xA;').replace('\t', '&#x9;'))


def etype(type_name, classes):
    """The Ecore type attribute and multiplicity of an OCL type name."""
    m = re.match(r'(OrderedSet|Set|Sequence|Bag)\((\w+)\)$', type_name)
    many = ''
    if m:
        collection, type_name = m.groups()
        many = ' upperBound="-1"' + ('' if collection in ('OrderedSet', 'Sequence') else ' ordered="false"')
        many += '' if collection in ('OrderedSet', 'Set') else ' unique="false"'
    if type_name in TYPES:
        return 'ecore:EAttribute', f'eType="ecore:EDataType {ECORE}#//{TYPES[type_name]}"{many}'
    assert type_name in classes, f'unknown OCL type {type_name}'
    kind = 'ecore:EReference' if classes[type_name] == 'EClass' else 'ecore:EAttribute'
    return kind, f'eType="#//{type_name}"{many}'


def member(head, body, classes, indent):
    """The derived feature or operation a `def:` declares."""
    pivot = f'{indent}  <eAnnotations source="{PIVOT}">\n{indent}    <details key="%s" value="{attr(body)}"/>\n{indent}  </eAnnotations>\n'
    m = re.match(r'(\w+)\((.*)\)\s*:\s*(\S+)$', head)
    if m:
        name, params, result = m.groups()
        kind, typed = etype(result, classes)
        xml = f'{indent}<eOperations name="{name}" {typed}>\n' + pivot % 'body'
        for param in filter(None, (p.strip() for p in params.split(','))):
            pname, ptype = (s.strip() for s in param.split(':'))
            xml += f'{indent}  <eParameters name="{pname}" {etype(ptype, classes)[1]}/>\n'
        return 'op', xml + f'{indent}</eOperations>\n'
    m = re.match(r'(\w+)\s*:\s*(\S+)$', head)
    assert m, f'unreadable def: {head}'
    name, result = m.groups()
    kind, typed = etype(result, classes)
    return 'feature', (f'{indent}<eStructuralFeatures xsi:type="{kind}" name="{name}" {typed} changeable="false"'
                       f' volatile="true" transient="true" derived="true">\n' + pivot % 'derivation'
                       + f'{indent}</eStructuralFeatures>\n')


def embed(ecore, ocl):
    """The Ecore text with every constraint and helper of `ocl` in its annotations."""
    classes = dict((n, k) for k, n in re.findall(r'<eClassifiers xsi:type="ecore:(EClass|EEnum|EDataType)" name="(\w+)"', ecore))
    per_class = {}
    for context, kind, head, body in parse(ocl):
        per_class.setdefault(context, []).append((kind, head, body))
    for context, items in per_class.items():
        start = re.search(rf'  <eClassifiers xsi:type="ecore:EClass" name="{context}"[^>]*?(/?)>', ecore)
        assert start, f'no class {context}'
        invariants = [(h, b) for k, h, b in items if k == 'inv']
        names = [h for h, _ in invariants]
        assert len(names) == len(set(names)), f'{context}: an invariant name twice'
        head = ''
        if invariants:
            head += (f'    <eAnnotations source="{ECORE}">\n      <details key="constraints" value="{" ".join(names)}"/>\n'
                     f'    </eAnnotations>\n    <eAnnotations source="{PIVOT}">\n')
            head += ''.join(f'      <details key="{h}" value="{attr(b)}"/>\n' for h, b in invariants)
            head += '    </eAnnotations>\n'
        members = [member(h, b, classes, '    ') for k, h, b in items if k == 'def']
        tail = ''.join(x for w, x in members if w == 'op') + ''.join(x for w, x in members if w == 'feature')
        if start.group(1):
            opened = start.group(0)[:-2] + '>\n'
            ecore = ecore[:start.start()] + opened + head + tail + '  </eClassifiers>' + ecore[start.end():]
        else:
            end = ecore.index('\n  </eClassifiers>', start.end())
            ecore = ecore[:start.end()] + '\n' + head + ecore[start.end() + 1:end + 1] + tail + ecore[end + 1:]
    package = re.search(r'<ecore:EPackage[^>]*>', ecore)
    assert package, 'no EPackage'
    delegates = (f'\n  <eAnnotations source="{ECORE}">\n'
                 + ''.join(f'    <details key="{k}" value="{PIVOT}"/>\n'
                           for k in ('invocationDelegates', 'settingDelegates', 'validationDelegates'))
                 + '  </eAnnotations>')
    return ecore[:package.end()] + delegates + ecore[package.end():]
