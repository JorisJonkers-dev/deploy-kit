"""Build the Task 2 hand-in archive from the repository.

After `(cd emf && ./mvnw clean verify)`, writes task-2-transformations.zip, or with
`--dir [PATH]` the same tree as a folder. See README.md.
"""
import glob, os, re, shutil, subprocess, sys, tempfile, zipfile
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..'))
EX = f'{R}/spec/v1/examples'
P = f'{R}/emf/bundles/cli/target/parity'
MM = f'{R}/emf/bundles/metamodel/model'
QV = f'{R}/emf/bundles/resolve/model'
PROJECT = 'task-2-transformations'
OUT = os.path.join(tempfile.mkdtemp(), PROJECT)
os.makedirs(OUT)

NS = {'project-intent.ecore': 'https://jorisjonkers.dev/deploy-kit/project-intent/1',
      'pinned-inputs.ecore': 'https://jorisjonkers.dev/deploy-kit/pinned-inputs/1',
      'resolved-deployment.ecore': 'https://jorisjonkers.dev/deploy-kit/resolved-deployment/1'}
XSI = 'http://www.w3.org/2001/XMLSchema-instance'

# The cases the resolution reaches, and the project each resolves: the pipeline's own list.
CASES = {'minimal': 'notes', 'auth': 'auth', 'data': 'data', 'delivery': 'delivery',
         'edge': 'edge', 'observability': 'observability', 'secrets': 'secrets'}


def write(dst, text):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, 'w', encoding='utf-8') as f:
        f.write(text)


def copy(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    (shutil.copytree if os.path.isdir(src) else shutil.copy2)(src, dst)


def uncommented(text):
    """The XML text without its comments, and without the lines they leave empty."""
    text = re.sub(r'\n[ \t]*<!--.*?-->[ \t]*(?=\n)', '', text, flags=re.S)
    text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
    return re.sub(r'\?>\s*\n\s*\n', '?>\n', text)


def xml(src, dst, edit=None):
    """Copy an XML file without its comments, checking that removing them changed nothing else."""
    assert os.path.exists(src), f'{src} is missing; run ./mvnw clean verify in emf/ first'
    with open(src, encoding='utf-8') as f:
        before = f.read()
    stripped = uncommented(before)
    same = lambda t: ET.canonicalize(t, with_comments=False, strip_text=True)
    assert same(before) == same(stripped), f'{src}: stripping comments changed the model'
    after = edit(stripped) if edit else stripped
    ET.fromstring(after.encode('utf-8'))
    write(dst, after)


def located(depth, *ecores):
    """Adds the schemaLocation of each of `ecores` to a model `depth` directories below the root."""
    def edit(text):
        assert 'xsi:schemaLocation' not in text
        root = re.search(r'<(?![?!])[\w:.-]+', text)
        start_tag = text[root.start():text.index('>', root.start())]
        extra = '' if 'xmlns:xsi=' in start_tag else f' xmlns:xsi="{XSI}"'
        pairs = ' '.join(f'{NS[e]} {"../" * depth}model/{e}' for e in ecores)
        extra += f' xsi:schemaLocation="{pairs}"'
        return text[:root.end()] + extra + text[root.end():]
    return edit


# The three metamodels, and the two transformations.
for ecore in NS:
    xml(f'{MM}/{ecore}', f'{OUT}/model/{ecore}')
for qvto in ['lower.qvto', 'resolution.qvto']:
    copy(f'{QV}/{qvto}', f'{OUT}/transforms/{qvto}')

# Each case: its authored files, the two extents the resolution read, the resolved model it wrote,
# the dependency edges exported from it, and the oracle they were compared with.
for case, project in CASES.items():
    d = f'{OUT}/examples/{case}'
    for doc in sorted(glob.glob(f'{EX}/{case}/*.yml')):
        copy(doc, f'{d}/authored/{os.path.basename(doc)}')
    for extra in ['env', 'config']:
        if os.path.isdir(f'{EX}/{case}/{extra}'):
            copy(f'{EX}/{case}/{extra}', f'{d}/authored/{extra}')
    xml(f'{P}/{case}/resolution.intent.xmi', f'{d}/resolution.intent.xmi', located(2, 'project-intent.ecore'))
    xml(f'{P}/{case}/resolution.pinned.xmi', f'{d}/resolution.pinned.xmi', located(2, 'pinned-inputs.ecore'))
    xml(f'{P}/{case}/{project}.resolveddeployment', f'{d}/{project}.resolveddeployment',
        located(2, 'resolved-deployment.ecore'))
    copy(f'{P}/{case}/dependencies.json', f'{d}/dependencies.json')
    copy(f'{EX}/{case}/expected/dependencies.json', f'{d}/expected-dependencies.json')
# The platform document and the pinned inputs every case reads.
for doc in sorted(glob.glob(f'{EX}/platform/*.yml')):
    copy(doc, f'{OUT}/examples/platform/{os.path.basename(doc)}')
# The hand-written target model the resolution of minimal is held equal to.
xml(f'{R}/emf/models/minimal.resolveddeployment', f'{OUT}/examples/minimal/minimal.hand-written.resolveddeployment',
    located(2, 'resolved-deployment.ecore'))

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

# Beside the models project: the report, and the implementation the models come from, as the
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
        info = zipfile.ZipInfo(os.path.relpath(full, ROOT), date_time=(2026, 10, 16, 0, 0, 0))
        info.external_attr = (os.stat(full).st_mode & 0o777) << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        zf.writestr(info, open(full, 'rb').read())
shutil.rmtree(ROOT)
print(os.path.relpath(z, R), len(entries), 'files,', os.path.getsize(z), 'bytes')
