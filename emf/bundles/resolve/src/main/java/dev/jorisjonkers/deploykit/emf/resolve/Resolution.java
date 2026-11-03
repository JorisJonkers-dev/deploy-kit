package dev.jorisjonkers.deploykit.emf.resolve;

import dev.jorisjonkers.deploykit.emf.metamodel.pinnedinputs.PinnedInputsPackage;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentPackage;
import java.util.ArrayList;
import java.util.List;
import org.eclipse.emf.common.util.Diagnostic;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EcorePackage;
import org.eclipse.m2m.qvt.oml.BasicModelExtent;
import org.eclipse.m2m.qvt.oml.ExecutionContextImpl;
import org.eclipse.m2m.qvt.oml.ExecutionDiagnostic;
import org.eclipse.m2m.qvt.oml.TransformationExecutor;

/**
 * The resolution, {@code resolution.qvto}, run on one project of a lowered union: the Effective Intent
 * of every project and the Platform document in, the pinned inputs beside them, and that project's
 * Resolved Deployment out (spec/v1/20-resolved-deployment.md). The transformation is carried beside
 * this class, as the lowering's is.
 */
public final class Resolution {

    private static final String TRANSFORMATION = "/resolution.qvto";

    private Resolution() {}

    /**
     * The loaded transformation, made on first use, with the blackbox it imports registered first. A
     * load stays reachable for the life of the JVM, so one load serves every call
     * (emf/docs/benchmarks.md). Each call still gets an execution context and model extents of its
     * own, and calls are sequential.
     */
    private static final class Loaded {
        static final TransformationExecutor EXECUTOR = load();

        private static TransformationExecutor load() {
            ProjectIntentPackage.eINSTANCE.getName();
            PinnedInputsPackage.eINSTANCE.getName();
            ResolvedDeploymentPackage.eINSTANCE.getName();
            TransformationExecutor.BlackboxRegistry.INSTANCE.registerModule(
                    Hashing.class,
                    // `resolve` is a keyword of the language, so the unit is not named for this package.
                    Hashing.UNIT,
                    Hashing.class.getSimpleName(),
                    new String[] {EcorePackage.eNS_URI, ResolvedDeploymentPackage.eNS_URI});
            return new TransformationExecutor(
                    URI.createURI(Resolution.class.getResource(TRANSFORMATION).toString()));
        }
    }

    /**
     * {@code project} of {@code intent}, resolved against {@code pinned}, recording {@code
     * schemaPackageIntegrity} in its provenance. A run the transformation stops is a derivation this
     * implementation does not reach yet, and it fails with what the transformation said.
     */
    public static ResolvedDeployment resolve(
            List<EObject> intent, List<EObject> pinned, String project, String schemaPackageIntegrity) {
        ExecutionContextImpl context = new ExecutionContextImpl();
        context.setConfigProperty("project", project);
        context.setConfigProperty("integrity", schemaPackageIntegrity);
        BasicModelExtent target = new BasicModelExtent();
        ExecutionDiagnostic run = Loaded.EXECUTOR.execute(
                context,
                // An extent asks its list whether it holds a null, which an immutable list refuses to answer.
                new BasicModelExtent(new ArrayList<>(intent)),
                new BasicModelExtent(new ArrayList<>(pinned)),
                target);
        if (run.getSeverity() != Diagnostic.OK || target.getContents().isEmpty()) {
            throw new IllegalStateException(failure(project, run));
        }
        return (ResolvedDeployment) target.getContents().get(0);
    }

    /** Why {@code project} did not resolve: the run, then each of its children on a line of its own. */
    static String failure(String project, Diagnostic run) {
        // A transformation that does not compile says why only in its children.
        StringBuilder why = new StringBuilder(project + " did not resolve: " + run);
        run.getChildren().forEach(child -> why.append("\n  ").append(child.getMessage()));
        return why.toString();
    }
}
