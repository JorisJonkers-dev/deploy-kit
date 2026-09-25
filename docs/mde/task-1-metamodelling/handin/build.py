"""Build the Task 1 hand-in archive from the repository.

After `(cd emf && ./mvnw clean verify)`, writes task-1-metamodelling.zip, or with
`--dir [PATH]` the same tree as a folder. See README.md.
"""
import os, re, shutil, subprocess, zipfile, glob, sys, tempfile
import xml.etree.ElementTree as ET
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from oclinecore import embed

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..'))
EX = f'{R}/spec/v1/examples'
P = f'{R}/emf/bundles/cli/target/parity'
MM = f'{R}/emf/bundles/metamodel/model'
OUT = os.path.join(tempfile.mkdtemp(), 'task-1-metamodelling')
os.makedirs(OUT)

NS = {'project-intent.ecore': 'https://jorisjonkers.dev/deploy-kit/project-intent/1',
      'resolved-deployment.ecore': 'https://jorisjonkers.dev/deploy-kit/resolved-deployment/1'}
XSI = 'http://www.w3.org/2001/XMLSchema-instance'


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
    with open(src, encoding='utf-8') as f:
        before = f.read()
    stripped = uncommented(before)
    same = lambda t: ET.canonicalize(t, with_comments=False, strip_text=True)
    assert same(before) == same(stripped), f'{src}: stripping comments changed the model'
    after = edit(stripped) if edit else stripped
    ET.fromstring(after.encode('utf-8'))
    write(dst, after)


def located(ecore, depth):
    """Adds the schemaLocation of `ecore` to a model `depth` directories below the archive root."""
    where = '../' * depth + 'model/' + ecore
    def edit(text):
        assert 'xsi:schemaLocation' not in text
        root = re.search(r'<(?![?!])[\w:.-]+', text)
        assert root, 'no root element'
        start_tag = text[root.start():text.index('>', root.start())]
        extra = '' if 'xmlns:xsi=' in start_tag else f' xmlns:xsi="{XSI}"'
        extra += f' xsi:schemaLocation="{NS[ecore]} {where}"'
        return text[:root.end()] + extra + text[root.end():]
    return edit


PROJECT = 'task-1-metamodelling'


def genmodel(name, plugin):
    """The genmodel: model code into this project, which holds `model/` as EMF expects, and edit,
    editor and tests code into plug-in projects of its own, all for Java 21."""
    def edit(text):
        text = re.sub(r'modelDirectory="[^"]*"', f'modelDirectory="/{PROJECT}/src-gen"', text)
        text = re.sub(r'modelPluginID="[^"]*"',
                      f'modelPluginID="dev.jorisjonkers.deploykit.emf.metamodel" '
                      f'editDirectory="/{plugin}.edit/src-gen" editPluginID="{plugin}.edit" '
                      f'editorDirectory="/{plugin}.editor/src-gen" editorPluginID="{plugin}.editor" '
                      f'testsDirectory="/{plugin}.tests/src-gen" testsPluginID="{plugin}.tests"', text)
        text = text.replace('complianceLevel="17.0"', 'complianceLevel="21.0"')
        text = text.replace('updateClasspath="false"', 'updateClasspath="true"')
        return text.replace('bundleManifest="false"', 'bundleManifest="true"')
    xml(f'{MM}/{name}.genmodel', f'{OUT}/model/{name}.genmodel', edit)


def model(parity, dst, depth):
    """A model's XMI as the pipeline wrote it, beside its authored file."""
    assert os.path.exists(parity), f'{parity} is missing; run ./mvnw clean verify in emf/ first'
    xml(parity, dst, located('project-intent.ecore', depth))


def xmi_name(document):
    return re.sub(r'\.yml$', '.xmi', os.path.basename(document))


def documents(directory):
    return sorted(f for f in glob.glob(f'{directory}/*.yml')
                  if f.endswith('.project.yml') or f.endswith('/platform.intent.yml'))


# The metamodels, their constraints and their genmodels.
with open(f'{MM}/project-intent.ocl', encoding='utf-8') as f:
    ocl = f.read()
xml(f'{MM}/project-intent.ecore', f'{OUT}/model/project-intent.ecore', lambda text: embed(text, ocl))
xml(f'{MM}/resolved-deployment.ecore', f'{OUT}/model/resolved-deployment.ecore')
genmodel('project-intent', 'dev.jorisjonkers.deploykit.emf.projectintent')
genmodel('resolved-deployment', 'dev.jorisjonkers.deploykit.emf.resolveddeployment')
# The constraints import their metamodel by file rather than by a registered namespace, so they
# bind to the same package the models' schemaLocation loads.
assert f"import '{NS['project-intent.ecore']}'" in ocl
write(f'{OUT}/model/project-intent.ocl',
      ocl.replace(f"import '{NS['project-intent.ecore']}'", "import 'project-intent.ecore'"))

# The accepted examples: each authored file with its env files, and its XMI beside it.
for name in ['minimal', 'auth', 'data', 'knowledge', 'delivery', 'platform']:
    d = f'{OUT}/examples/{name}'
    for doc in documents(f'{EX}/{name}'):
        copy(doc, f'{d}/{os.path.basename(doc)}')
        model(f'{P}/{name}/{xmi_name(doc)}', f'{d}/{xmi_name(doc)}', 2)
    if os.path.isdir(f'{EX}/{name}/env'):
        copy(f'{EX}/{name}/env', f'{d}/env')
# The one target model, an XMI instance of the target metamodel written by hand.
xml(f'{R}/emf/models/minimal.resolveddeployment', f'{OUT}/examples/minimal/minimal.resolveddeployment',
    located('resolved-deployment.ecore', 2))

# The refused models, each case that has an oracle: a single file beside its XMI under refusals/,
# and a set of documents read together in a directory of its own.
cases = sorted(os.path.basename(o)[:-len('.diagnostics.json')]
               for o in glob.glob(f'{EX}/refusals/*.diagnostics.json'))
for case in cases:
    if os.path.isdir(f'{EX}/refusals/{case}'):
        for doc in documents(f'{EX}/refusals/{case}'):
            copy(doc, f'{OUT}/refusals/{case}/{os.path.basename(doc)}')
            model(f'{P}/refusals/{case}/{xmi_name(doc)}', f'{OUT}/refusals/{case}/{xmi_name(doc)}', 2)
    else:
        doc = f'{EX}/refusals/{case}.project.yml'
        copy(doc, f'{OUT}/refusals/{os.path.basename(doc)}')
        model(f'{P}/refusals/{case}/{xmi_name(doc)}', f'{OUT}/refusals/{xmi_name(doc)}', 1)

# The project as Eclipse configures it once OCL and Xtext are enabled on it, in UTF-8.
# How to reproduce each refusal in Eclipse, read off the oracles: which file the error points
# into, and whether the embedded constraints report it or the OCL document must be loaded.
import json
rows = []
for case in cases:
    entries = json.load(open(f'{EX}/refusals/{case}.diagnostics.json'))
    codes = ', '.join(sorted({e['code'] for e in entries}))
    document = xmi_name(entries[0]['document'])
    single = not os.path.isdir(f'{EX}/refusals/{case}')
    where = f'`{case}.project.xmi`' if single else f'`{case}/{document}`'
    if codes.startswith('E_UNKNOWN_'):
        how = 'unresolved reference'
    elif single or document == 'platform.intent.xmi':
        how = 'Validate'
    else:
        how = 'both files + OCL document'
    rows.append(f'| {where} | {codes} | {how} |')
write(f'{OUT}/refusals/README.md', """# Refused models

Every model here is one the pipeline rejects. Each is the authored YAML file and,
beside it, its XMI. The table says which XMI holds the error, the code it
reports (Appendix B of the report says what each code rejects), and how to see
it. Open an XMI with Open With > Sample Reflective Ecore Model Editor.

- **Validate**: select the root object and choose Validate. The constraints
  embedded in `model/project-intent.ecore` report the code.
- **Both files + OCL document**: a folder is a platform document and a project
  file that are only wrong together, so each file alone validates. The OCL
  document must see both files:
  1. Open the project file's XMI, `refusals.project.xmi`.
  2. Right-click in the editor, choose Load Resource..., and add
     `platform.intent.xmi` from the same folder.
  3. Choose OCL > Load Document and select `model/project-intent.ocl`. Load it
     after step 2, so it sees both files.
  4. Select the root object of `refusals.project.xmi` and choose Validate.
- **Unresolved reference**: the model names something no document declares.
  Validate reports that the reference is an unresolved proxy, which is the
  rejection; the code is the pipeline's name for it.

| Model | Code | How to see it |
|---|---|---|
""" + '\n'.join(rows) + '\n')

write(f'{OUT}/.project', f"""<?xml version="1.0" encoding="UTF-8"?>
<projectDescription>
	<name>{PROJECT}</name>
	<comment></comment>
	<projects>
	</projects>
	<buildSpec>
		<buildCommand>
			<name>org.eclipse.ocl.pivot.ui.oclbuilder</name>
			<arguments>
				<dictionary>
					<key>disabledExtensions</key>
					<value>*,essentialocl</value>
				</dictionary>
				<dictionary>
					<key>disabledPaths</key>
					<value>bin/**,target/**</value>
				</dictionary>
				<dictionary>
					<key>enabledExtensions</key>
					<value>ecore,ocl,oclinecore,oclstdlib,uml</value>
				</dictionary>
				<dictionary>
					<key>enabledPaths</key>
					<value>**</value>
				</dictionary>
			</arguments>
		</buildCommand>
		<buildCommand>
			<name>org.eclipse.xtext.ui.shared.xtextBuilder</name>
			<arguments>
			</arguments>
		</buildCommand>
	</buildSpec>
	<natures>
		<nature>org.eclipse.xtext.ui.shared.xtextNature</nature>
		<nature>org.eclipse.ocl.pivot.ui.oclnature</nature>
	</natures>
</projectDescription>
""")
write(f'{OUT}/.settings/org.eclipse.core.resources.prefs',
      'eclipse.preferences.version=1\nencoding/<project>=UTF-8\n')

# Beside the models project: the report, and the implementation the models come from, as the
# repository tracks it (the EMF modules and the examples their build reads), with a README.
ROOT = os.path.dirname(OUT)
copy(f'{R}/docs/mde/task-1-metamodelling/main.pdf', f'{ROOT}/report.pdf')
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
z = os.path.join(HERE, 'task-1-metamodelling.zip')
entries = sorted(os.path.join(root, f) for root, _, files in os.walk(ROOT) for f in files)
with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf:
    for full in entries:
        info = zipfile.ZipInfo(os.path.relpath(full, ROOT), date_time=(2026, 9, 25, 0, 0, 0))
        info.external_attr = (os.stat(full).st_mode & 0o777) << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        zf.writestr(info, open(full, 'rb').read())
shutil.rmtree(ROOT)
print(os.path.relpath(z, R), len(entries), 'files,', os.path.getsize(z), 'bytes')
