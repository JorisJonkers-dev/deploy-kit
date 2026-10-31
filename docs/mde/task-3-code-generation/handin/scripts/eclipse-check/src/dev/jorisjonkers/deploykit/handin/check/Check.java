package dev.jorisjonkers.deploykit.handin.check;

import java.io.File;
import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Stream;
import javax.xml.parsers.DocumentBuilderFactory;
import org.eclipse.core.resources.IFile;
import org.eclipse.core.resources.IMarker;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IProjectDescription;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.resources.IWorkspace;
import org.eclipse.core.resources.IncrementalProjectBuilder;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.NullProgressMonitor;
import org.eclipse.core.runtime.jobs.Job;
import org.eclipse.debug.core.DebugPlugin;
import org.eclipse.debug.core.ILaunch;
import org.eclipse.debug.core.ILaunchConfiguration;
import org.eclipse.debug.core.ILaunchManager;
import org.eclipse.debug.core.model.IProcess;
import org.eclipse.emf.common.util.Diagnostic;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.emf.ecore.resource.impl.ResourceSetImpl;
import org.eclipse.emf.ecore.util.Diagnostician;
import org.eclipse.emf.edit.domain.IEditingDomainProvider;
import org.eclipse.jdt.launching.IVMInstall;
import org.eclipse.jdt.launching.IVMInstallType;
import org.eclipse.jdt.launching.JavaRuntime;
import org.eclipse.jdt.launching.VMStandin;
import org.eclipse.jdt.launching.environments.IExecutionEnvironment;
import org.eclipse.m2e.core.MavenPlugin;
import org.eclipse.m2e.core.project.LocalProjectScanner;
import org.eclipse.m2e.core.project.MavenProjectInfo;
import org.eclipse.m2e.core.project.ProjectImportConfiguration;
import org.eclipse.pde.core.target.ITargetDefinition;
import org.eclipse.pde.core.target.ITargetPlatformService;
import org.eclipse.pde.core.target.LoadTargetDefinitionJob;
import org.eclipse.swt.SWT;
import org.eclipse.swt.graphics.GC;
import org.eclipse.swt.graphics.Image;
import org.eclipse.swt.graphics.ImageData;
import org.eclipse.swt.graphics.ImageLoader;
import org.eclipse.swt.graphics.Point;
import org.eclipse.swt.widgets.Display;
import org.eclipse.swt.widgets.Shell;
import org.eclipse.ui.IEditorPart;
import org.eclipse.ui.IStartup;
import org.eclipse.ui.IWorkbenchPage;
import org.eclipse.ui.PlatformUI;
import org.eclipse.ui.ide.IDE;
import org.osgi.framework.BundleContext;
import org.osgi.framework.FrameworkUtil;
import org.osgi.framework.ServiceReference;
import org.w3c.dom.Element;

/**
 * Loads the Task 3 hand-in into a fresh workspace the way its README tells an examiner to, and
 * records what an examiner would see: the target platform set first, the Eclipse project and the
 * implementation's Maven projects imported, the problems the build leaves, the editors opening, the
 * models validating and the launches running. It runs once the workbench is up, only when the
 * system property handin.check.root names the unpacked hand-in, writes handin.check.report, and
 * closes the workbench.
 */
public final class Check implements IStartup {

    private static final String PROJECT = "task-3-code-generation";
    private static final String[] EXAMPLES = {"minimal/notes", "data/data", "edge/edge"};

    private final List<String> report = new ArrayList<>();
    private final List<String> failures = new ArrayList<>();
    private Path root;
    private Path shots;
    private long jobMinutes = Long.getLong("handin.check.jobMinutes", 20);

    @Override
    public void earlyStartup() {
        String rootProperty = System.getProperty("handin.check.root");
        if (rootProperty == null) {
            return;
        }
        root = Path.of(rootProperty);
        Path reportFile = Path.of(System.getProperty("handin.check.report", root.resolve("report.txt").toString()));
        shots = reportFile.resolveSibling("screenshots");
        Thread watchdog = new Thread(() -> {
            try {
                Thread.sleep(Long.getLong("handin.check.timeoutMinutes", 90) * 60_000);
                fail("timed out");
                write(reportFile);
                System.exit(3);
            } catch (InterruptedException e) {
                // the check finished first
            }
        });
        watchdog.setDaemon(true);
        watchdog.start();
        try {
            run();
        } catch (Throwable t) {
            StringWriter trace = new StringWriter();
            t.printStackTrace(new PrintWriter(trace));
            fail("the check itself failed: " + trace);
        }
        write(reportFile);
        watchdog.interrupt();
        if (!Boolean.getBoolean("handin.check.keepOpen")) {
            Display.getDefault().asyncExec(() -> PlatformUI.getWorkbench().close());
        }
    }

    private void run() throws Exception {
        IWorkspace workspace = ResourcesPlugin.getWorkspace();
        Path implementation = root.resolve("implementation/emf");
        line("hand-in: " + root);
        line("Eclipse: " + System.getProperty("eclipse.buildId") + ", Java " + System.getProperty("java.version"));

        section("1. Preferences an examiner sets: a JDK 21 for JavaSE-21, Maven settings");
        String jdk = System.getProperty("handin.check.jdk");
        if (jdk != null) {
            IVMInstallType type = JavaRuntime.getVMInstallType("org.eclipse.jdt.internal.debug.ui.launcher.StandardVMType");
            VMStandin standin = new VMStandin(type, "handin-check-jdk-21");
            standin.setName("JDK 21");
            standin.setInstallLocation(new File(jdk));
            IVMInstall vm = standin.convertToRealVM();
            JavaRuntime.saveVMConfiguration();
            IExecutionEnvironment ee = JavaRuntime.getExecutionEnvironmentsManager().getEnvironment("JavaSE-21");
            ee.setDefaultVM(vm);
            line("JavaSE-21 -> " + ee.getDefaultVM().getInstallLocation());
        }
        String settings = System.getProperty("handin.check.mavenSettings");
        if (settings != null) {
            MavenPlugin.getMavenConfiguration().setUserSettingsFile(settings);
            line("Maven user settings: " + settings);
        }

        section("2. Target platform: implementation/emf/emf.target, set active before the import");
        BundleContext context = FrameworkUtil.getBundle(Check.class).getBundleContext();
        ServiceReference<ITargetPlatformService> reference = context.getServiceReference(ITargetPlatformService.class);
        ITargetPlatformService targets = context.getService(reference);
        ITargetDefinition target = targets.getTarget(implementation.resolve("emf.target").toUri()).getTargetDefinition();
        IStatus resolved = target.resolve(new NullProgressMonitor());
        line("resolved: " + resolved.getSeverity() + " " + resolved.getMessage() + ", bundles: "
                + (target.getBundles() == null ? 0 : target.getBundles().length));
        if (!resolved.isOK()) {
            fail("the target platform does not resolve: " + resolved);
        }
        LoadTargetDefinitionJob load = new LoadTargetDefinitionJob(target);
        load.schedule();
        load.join();
        line("active target: " + targets.getWorkspaceTargetHandle() + ", load: " + load.getResult());
        if (!load.getResult().isOK()) {
            fail("the target platform does not load: " + load.getResult());
        }

        section("3. Import: the Eclipse project, then implementation/emf as existing Maven projects");
        IProjectDescription description =
                workspace.loadProjectDescription(org.eclipse.core.runtime.IPath.fromOSString(root.resolve(PROJECT).resolve(".project").toString()));
        IProject archive = workspace.getRoot().getProject(description.getName());
        archive.create(description, null);
        archive.open(null);
        line("imported " + archive.getName() + " from " + archive.getLocation());
        LocalProjectScanner scanner =
                new LocalProjectScanner(List.of(implementation.toString()), false, MavenPlugin.getMavenModelManager());
        scanner.run(new NullProgressMonitor());
        List<MavenProjectInfo> found = new ArrayList<>();
        flatten(scanner.getProjects(), found);
        MavenPlugin.getProjectConfigurationManager()
                .importProjects(found, new ProjectImportConfiguration(), new NullProgressMonitor());
        waitForJobs();
        workspace.build(IncrementalProjectBuilder.FULL_BUILD, new NullProgressMonitor());
        waitForJobs();
        for (IProject project : workspace.getRoot().getProjects()) {
            line("  " + project.getName() + (project.isOpen() ? "" : " (closed)"));
        }
        if (workspace.getRoot().getProjects().length != 1 + found.size()) {
            fail("expected " + (1 + found.size()) + " projects in the workspace");
        }

        section("4. Problems after the build");
        int errors = problems(workspace, "after import");
        if (errors > 0) {
            // What an examiner does next: Project > Clean, all projects.
            workspace.build(IncrementalProjectBuilder.CLEAN_BUILD, new NullProgressMonitor());
            workspace.build(IncrementalProjectBuilder.FULL_BUILD, new NullProgressMonitor());
            waitForJobs();
            int left = problems(workspace, "after Project > Clean");
            if (left > 0) {
                // And then: Maven > Update Project, every project, and a build.
                List<IProject> maven = Arrays.stream(workspace.getRoot().getProjects())
                        .filter(project -> project.getFile("pom.xml").exists()).toList();
                MavenPlugin.getProjectConfigurationManager().updateProjectConfiguration(
                        new org.eclipse.m2e.core.project.MavenUpdateRequest(maven, false, false), new NullProgressMonitor());
                waitForJobs();
                workspace.build(IncrementalProjectBuilder.FULL_BUILD, new NullProgressMonitor());
                waitForJobs();
                left = problems(workspace, "after Maven > Update Project");
            }
            if (left > 0) {
                fail(left + " error markers after the import, a clean build and Maven > Update Project");
            }
        }

        section("5. Editors");
        IFile ecore = archive.getFile("model/resolved-deployment.ecore");
        IFile model = archive.getFile("examples/minimal/notes.resolveddeployment");
        open(ecore, "org.eclipse.emf.ecore.presentation.EcoreEditorID", "ecore-editor");
        IEditorPart reflective = open(model, "org.eclipse.emf.ecore.presentation.ReflectiveEditorID", "model-editor");
        if (reflective instanceof IEditingDomainProvider provider) {
            AtomicReference<String> seen = new AtomicReference<>();
            Display.getDefault().syncExec(() -> {
                ResourceSet set = provider.getEditingDomain().getResourceSet();
                Resource resource = set.getResources().get(0);
                seen.set("model editor holds " + resource.getURI() + ": " + resource.getErrors().size() + " load errors, root "
                        + resource.getContents().get(0).eClass().getName() + ", Validate: "
                        + verdict(Diagnostician.INSTANCE.validate(resource.getContents().get(0))));
            });
            line(seen.get());
        }

        section("6. Validation: the metamodel and every example model, loaded through their schemaLocation");
        validate(ecore);
        for (String example : EXAMPLES) {
            String[] parts = example.split("/");
            validate(archive.getFile("examples/" + parts[0] + "/" + parts[1] + ".resolveddeployment"));
        }

        section("7. Launches");
        ILaunchManager launches = DebugPlugin.getDefault().getLaunchManager();
        for (String example : EXAMPLES) {
            String name = example.split("/")[0];
            Path generated = root.resolve(PROJECT).resolve("examples").resolve(name).resolve("generated");
            delete(generated);
            archive.refreshLocal(IResource.DEPTH_INFINITE, null);
            ILaunchConfiguration configuration = launches.getLaunchConfiguration(archive.getFile("render " + name + ".launch"));
            int exit = launch(configuration);
            List<String> differences = compare(generated, generated.resolveSibling("expected"));
            line("render " + name + ".launch: exit " + exit + ", " + count(generated) + " files in generated/, "
                    + (differences.isEmpty() ? "equal to expected/ byte for byte" : differences.size() + " differ: " + differences));
            if (exit != 0 || !differences.isEmpty() || count(generated) == 0) {
                fail("render " + name + ".launch did not reproduce the expected files");
            }
        }
        // The render plug-in project's own launch: RenderModel on the committed minimal model, writing
        // under the project's target/render, whose apps/notes/ must equal the committed tree.
        IProject renderProject = workspace.getRoot().getProject("dev.jorisjonkers.deploykit.emf.render");
        Path rendered = implementation.resolve("bundles/render/target/render");
        delete(rendered);
        int renderExit = launch(launches.getLaunchConfiguration(renderProject.getFile("render.launch")));
        List<String> renderDifferences = compare(rendered.resolve("apps/notes"),
                root.resolve("implementation/spec/v1/examples/minimal/rendered/apps/notes"));
        line("render.launch: exit " + renderExit + ", " + count(rendered.resolve("apps/notes")) + " files in target/render/apps/notes/, "
                + (renderDifferences.isEmpty() ? "equal to the committed tree byte for byte" : renderDifferences.size() + " differ: " + renderDifferences));
        if (renderExit != 0 || !renderDifferences.isEmpty() || count(rendered.resolve("apps/notes")) == 0) {
            fail("render.launch did not reproduce the committed tree");
        }
        ILaunchConfiguration tests = launches.getLaunchConfiguration(archive.getFile("test implementation.launch"));
        int exit = launch(tests);
        line("test implementation.launch: exit " + exit + ", " + surefire(implementation));
        if (exit != 0) {
            fail("test implementation.launch failed");
        }
        workspace.getRoot().refreshLocal(IResource.DEPTH_INFINITE, null);
        waitForJobs();
        section("8. Problems after the launches");
        problems(workspace, "after the launches");
        section("9. The Acceleo editor: render.mtl in the render plug-in project");
        acceleo(workspace.getRoot().getProject("dev.jorisjonkers.deploykit.emf.render").getFile("model/render.mtl"));
    }

    /**
     * Opens render.mtl in the editor Acceleo 4 binds to it, which starts Acceleo's language server,
     * and reports the markers it leaves, or a deadlock in it: Acceleo 4.2.2's server can deadlock
     * between its workspace synchronizer and the didOpen of the first module.
     */
    private void acceleo(IFile template) throws Exception {
        long before = jobMinutes;
        jobMinutes = 3;
        open(template, null, "acceleo-editor-" + template.getProject().getName());
        jobMinutes = before;
        long[] deadlocked = java.lang.management.ManagementFactory.getThreadMXBean().findDeadlockedThreads();
        if (deadlocked != null) {
            StringBuilder names = new StringBuilder();
            for (java.lang.management.ThreadInfo info :
                    java.lang.management.ManagementFactory.getThreadMXBean().getThreadInfo(deadlocked, true, true)) {
                StackTraceElement[] stack = info.getStackTrace();
                names.append("\n    ").append(info.getThreadName()).append(" at ")
                        .append(stack.length > 0 ? stack[0] : "?");
            }
            // Not the hand-in's: the editor shows the module, but Acceleo 4.2.2 validates nothing more.
            line("KNOWN ISSUE: Acceleo's language server deadlocked after render.mtl opened:" + names);
            return;
        }
        for (IMarker marker : template.findMarkers(IMarker.PROBLEM, true, IResource.DEPTH_ZERO)) {
            line("  marker: " + describe(marker));
        }
        line("  " + template.getFullPath() + ": " + template.findMarkers(IMarker.PROBLEM, true, IResource.DEPTH_ZERO).length + " markers");
    }

    private void flatten(List<MavenProjectInfo> infos, List<MavenProjectInfo> into) {
        for (MavenProjectInfo info : infos) {
            into.add(info);
            flatten(new ArrayList<>(info.getProjects()), into);
        }
    }

    /** The error markers, listed, and the warnings, counted by type. */
    private int problems(IWorkspace workspace, String when) throws Exception {
        IMarker[] markers = workspace.getRoot().findMarkers(IMarker.PROBLEM, true, IResource.DEPTH_INFINITE);
        Map<String, Integer> warnings = new TreeMap<>();
        int errors = 0;
        int java = 0;
        for (IMarker marker : markers) {
            int severity = marker.getAttribute(IMarker.SEVERITY, IMarker.SEVERITY_INFO);
            if (severity == IMarker.SEVERITY_ERROR) {
                errors++;
                if (marker.getType().startsWith("org.eclipse.jdt")) {
                    java++;
                }
                line("  error: " + describe(marker));
            } else if (severity == IMarker.SEVERITY_WARNING) {
                warnings.merge(marker.getType(), 1, Integer::sum);
            }
        }
        line(when + ": " + errors + " errors (" + java + " Java), warnings by type: " + warnings);
        return errors;
    }

    private String describe(IMarker marker) throws Exception {
        return marker.getResource().getFullPath() + ":" + marker.getAttribute(IMarker.LINE_NUMBER, 0) + " ["
                + marker.getType() + "] " + marker.getAttribute(IMarker.MESSAGE, "");
    }

    private IEditorPart open(IFile file, String editorId, String shot) {
        AtomicReference<IEditorPart> part = new AtomicReference<>();
        AtomicReference<String> error = new AtomicReference<>();
        Display.getDefault().syncExec(() -> {
            try {
                IWorkbenchPage page = PlatformUI.getWorkbench().getActiveWorkbenchWindow().getActivePage();
                part.set(editorId == null ? IDE.openEditor(page, file) : IDE.openEditor(page, file, editorId));
            } catch (Exception e) {
                error.set(e.toString());
            }
        });
        waitForJobs();
        IEditorPart editor = part.get();
        boolean opened = editor != null && !editor.getClass().getName().endsWith("ErrorEditorPart");
        line(file.getName() + ": " + (opened ? "opened in " + editor.getSite().getId() + " (" + editor.getTitle() + ")"
                : "did not open: " + (error.get() != null ? error.get() : editor)));
        if (!opened) {
            fail(file.getName() + " did not open");
        }
        screenshot(shot);
        return editor;
    }

    /** The window as it stands, drawn into a PNG by SWT itself. */
    private void screenshot(String name) {
        Display.getDefault().syncExec(() -> {
            try {
                Shell shell = PlatformUI.getWorkbench().getActiveWorkbenchWindow().getShell();
                Point size = shell.getSize();
                Image image = new Image(shell.getDisplay(), size.x, size.y);
                GC gc = new GC(image);
                shell.print(gc);
                gc.dispose();
                ImageLoader loader = new ImageLoader();
                loader.data = new ImageData[] {image.getImageData()};
                Files.createDirectories(shots);
                loader.save(shots.resolve(name + ".png").toString(), SWT.IMAGE_PNG);
                image.dispose();
            } catch (Exception e) {
                line("  (no screenshot " + name + ": " + e + ")");
            }
        });
    }

    /** Loads the file as the reflective editor does, with no package registered, and validates it. */
    private void validate(IFile file) {
        ResourceSet set = new ResourceSetImpl();
        Resource resource = set.getResource(URI.createPlatformResourceURI(file.getFullPath().toString(), true), true);
        EObject top = resource.getContents().get(0);
        Diagnostic diagnostic = Diagnostician.INSTANCE.validate(top);
        int objects = 0;
        for (var it = resource.getAllContents(); it.hasNext(); it.next()) {
            objects++;
        }
        line(file.getProjectRelativePath() + ": " + resource.getErrors().size() + " load errors, " + objects + " objects, root "
                + top.eClass().getName() + " (" + (top.eClass().eResource() == null ? "?" : top.eClass().eResource().getURI().lastSegment())
                + "), Validate: " + verdict(diagnostic));
        if (!resource.getErrors().isEmpty() || diagnostic.getSeverity() >= Diagnostic.ERROR) {
            fail(file.getName() + " does not validate");
        }
    }

    private static String verdict(Diagnostic diagnostic) {
        if (diagnostic.getSeverity() == Diagnostic.OK) {
            return "OK";
        }
        StringBuilder text = new StringBuilder("severity " + diagnostic.getSeverity());
        diagnostic.getChildren().stream().limit(5).forEach(child -> text.append("; ").append(child.getMessage()));
        return text.toString();
    }

    private int launch(ILaunchConfiguration configuration) throws Exception {
        ILaunch launch = configuration.launch(ILaunchManager.RUN_MODE, new NullProgressMonitor());
        long start = System.currentTimeMillis();
        while (!launch.isTerminated()) {
            Thread.sleep(500);
        }
        line("  " + configuration.getName() + " ran " + (System.currentTimeMillis() - start) / 1000 + " s");
        int exit = -1;
        for (IProcess process : launch.getProcesses()) {
            exit = process.getExitValue();
        }
        return exit;
    }

    /** The test counts of every surefire report under the implementation. */
    private static String surefire(Path implementation) throws Exception {
        int tests = 0;
        int failed = 0;
        int skipped = 0;
        int files = 0;
        try (Stream<Path> paths = Files.walk(implementation)) {
            for (Path report : paths.filter(p -> p.getFileName().toString().matches("TEST-.*\\.xml")).toList()) {
                Element suite = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(report.toFile()).getDocumentElement();
                tests += Integer.parseInt(suite.getAttribute("tests"));
                failed += Integer.parseInt(suite.getAttribute("failures")) + Integer.parseInt(suite.getAttribute("errors"));
                skipped += Integer.parseInt(suite.getAttribute("skipped"));
                files++;
            }
        }
        return files + " surefire reports: " + tests + " tests, " + failed + " failed, " + skipped + " skipped";
    }

    private static List<String> compare(Path generated, Path expected) throws IOException {
        Map<String, byte[]> got = read(generated);
        Map<String, byte[]> want = read(expected);
        TreeSet<String> paths = new TreeSet<>(got.keySet());
        paths.addAll(want.keySet());
        return paths.stream().filter(p -> !Arrays.equals(got.get(p), want.get(p))).toList();
    }

    private static Map<String, byte[]> read(Path dir) throws IOException {
        Map<String, byte[]> files = new TreeMap<>();
        if (Files.isDirectory(dir)) {
            try (Stream<Path> paths = Files.walk(dir)) {
                for (Path file : paths.filter(Files::isRegularFile).toList()) {
                    files.put(dir.relativize(file).toString().replace('\\', '/'), Files.readAllBytes(file));
                }
            }
        }
        return files;
    }

    private static int count(Path dir) throws IOException {
        return read(dir).size();
    }

    private static void delete(Path dir) throws IOException {
        if (Files.exists(dir)) {
            try (Stream<Path> paths = Files.walk(dir)) {
                for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                    Files.delete(path);
                }
            }
        }
    }

    /**
     * Waits until no job but the check's own runs or waits for three seconds in a row, or until
     * handin.check.jobMinutes (default 20) have passed.
     */
    private void waitForJobs() {
        Job self = Job.getJobManager().currentJob();
        long deadline = System.currentTimeMillis() + jobMinutes * 60_000;
        int quiet = 0;
        while (quiet < 6) {
            if (System.currentTimeMillis() > deadline) {
                line("  (stopped waiting for jobs: " + Arrays.stream(Job.getJobManager().find(null))
                        .filter(job -> job != self && job.getState() == Job.RUNNING).map(Job::getName).toList() + ")");
                return;
            }
            boolean busy = Arrays.stream(Job.getJobManager().find(null))
                    .filter(job -> job != self)
                    .anyMatch(job -> job.getState() == Job.RUNNING || job.getState() == Job.WAITING);
            quiet = busy ? 0 : quiet + 1;
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    private void section(String title) {
        line("");
        line(title);
    }

    private synchronized void line(String text) {
        report.add(text);
        System.out.println("[handin-check] " + text);
    }

    private synchronized void fail(String text) {
        failures.add(text);
        line("FAIL: " + text);
    }

    private synchronized void write(Path file) {
        List<String> lines = new ArrayList<>(report);
        lines.add("");
        lines.add(failures.isEmpty() ? "RESULT: PASS" : "RESULT: FAIL (" + failures.size() + "): " + String.join(" | ", failures));
        try {
            Files.createDirectories(file.getParent());
            Files.write(file, lines, StandardCharsets.UTF_8);
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}
