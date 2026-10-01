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
     * {@code project} of {@code intent}, resolved against {@code pinned}, recording {@code
     * schemaPackageIntegrity} in its provenance. A run the transformation stops is a derivation this
     * implementation does not reach yet, and it fails with what the transformation said.
     */
    public static ResolvedDeployment resolve(
            List<EObject> intent, List<EObject> pinned, String project, String schemaPackageIntegrity) {
        ProjectIntentPackage.eINSTANCE.getName();
        PinnedInputsPackage.eINSTANCE.getName();
        ResolvedDeploymentPackage.eINSTANCE.getName();
        TransformationExecutor.BlackboxRegistry.INSTANCE.registerModule(
                Hashing.class,
                // `resolve` is a keyword of the language, so the unit is not named for this package.
                Hashing.UNIT,
                Hashing.class.getSimpleName(),
                new String[] {EcorePackage.eNS_URI, ResolvedDeploymentPackage.eNS_URI});
        ExecutionContextImpl context = new ExecutionContextImpl();
        context.setConfigProperty("project", project);
        context.setConfigProperty("integrity", schemaPackageIntegrity);
        BasicModelExtent target = new BasicModelExtent();
        ExecutionDiagnostic run = new TransformationExecutor(URI.createURI(
                        Resolution.class.getResource(TRANSFORMATION).toString()))
                .execute(
                        context,
                        // An extent asks its list whether it holds a null, which an immutable list refuses to answer.
                        new BasicModelExtent(new ArrayList<>(intent)),
                        new BasicModelExtent(new ArrayList<>(pinned)),
                        target);
        if (run.getSeverity() != Diagnostic.OK || target.getContents().isEmpty()) {
            throw new IllegalStateException(project + " did not resolve: " + run);
        }
        return (ResolvedDeployment) target.getContents().get(0);
    }
}
