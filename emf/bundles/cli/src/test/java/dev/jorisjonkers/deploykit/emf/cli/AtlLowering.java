package dev.jorisjonkers.deploykit.emf.cli;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.EffectiveProject;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.resource.impl.ResourceSetImpl;
import org.eclipse.emf.ecore.xmi.impl.XMIResourceImpl;
import org.eclipse.m2m.atl.emftvm.EmftvmFactory;
import org.eclipse.m2m.atl.emftvm.ExecEnv;
import org.eclipse.m2m.atl.emftvm.Metamodel;
import org.eclipse.m2m.atl.emftvm.Model;
import org.eclipse.m2m.atl.emftvm.Module;
import org.eclipse.m2m.atl.emftvm.compiler.AtlToEmftvmCompiler;
import org.eclipse.m2m.atl.emftvm.impl.resource.EMFTVMResourceFactoryImpl;
import org.eclipse.m2m.atl.emftvm.util.ExecEnvPool;
import org.eclipse.m2m.atl.emftvm.util.ModuleNotFoundException;
import org.eclipse.m2m.atl.emftvm.util.TimingData;

/**
 * The lowering's ATL port, {@code benchmark/lower.atl}, run headless on EMFTVM: the benchmark's
 * second lowering, which no bundle ships (docs/benchmarks.md). {@link #prepared()} compiles the
 * source once and reuses the module, as {@link QvtoLowering} does the QVTo; {@link #once} compiles it
 * for one call, as {@link dev.jorisjonkers.deploykit.emf.resolve.Lowering} parses its QVTo on every
 * call.
 */
final class AtlLowering {

    /** The module's name, which is also the ATL file's. */
    static final String MODULE = "lower";

    private static final String SOURCE = "/benchmark/" + MODULE + ".atl";

    private final ExecEnvPool pool = new ExecEnvPool();

    private AtlLowering() {
        Metamodel intent = EmftvmFactory.eINSTANCE.createMetamodel();
        intent.setResource(ProjectIntentPackage.eINSTANCE.eResource());
        pool.registerMetaModel("PI", intent);
        pool.setModuleResolverFactory(() -> AtlLowering::resolve);
        pool.loadModule(MODULE);
        // The pool compiles and loads the module for the first environment it hands out.
        pool.returnExecEnv(pool.getExecEnv());
    }

    /** A lowering whose module is compiled and loaded once, here, and reused by every run after. */
    static AtlLowering prepared() {
        return new AtlLowering();
    }

    /** {@code project} lowered by a module compiled for this call alone: the shipped lowering's shape. */
    static EffectiveProject once(Project project) {
        return prepared().lower(project);
    }

    /** The one module this lowering loads, compiled; any other name is not one it has. */
    private static Module resolve(String name) throws ModuleNotFoundException {
        if (!MODULE.equals(name)) {
            throw new ModuleNotFoundException("no module " + name);
        }
        return compile();
    }

    /**
     * The ATL source compiled to an EMFTVM module: the ATL parser and the ATL-to-EMFTVM compiler write
     * its bytecode, which is then loaded as a module. A problem the compiler reports as an error fails
     * the compilation with every problem it reported.
     */
    static Module compile() {
        ByteArrayOutputStream bytecode = new ByteArrayOutputStream();
        List<String> errors = new ArrayList<>();
        try (InputStream source = AtlLowering.class.getResourceAsStream(SOURCE)) {
            for (EObject problem : new AtlToEmftvmCompiler().compileWithProblemModel(source, bytecode)) {
                String severity = String.valueOf(problem.eGet(problem.eClass().getEStructuralFeature("severity")));
                if ("error".equals(severity)) {
                    errors.add(problem.eGet(problem.eClass().getEStructuralFeature("location")) + " "
                            + problem.eGet(problem.eClass().getEStructuralFeature("description")));
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        if (!errors.isEmpty()) {
            throw new IllegalStateException(SOURCE + " does not compile: " + errors);
        }
        Resource module = new EMFTVMResourceFactoryImpl().createResource(URI.createURI(MODULE + ".emftvm"));
        new ResourceSetImpl().getResources().add(module);
        try {
            module.load(new ByteArrayInputStream(bytecode.toByteArray()), Map.of());
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return (Module) module.getContents().get(0);
    }

    /** {@code project}, lowered; the source is left as it was. */
    EffectiveProject lower(Project project) {
        Resource input = project.eResource();
        if (input == null || !input.getContents().equals(List.of(project))) {
            // A matched rule lowers every Project its input model holds, so the model holds one.
            throw new IllegalArgumentException("a Project alone in its resource is lowered, not " + input);
        }
        Model in = EmftvmFactory.eINSTANCE.createModel();
        in.setResource(input);
        Resource effective = new XMIResourceImpl(URI.createURI("lowered.effective"));
        new ResourceSetImpl().getResources().add(effective);
        Model out = EmftvmFactory.eINSTANCE.createModel();
        out.setResource(effective);
        ExecEnv env = pool.getExecEnv();
        try {
            env.registerInputModel("IN", in);
            env.registerOutputModel("OUT", out);
            env.run(new TimingData());
        } finally {
            env.clearModels();
            pool.returnExecEnv(env);
        }
        List<EObject> roots = List.copyOf(effective.getContents());
        if (roots.size() != 1 || !(roots.get(0) instanceof EffectiveProject lowered)) {
            // Every object a rule creates is contained by the one it belongs to, or it is left a root.
            throw new IllegalStateException(project.getProject() + " lowered to " + roots);
        }
        return lowered;
    }
}
