package dev.jorisjonkers.deploykit.emf.resolve;

import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentPackage;
import java.util.ArrayList;
import java.util.List;
import org.eclipse.emf.common.util.Diagnostic;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EcorePackage;
import org.eclipse.m2m.qvt.oml.BasicModelExtent;
import org.eclipse.m2m.qvt.oml.ExecutionContextImpl;
import org.eclipse.m2m.qvt.oml.ExecutionDiagnostic;
import org.eclipse.m2m.qvt.oml.TransformationExecutor;

/**
 * The estate-wide pass, {@code estate.qvto}, run over the Resolved Deployments of every project
 * rendered together: it plans what no one project's resolution can derive, the Vault policy job,
 * which is handed every project's documents and named by their digest
 * (spec/v1/30-deliverables.md#vault-configuration-is-rendered-not-applied).
 */
public final class Estate {

    private static final String TRANSFORMATION = "/estate.qvto";

    private Estate() {}

    /** Plans the estate-wide Deliverables into the first of {@code deployments}, in place. */
    public static void plan(List<ResolvedDeployment> deployments) {
        ResolvedDeploymentPackage.eINSTANCE.getName();
        TransformationExecutor.BlackboxRegistry.INSTANCE.registerModule(
                Hashing.class, Hashing.UNIT, Hashing.class.getSimpleName(), new String[] {
                    EcorePackage.eNS_URI, ResolvedDeploymentPackage.eNS_URI
                });
        ExecutionDiagnostic run = new TransformationExecutor(
                        URI.createURI(Estate.class.getResource(TRANSFORMATION).toString()))
                .execute(new ExecutionContextImpl(), new BasicModelExtent(new ArrayList<>(deployments)));
        if (run.getSeverity() != Diagnostic.OK) {
            throw new IllegalStateException("the estate-wide pass did not run: " + run);
        }
    }
}
