package dev.jorisjonkers.deploykit.emf.syntax.linking;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Application;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
import java.util.List;
import java.util.Map;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EReference;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.xtext.EcoreUtil2;
import org.eclipse.xtext.naming.QualifiedName;
import org.eclipse.xtext.scoping.IScope;
import org.eclipse.xtext.scoping.IScopeProvider;
import org.eclipse.xtext.scoping.Scopes;

/**
 * What a route's or a scrape's names can link to (spec/v1/10-project-intent.md#what-is-checked): a
 * Process of the Application that holds it, and a surface that Process provides. Nothing outside the
 * Application is in scope; a dependency edge's names reach other documents and are not linked here.
 *
 * <p>A tier's proxy, a name of the delivery machinery and the telemetry collector reach another
 * document: every Application a project file read in the same set declares
 * (spec/v1/14-platform-intent.md#the-model). The collector's scope holds only the Applications whose
 * Process provides an {@code otlp} surface, so one that receives nothing is a name that links to
 * nothing, and is refused as one (spec/v1/14-platform-intent.md#telemetry). The Release Gate's scope
 * holds the Applications that provide {@code http}, which is where every Canary asks it, and the
 * Secret Store's the same, which is where every grant is read from
 * (spec/v1/14-platform-intent.md#the-secret-store).
 */
public class ProjectIntentScopes implements IScopeProvider {

    @Override
    public IScope getScope(EObject context, EReference reference) {
        if (reference == ProjectIntentPackage.Literals.TELEMETRY_POLICY__COLLECTOR) {
            return providing(context, OTLP);
        }
        if (reference == ProjectIntentPackage.Literals.DELIVERY_POLICY__GATE
                || reference == ProjectIntentPackage.Literals.PLATFORM__SECRET_STORE) {
            return providing(context, HTTP);
        }
        if (reference.getEReferenceType() == ProjectIntentPackage.Literals.APPLICATION) {
            return Scopes.scopeFor(
                    applications(context.eResource().getResourceSet()),
                    application -> QualifiedName.create(((Application) application).getId()),
                    IScope.NULLSCOPE);
        }
        if (reference.getEReferenceType() == ProjectIntentPackage.Literals.PROCESS) {
            Application application = EcoreUtil2.getContainerOfType(context, Application.class);
            return Scopes.scopeFor(application.getProcesses());
        }
        EObject process = (EObject) context.eGet(context.eClass().getEStructuralFeature("process"));
        if (process.eIsProxy()) {
            return IScope.NULLSCOPE;
        }
        List<?> provides = (List<?>) process.eGet(ProjectIntentPackage.Literals.PROCESS__PROVIDES);
        return Scopes.scopeFor(
                provides.stream().map(EObject.class::cast).toList(),
                surface -> QualifiedName.create(String.valueOf(((Map.Entry<?, ?>) surface).getKey())),
                IScope.NULLSCOPE);
    }

    /** The Applications of the set one of whose Processes provides {@code surface}. */
    private static IScope providing(EObject context, String surface) {
        return Scopes.scopeFor(
                applications(context.eResource().getResourceSet()).stream()
                        .filter(application -> application.getProcesses().stream()
                                .anyMatch(process -> process.getProvides().containsKey(surface)))
                        .toList(),
                application -> QualifiedName.create(((Application) application).getId()),
                IScope.NULLSCOPE);
    }

    /** The surface a telemetry collector receives on. */
    private static final String OTLP = "otlp";

    /** The surface the Release Gate answers every Canary on, and the Secret Store every grant on. */
    private static final String HTTP = "http";

    /** Every Application the project documents of {@code documents} declare, in the order they were read. */
    private static List<Application> applications(ResourceSet documents) {
        return documents.getResources().stream()
                .flatMap(resource -> resource.getContents().stream())
                .filter(Project.class::isInstance)
                .flatMap(project -> ((Project) project).getApplications().stream())
                .toList();
    }
}
