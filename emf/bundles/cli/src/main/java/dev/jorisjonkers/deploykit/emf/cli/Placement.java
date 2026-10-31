package dev.jorisjonkers.deploykit.emf.cli;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Application;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedApplication;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentPackage;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedProcess;
import java.util.ArrayList;
import java.util.List;
import org.eclipse.emf.ecore.EObject;

/**
 * The placement refusals of a resolution: a Process no node of the contract can hold, and replicas
 * spread across more nodes than are eligible (spec/v1/20-resolved-deployment.md#layer-2-does-not-assign-a-node).
 * The invariants are Complete OCL over the Resolved Deployment ({@code resolved-deployment.ocl}), which
 * holds the eligible nodes; this class writes each where the production implementation does, in the
 * project file that declares the Process, because the resolution knows no file.
 */
final class Placement {

    /** The Complete OCL file the Resolved Deployment's metamodel carries, beside its classes. */
    private static final String CONSTRAINTS = "resolved-deployment.ocl";

    private Placement() {}

    /** The refusals of {@code deployment}, written into the authored projects of {@code intent}. */
    static List<Diagnostic> check(ResolvedDeployment deployment, List<EObject> intent) {
        List<Diagnostic> refusals = new ArrayList<>();
        for (Constraints.Violation violation :
                Constraints.violations(deployment, Constraints.beside(ResolvedDeploymentPackage.class, CONSTRAINTS))) {
            ResolvedProcess process = (ResolvedProcess) violation.object();
            ResolvedApplication resolved = (ResolvedApplication) process.eContainer();
            // Every Project the resolution reads is among the intent, authored beside its lowering.
            Project project = intent.stream()
                    .filter(Project.class::isInstance)
                    .map(Project.class::cast)
                    .filter(candidate -> candidate.getProject().equals(resolved.getProject()))
                    .findFirst()
                    .orElseThrow();
            Application application = project.getApplications().stream()
                    .filter(candidate -> candidate.getId().equals(resolved.getId()))
                    .findFirst()
                    .orElseThrow();
            int a = project.getApplications().indexOf(application);
            int p = application.getProcesses().stream()
                    .map(dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Process::getName)
                    .toList()
                    .indexOf(process.getName());
            refusals.add(new Diagnostic(
                    violation.code(),
                    project.eResource().getURI().lastSegment(),
                    "/applications/" + a + "/processes/" + p + "/" + violation.feature(),
                    message(process, violation.feature())));
        }
        return refusals;
    }

    private static String message(ResolvedProcess process, String feature) {
        return feature.equals("replicas")
                ? process.getName() + " keeps " + process.getReplicas() + " replicas on different nodes, and "
                        + process.getPlacement().getEligibleNodes().size() + " can hold it"
                : "no node in the node contract can hold " + process.getName();
    }
}
