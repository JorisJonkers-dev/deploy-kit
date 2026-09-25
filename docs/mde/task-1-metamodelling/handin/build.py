"""Build the Task 1 hand-in archive from the repository, never by hand.

Run from anywhere, after a full `emf` build (`./mvnw clean verify` in `emf/`),
which leaves each example's XMI under `emf/bundles/cli/target/parity/`:

    python3 docs/mde/task-1-metamodelling/handin/build.py

It writes `task-1-metamodelling.zip` beside this script. Entries carry a fixed
timestamp, so the same repository builds the same archive.
"""
import os, shutil, zipfile, glob, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from toyaml import xmi_to_obj, json_to_obj, dump
HERE=os.path.dirname(os.path.abspath(__file__))
R=os.path.normpath(os.path.join(HERE,'..','..','..','..'))
EX=f'{R}/spec/v1/examples'; P=f'{R}/emf/bundles/cli/target/parity'
import tempfile
OUT=os.path.join(tempfile.mkdtemp(), 'task-1-metamodelling')
shutil.rmtree(os.path.dirname(OUT), ignore_errors=True); os.makedirs(OUT)
def cp(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    (shutil.copytree if os.path.isdir(src) else shutil.copy2)(src, dst)
cp(f'{R}/docs/mde/task-1-metamodelling/main.pdf', f'{OUT}/report.pdf')
for f in ['project-intent.ecore','project-intent.ocl','resolved-deployment.ecore']:
    cp(f'{R}/emf/bundles/metamodel/model/{f}', f'{OUT}/metamodels/{f}')
for name in ['minimal','auth','data','knowledge','delivery']:
    d=f'{OUT}/examples/{name}'
    for f in glob.glob(f'{EX}/{name}/*.project.yml'): cp(f, f'{d}/1-input/{os.path.basename(f)}')
    if os.path.isdir(f'{EX}/{name}/env'): cp(f'{EX}/{name}/env', f'{d}/1-input/env')
    cp(f'{P}/{name}/intent.xmi', f'{d}/1-input/intent.xmi')
    cp(f'{EX}/{name}/expected/intent.json', f'{d}/1-input/intent.json')
    res=sorted(glob.glob(f'{EX}/{name}/expected/resolved*.json'))
    for f in res: cp(f, f'{d}/2-resolved/{os.path.basename(f)}')
    if name=='minimal': cp(f'{R}/emf/models/minimal.resolveddeployment', f'{d}/2-resolved/minimal.resolveddeployment')
    if not res:
        os.makedirs(f'{d}/2-resolved', exist_ok=True)
        open(f'{d}/2-resolved/README.md','w').write(f'No resolved model is committed for `{name}` yet: the transformation that produces it is Task 2. The minimal and knowledge examples carry one.\n')
    if os.path.isdir(f'{EX}/{name}/rendered'): cp(f'{EX}/{name}/rendered', f'{d}/3-output')
    else:
        os.makedirs(f'{d}/3-output', exist_ok=True)
        open(f'{d}/3-output/README.md','w').write(f'No generated tree is committed for `{name}`: it exists to show a resolved model, not a render.\n')
cp(f'{EX}/platform/platform.intent.yml', f'{OUT}/examples/platform/platform.intent.yml')
cp(f'{P}/platform/intent.xmi', f'{OUT}/examples/platform/intent.xmi')
cp(f'{EX}/platform/expected/intent.json', f'{OUT}/examples/platform/intent.json')
cp(f'{EX}/refusals', f'{OUT}/refusals')
# Every XMI and JSON file gets its YAML view beside it, converted mechanically.
MM=f'{R}/emf/bundles/metamodel/model'
views=0
for root,_,files in os.walk(OUT):
    for f in files:
        full=os.path.join(root,f)
        if f.endswith('.json'): obj=json_to_obj(full)
        elif f.endswith('.xmi'):
            parsed=os.path.join(root,'intent.json')
            obj=xmi_to_obj(full,[f'{MM}/project-intent.ecore'], parsed if os.path.exists(parsed) else None)
        elif f.endswith('.resolveddeployment'): obj=xmi_to_obj(full,[f'{MM}/resolved-deployment.ecore'])
        else: continue
        open(full+'.yml','w').write(dump(obj)); views+=1
print('views', views)
open(f'{OUT}/README.md','w').write("""# Task 1 hand-in: metamodels and models

`report.pdf` is the report. Everything else is copied from the repository
(github.com/JorisJonkers-dev/deploy-kit), and nothing here is edited by hand.

| path | what it holds |
|---|---|
| `metamodels/` | the source metamodel `project-intent.ecore` with its constraints `project-intent.ocl`, and the target metamodel `resolved-deployment.ecore` |
| `examples/<name>/1-input/` | the authored project file in concrete syntax, its env files where it has them, `intent.xmi` (the same model as an instance of the source metamodel, written by the model-driven pipeline) and `intent.json` (its parsed form, the oracle both implementations are tested against) |
| `examples/<name>/2-resolved/` | the resolved model, the state in between: `minimal.resolveddeployment` is an XMI instance of the target metamodel; `resolved*.json` are the projections of the production implementation |
| `examples/<name>/3-output/` | the generated file tree |
| `examples/platform/` | the Platform document every example is read beside, and its model |
| `refusals/` | every refused model, each with the `*.diagnostics.json` it must produce; a directory is a set of documents read together |

Every XMI and JSON file has a YAML view beside it, named after it with `.yml`
appended (`intent.xmi.yml`, `resolved.json.yml`, `minimal.resolveddeployment.yml`).
The conversion is mechanical: an XMI element becomes a mapping, its attributes
fields, and its children a field named by the feature that holds them, a list
exactly where the metamodel's feature is many-valued; `xsi:type` becomes `type`,
a reference path becomes the name of the object it points at, and a map's
key/value entries become a mapping. Nothing is added or dropped. The XMI and JSON
files remain the models themselves; the views are for reading.

The examples, and what each one exercises, are in section 8 and Appendix A of
the report.
""")
z=os.path.join(HERE,'task-1-metamodelling.zip')
entries=sorted(os.path.join(root,f) for root,_,files in os.walk(OUT) for f in files)
with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED) as zf:
    for full in entries:
        info=zipfile.ZipInfo(os.path.relpath(full, os.path.dirname(OUT)), date_time=(2026,9,25,0,0,0))
        info.compress_type=zipfile.ZIP_DEFLATED
        zf.writestr(info, open(full,'rb').read())
shutil.rmtree(os.path.dirname(OUT))
print(os.path.relpath(z, R), len(entries), 'files,', os.path.getsize(z), 'bytes')
