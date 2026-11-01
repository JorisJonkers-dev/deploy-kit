"""Build the Task 3 hand-in archive from the repository.

After the emf build README.md names, writes task-3-code-generation.zip, or with `--dir [PATH]`
the same tree as a folder. `--pdf PATH` names the report (default ../main.pdf) and `--spec-rev
REV` the revision the oracles are taken from (default HEAD, the checked-out tree). See README.md.
"""
import io, os, re, shutil, subprocess, sys, tarfile, tempfile, zipfile
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.normpath(os.path.join(HERE, '..', '..', '..', '..'))
STAGES = f'{R}/emf/bundles/cli/src/test/resources/stages'
PROJECT = 'task-3-code-generation'


def option(name, default):
    if name not in sys.argv:
        return default
    i = sys.argv.index(name)
    assert len(sys.argv) > i + 1 and not sys.argv[i + 1].startswith('--'), f'{name} needs a value'
    return sys.argv[i + 1]


PDF = os.path.abspath(option('--pdf', os.path.join(HERE, '..', 'main.pdf')))
# The oracles are taken from the checked-out commit by default, the one emf/ is level with;
# --spec-rev pairs emf/ as it stands with spec/v1 as it stood at another revision.
SPEC_REV = option('--spec-rev', 'HEAD')
LIB = f'{R}/emf/target/lib'

ROOT = os.path.join(tempfile.mkdtemp(), 'hand-in')
OUT = f'{ROOT}/{PROJECT}'
IMPL = f'{ROOT}/implementation'
os.makedirs(OUT)

NS = {'resolved-deployment.ecore': 'https://jorisjonkers.dev/deploy-kit/resolved-deployment/1'}
XSI = 'http://www.w3.org/2001/XMLSchema-instance'

# The examples the transformation is shown on: the render stage case each one's model and expected
# files come from, and the Project it renders. minimal's Project is notes.
EXAMPLES = {'minimal': ('minimal-main', 'notes'), 'data': ('data-main', 'data'), 'edge': ('edge', 'edge')}


def write(dst, text):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, 'w', encoding='utf-8', newline='\n') as f:
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
    assert os.path.exists(src), f'{src} is missing'
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


def git(*args):
    return subprocess.run(['git', '-C', R, *args], capture_output=True, check=True).stdout


# The implementation, as the repository tracks it: the EMF modules as they stand, and the examples
# and the two intent schemas their tests read, at SPEC_REV. Left out: the repository's own records
# (decisions, ledgers, CI script) and the one test that holds the ledgers to the repository, which
# reads them.
OMIT = ('emf/docs/', 'emf/scripts/', 'emf/README.md', 'emf/.gitignore',
        'emf/tests/parity/src/main/kotlin/dev/jorisjonkers/deploykit/emf/parity/Ledgers.kt',
        'emf/tests/parity/src/test/kotlin/dev/jorisjonkers/deploykit/emf/parity/LedgersTest.kt')
for f in git('ls-files', '-z', 'emf').decode().split('\0'):
    if f and not f.startswith(OMIT):
        copy(f'{R}/{f}', f'{IMPL}/{f}')
os.chmod(f'{IMPL}/emf/mvnw', 0o755)
SPEC = ['spec/v1/examples', 'spec/v1/schemas/project-intent.schema.json', 'spec/v1/schemas/platform-intent.schema.json']
with tarfile.open(fileobj=io.BytesIO(git('archive', '--format=tar', SPEC_REV, *SPEC))) as tar:
    for member in tar.getmembers():
        if member.isfile():
            dst = f'{IMPL}/{member.name}'
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst, 'wb') as f:
                f.write(tar.extractfile(member).read())
            os.chmod(dst, 0o755 if member.mode & 0o100 else 0o644)
ORACLES = f'{IMPL}/spec/v1/examples'

# The metamodel the transformation reads. The transformation itself, render.mtl, stays in the render
# plug-in project only: Acceleo's editor resolves a module's metamodel through the classpath of the
# Java project holding it, so a copy here would show every type in it as unresolved.
xml(f'{R}/emf/bundles/metamodel/model/resolved-deployment.ecore', f'{OUT}/model/resolved-deployment.ecore')
copy(f'{HERE}/scripts/Render.java', f'{OUT}/scripts/Render.java')

# Each example: the Resolved Deployment the resolution writes for it, the files render.mtl generates
# from it, and the oracles they are compared with: the Project's own committed tree and the
# platform's estate-scoped share, which every rendering writes beside it.
assert os.path.isdir(LIB), f'{LIB} is missing; build emf/ first, as README.md says'
java = os.path.join(os.environ['JAVA_HOME'], 'bin', 'java') if 'JAVA_HOME' in os.environ else 'java'
for example, (case, project) in EXAMPLES.items():
    d = f'{OUT}/examples/{example}'
    model = f'{d}/{project}.resolveddeployment'
    xml(f'{STAGES}/resolve/{case}/expected/{project}.resolveddeployment', model, located(2, *NS))
    copy(f'{ORACLES}/{example}/rendered', f'{d}/expected')
    shutil.copytree(f'{ORACLES}/platform/rendered', f'{d}/expected', dirs_exist_ok=True)
    subprocess.run([java, '-cp', f'{LIB}/*', f'{OUT}/scripts/Render.java', model, f'{d}/generated', f'{d}/expected'],
                   check=True, stdout=subprocess.DEVNULL)

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

# The launches: one Program launch per example, which runs Render.java on that example's model with
# the Java 21 Eclipse knows, and one Maven launch that runs the implementation's tests.
HOME = '${project_loc:' + PROJECT + '}'
JRE_21 = 'org.eclipse.jdt.launching.JRE_CONTAINER/org.eclipse.jdt.internal.debug.ui.launcher.StandardVMType/JavaSE-21'
for example, (_, project) in EXAMPLES.items():
    arguments = (f'-cp &quot;{HOME}/../implementation/emf/target/lib/*&quot; scripts/Render.java '
                 f'examples/{example}/{project}.resolveddeployment examples/{example}/generated examples/{example}/expected')
    write(f'{OUT}/render {example}.launch', f"""<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<launchConfiguration type="org.eclipse.ui.externaltools.ProgramLaunchConfigurationType">
    <stringAttribute key="org.eclipse.debug.core.ATTR_REFRESH_SCOPE" value="${{project}}"/>
    <booleanAttribute key="org.eclipse.debug.core.capture_output" value="true"/>
    <booleanAttribute key="org.eclipse.debug.ui.ATTR_CONSOLE_OUTPUT_ON" value="true"/>
    <booleanAttribute key="org.eclipse.debug.ui.ATTR_LAUNCH_IN_BACKGROUND" value="true"/>
    <stringAttribute key="org.eclipse.ui.externaltools.ATTR_LOCATION" value="${{ee_home:JavaSE-21}}/bin/java"/>
    <stringAttribute key="org.eclipse.ui.externaltools.ATTR_TOOL_ARGUMENTS" value="{arguments}"/>
    <stringAttribute key="org.eclipse.ui.externaltools.ATTR_WORKING_DIRECTORY" value="{HOME}"/>
</launchConfiguration>
""")
write(f'{OUT}/test implementation.launch', f"""<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<launchConfiguration type="org.eclipse.m2e.Maven2LaunchConfigurationType">
    <booleanAttribute key="M2_DEBUG_OUTPUT" value="false"/>
    <stringAttribute key="M2_GOALS" value="clean verify"/>
    <booleanAttribute key="M2_NON_RECURSIVE" value="false"/>
    <booleanAttribute key="M2_OFFLINE" value="false"/>
    <listAttribute key="M2_PROPERTIES">
        <listEntry value="skipPitest=true"/>
        <listEntry value="jacoco.skip=true"/>
    </listAttribute>
    <booleanAttribute key="M2_SKIP_TESTS" value="false"/>
    <booleanAttribute key="M2_UPDATE_SNAPSHOTS" value="false"/>
    <booleanAttribute key="M2_WORKSPACE_RESOLUTION" value="false"/>
    <stringAttribute key="org.eclipse.debug.core.ATTR_REFRESH_SCOPE" value="${{project}}"/>
    <stringAttribute key="org.eclipse.jdt.launching.JRE_CONTAINER" value="{JRE_21}"/>
    <stringAttribute key="org.eclipse.jdt.launching.WORKING_DIRECTORY" value="{HOME}/../implementation/emf"/>
</launchConfiguration>
""")

# Beside the project: the report, the README and the build scripts.
assert os.path.exists(PDF), f'{PDF} is missing; build the report first'
copy(PDF, f'{ROOT}/report.pdf')
copy(f'{HERE}/hand-in-README.md', f'{ROOT}/README.md')
for script in ['build.sh', 'build.cmd']:
    copy(f'{HERE}/scripts/{script}', f'{ROOT}/{script}')
os.chmod(f'{ROOT}/build.sh', 0o755)

if '--dir' in sys.argv:
    i = sys.argv.index('--dir')
    has_path = len(sys.argv) > i + 1 and not sys.argv[i + 1].startswith('--')
    target = os.path.abspath(sys.argv[i + 1] if has_path else os.path.join(HERE, 'hand-in'))
    shutil.rmtree(target, ignore_errors=True)
    shutil.copytree(ROOT, target)
    shutil.rmtree(os.path.dirname(ROOT))
    print(target, sum(len(f) for _, _, f in os.walk(target)), 'files')
    sys.exit(0)
z = os.path.join(HERE, f'{PROJECT}.zip')
entries = sorted(os.path.join(root, f) for root, _, files in os.walk(ROOT) for f in files)
with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf:
    for full in entries:
        info = zipfile.ZipInfo(os.path.relpath(full, ROOT).replace(os.sep, '/'), date_time=(2026, 10, 30, 0, 0, 0))
        info.external_attr = (os.stat(full).st_mode & 0o777) << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        with open(full, 'rb') as f:
            zf.writestr(info, f.read())
shutil.rmtree(os.path.dirname(ROOT))
print(os.path.relpath(z, R), len(entries), 'files,', os.path.getsize(z), 'bytes')
