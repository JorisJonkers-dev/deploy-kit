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
 * <p>A tier's proxy is the one name that reaches another document: every Application a project file
 * read in the same set declares (spec/v1/14-platform-intent.md#the-model).
 */
public class ProjectIntentScopes implements IScopeProvider {

    @Override
    public IScope getScope(EObject context, EReference reference) {
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

    /** Every Application the project documents of {@code documents} declare, in the order they were read. */
    private static List<Application> applications(ResourceSet documents) {
        return documents.getResources().stream()
                .flatMap(resource -> resource.getContents().stream())
                .filter(Project.class::isInstance)
                .flatMap(project -> ((Project) project).getApplications().stream())
                .toList();
    }
}
