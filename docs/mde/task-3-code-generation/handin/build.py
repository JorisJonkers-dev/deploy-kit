"""Build the Task 3 hand-in archive from the repository.

After `(cd emf && ./mvnw clean verify)`, writes task-3-code-generation.zip, or with
`--dir [PATH]` the same tree as a folder. Needs kustomize and kubeconform on the PATH
for the evidence. See README.md.
"""
import os, re, shutil, subprocess, sys, tempfile, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..'))
EX = f'{R}/spec/v1/examples'
P = f'{R}/emf/bundles/cli/target/parity'
PROJECT = 'task-3-code-generation'
OUT = os.path.join(tempfile.mkdtemp(), PROJECT)
os.makedirs(OUT)

NS = 'https://jorisjonkers.dev/deploy-kit/resolved-deployment/1'
XSI = 'http://www.w3.org/2001/XMLSchema-instance'
# The cases whose resolved models the templates render, and the project each resolves.
CASES = {'minimal': 'notes', 'data': 'data'}
# The committed trees the rendered union equals, between them.
TREES = ['minimal', 'data', '_estate']
# What a cluster applies, one directory at a time: each project's, and the public entry point's.
APPLIED = ['apps/notes', 'apps/data', 'apps/edge/public-frankfurt']
KUBERNETES = '1.31.4'
CRDS = ('https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/'
        '{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json')


def write(dst, text):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, 'w', encoding='utf-8') as f:
        f.write(text)


def copy(src, dst):
    assert os.path.exists(src), f'{src} is missing; run ./mvnw clean verify in emf/ first'
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    (shutil.copytree if os.path.isdir(src) else shutil.copy2)(src, dst)


def located(text):
    """The resolved model with the schemaLocation it needs to open without a registered package."""
    assert 'xsi:schemaLocation' not in text
    root = re.search(r'<(?![?!])[\w:.-]+', text)
    start_tag = text[root.start():text.index('>', root.start())]
    extra = '' if 'xmlns:xsi=' in start_tag else f' xmlns:xsi="{XSI}"'
    extra += f' xsi:schemaLocation="{NS} ../../model/resolved-deployment.ecore"'
    return text[:root.end()] + extra + text[root.end():]


def run(args, cwd):
    done = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    assert done.returncode == 0, f'{" ".join(args)} failed:\n{done.stdout}{done.stderr}'
    return done.stdout


copy(f'{R}/emf/bundles/metamodel/model/resolved-deployment.ecore', f'{OUT}/model/resolved-deployment.ecore')
copy(f'{R}/emf/bundles/render/model/render.mtl', f'{OUT}/templates/render.mtl')
for case, project in CASES.items():
    with open(f'{P}/{case}/{project}.resolveddeployment', encoding='utf-8') as f:
        write(f'{OUT}/examples/{case}/{project}.resolveddeployment', located(f.read()))
copy(f'{P}/rendered', f'{OUT}/generated')
for tree in TREES:
    copy(f'{EX}/{tree}/rendered', f'{OUT}/expected/{tree}')
    readme = f'{OUT}/expected/{tree}/README.md'
    if os.path.exists(readme):
        os.remove(readme)

# The evidence that the generated files load: kustomize builds each applied directory, and
# kubeconform validates every object against the Kubernetes and CRD schemas.
for directory in APPLIED:
    built = run(['kustomize', 'build', directory], f'{OUT}/generated')
    write(f'{OUT}/evidence/kustomize-{directory.replace("/", "-")}.yaml', built)
yamls = sorted(os.path.relpath(os.path.join(d, f), f'{OUT}/generated')
               for d, _, fs in os.walk(f'{OUT}/generated') for f in fs if f.endswith('.yaml'))
report = run(['kubeconform', '-kubernetes-version', KUBERNETES, '-strict', '-summary', '-verbose',
              '-schema-location', 'default', '-schema-location', CRDS, *yamls], f'{OUT}/generated')
write(f'{OUT}/evidence/kubeconform.txt', report)

write(f'{OUT}/.project', f"""<?xml version="1.0" encoding="UTF-8"?>
<projectDescription>
	<name>{PROJECT}</name>
	<comment></comment>
	<projects>
	</projects>
	<buildSpec>
	</buildSpec>
	<natures>
	</natures>
</projectDescription>
""")
write(f'{OUT}/.settings/org.eclipse.core.resources.prefs',
      'eclipse.preferences.version=1\nencoding/<project>=UTF-8\n')

# Beside the project: the report, and the implementation the results come from, as the
# repository tracks it (the EMF modules and the examples their build reads), with a README.
ROOT = os.path.dirname(OUT)
copy(f'{R}/docs/mde/{PROJECT}/main.pdf', f'{ROOT}/report.pdf')
tracked = subprocess.run(['git', '-C', R, 'ls-files', 'emf', 'spec/v1/examples', 'docs/requirements.md'],
                         capture_output=True, text=True, check=True).stdout.split()
for f in tracked:
    copy(f'{R}/{f}', f'{ROOT}/implementation/{f}')
os.chmod(f'{ROOT}/implementation/emf/mvnw', 0o755)
copy(f'{HERE}/hand-in-README.md', f'{ROOT}/README.md')

if '--dir' in sys.argv:
    i = sys.argv.index('--dir')
    target = sys.argv[i + 1] if len(sys.argv) > i + 1 else os.path.join(HERE, 'hand-in')
    target = os.path.abspath(target)
    shutil.rmtree(target, ignore_errors=True)
    shutil.copytree(ROOT, target)
    shutil.rmtree(ROOT)
    print(target, sum(len(f) for _, _, f in os.walk(target)), 'files')
    sys.exit(0)
z = os.path.join(HERE, f'{PROJECT}.zip')
entries = sorted(os.path.join(root, f) for root, _, files in os.walk(ROOT) for f in files)
with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf:
    for full in entries:
        info = zipfile.ZipInfo(os.path.relpath(full, ROOT), date_time=(2026, 10, 30, 0, 0, 0))
        info.external_attr = (os.stat(full).st_mode & 0o777) << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        zf.writestr(info, open(full, 'rb').read())
shutil.rmtree(ROOT)
print(os.path.relpath(z, R), len(entries), 'files,', os.path.getsize(z), 'bytes')
