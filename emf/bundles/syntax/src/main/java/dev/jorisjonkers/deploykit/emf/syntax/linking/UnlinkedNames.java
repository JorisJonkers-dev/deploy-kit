package dev.jorisjonkers.deploykit.emf.syntax.linking;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EReference;
import org.eclipse.xtext.diagnostics.DiagnosticMessage;
import org.eclipse.xtext.diagnostics.Severity;
import org.eclipse.xtext.linking.impl.LinkingDiagnosticMessageProvider;
import org.eclipse.xtext.nodemodel.util.NodeModelUtils;

/**
 * A name that links to nothing, as the code the specification gives it: `E_UNKNOWN_PROCESS` for a
 * Process, `E_UNKNOWN_SURFACE` for a surface, `E_UNKNOWN_TIER_PROXY` for a tier's proxy Application,
 * `E_UNKNOWN_MACHINERY` for an Application the delivery machinery names, `E_UNKNOWN_API_HOLDER` for one
 * the platform admits to hold Kubernetes API access, `E_UNKNOWN_TELEMETRY_COLLECTOR` for
 * the Application the telemetry block names, `E_UNKNOWN_SECRET_STORE` for the Application the Secret
 * Store names. A surface whose Process did not link is not reported
 * as well: there is no Process to look it up in, and the Process's own refusal already says so.
 */
public class UnlinkedNames extends LinkingDiagnosticMessageProvider {

    public static final String UNKNOWN_PROCESS = "E_UNKNOWN_PROCESS";
    public static final String UNKNOWN_SURFACE = "E_UNKNOWN_SURFACE";
    public static final String UNKNOWN_TIER_PROXY = "E_UNKNOWN_TIER_PROXY";
    public static final String UNKNOWN_MACHINERY = "E_UNKNOWN_MACHINERY";
    public static final String UNKNOWN_API_HOLDER = "E_UNKNOWN_API_HOLDER";
    public static final String UNKNOWN_TELEMETRY_COLLECTOR = "E_UNKNOWN_TELEMETRY_COLLECTOR";
    public static final String UNKNOWN_METRICS_STACK = "E_UNKNOWN_METRICS_STACK";
    public static final String UNKNOWN_RELEASE_GATE = "E_UNKNOWN_RELEASE_GATE";
    public static final String UNKNOWN_REPORTER = "E_UNKNOWN_REPORTER";
    public static final String UNKNOWN_SECRET_STORE = "E_UNKNOWN_SECRET_STORE";
    public static final String UNKNOWN_FORWARD_AUTH_PROVIDER = "E_UNKNOWN_FORWARD_AUTH_PROVIDER";
    public static final String UNKNOWN_SIGN_IN_PROVIDER = "E_UNKNOWN_SIGN_IN_PROVIDER";
    public static final String UNKNOWN_MONITORING_APPLICATION = "E_UNKNOWN_MONITORING_APPLICATION";
    public static final String UNKNOWN_CRITICAL_APPLICATION = "E_UNKNOWN_CRITICAL_APPLICATION";

    /** The codes of names that link into another document, reported only when the documents are read together. */
    public static final Set<String> ACROSS_DOCUMENTS = Set.of(
            UNKNOWN_TIER_PROXY,
            UNKNOWN_MACHINERY,
            UNKNOWN_API_HOLDER,
            UNKNOWN_TELEMETRY_COLLECTOR,
            UNKNOWN_METRICS_STACK,
            UNKNOWN_RELEASE_GATE,
            UNKNOWN_REPORTER,
            UNKNOWN_SECRET_STORE,
            UNKNOWN_FORWARD_AUTH_PROVIDER,
            UNKNOWN_SIGN_IN_PROVIDER,
            UNKNOWN_MONITORING_APPLICATION,
            UNKNOWN_CRITICAL_APPLICATION);

    @Override
    public DiagnosticMessage getUnresolvedProxyMessage(ILinkingDiagnosticContext context) {
        String name = context.getLinkText();
        EReference reference = context.getReference();
        if (reference == ProjectIntentPackage.Literals.SIGN_IN__PROVIDER) {
            return new DiagnosticMessage(
                    "no project file declares the sign-in provider " + name, Severity.ERROR, UNKNOWN_SIGN_IN_PROVIDER);
        }
        // A name under a Project the set does not compose is one only a set that holds it can judge
        // (spec/v1/14-platform-intent.md#privileged-roles), so it is not refused here.
        if (COMPOSED_ONLY.containsKey(reference)) {
            return composes(context.getContext(), name)
                    ? new DiagnosticMessage(
                            "no project file declares the Application " + name + COMPOSED_ONLY.get(reference),
                            Severity.ERROR,
                            CODES.get(reference),
                            suffix(context.getContext(), reference, name))
                    : null;
        }
        if (context.getReference() == ProjectIntentPackage.Literals.DELIVERY_POLICY__MACHINERY) {
            return new DiagnosticMessage(
                    "no project file declares the Application " + name + " the delivery machinery names",
                    Severity.ERROR,
                    UNKNOWN_MACHINERY);
        }
        if (context.getReference() == ProjectIntentPackage.Literals.API_ACCESS_POLICY__HOLDERS
                || context.getReference() == ProjectIntentPackage.Literals.API_ACCESS_POLICY__NAMESPACE_HOLDERS) {
            return new DiagnosticMessage(
                    "no project file declares the Application " + name
                            + " the platform admits to hold Kubernetes API access",
                    Severity.ERROR,
                    UNKNOWN_API_HOLDER);
        }
        if (context.getReference() == ProjectIntentPackage.Literals.TELEMETRY_POLICY__COLLECTOR) {
            return new DiagnosticMessage(
                    "no project file declares an Application " + name + " whose Process provides an `otlp` surface",
                    Severity.ERROR,
                    UNKNOWN_TELEMETRY_COLLECTOR);
        }
        if (context.getReference() == ProjectIntentPackage.Literals.TELEMETRY_POLICY__METRICS) {
            return new DiagnosticMessage(
                    "no project file declares the Application " + name + " the metrics stack names",
                    Severity.ERROR,
                    UNKNOWN_METRICS_STACK);
        }
        if (context.getReference() == ProjectIntentPackage.Literals.DELIVERY_POLICY__GATE) {
            return new DiagnosticMessage(
                    "no project file declares an Application " + name + " whose Process provides an `http` surface",
                    Severity.ERROR,
                    UNKNOWN_RELEASE_GATE);
        }
        if (context.getReference() == ProjectIntentPackage.Literals.DELIVERY_POLICY__REPORTER) {
            return new DiagnosticMessage(
                    "the project file that declares the Release Gate declares no Application " + name
                            + " whose Process provides an `http` surface",
                    Severity.ERROR,
                    UNKNOWN_REPORTER);
        }
        if (context.getReference() == ProjectIntentPackage.Literals.PLATFORM__SECRET_STORE) {
            return new DiagnosticMessage(
                    "no project file declares an Application " + name + " whose Process provides an `http` surface",
                    Severity.ERROR,
                    UNKNOWN_SECRET_STORE);
        }
        if (context.getReference().getEReferenceType() == ProjectIntentPackage.Literals.APPLICATION) {
            return new DiagnosticMessage(
                    "no project file declares the Application " + name, Severity.ERROR, UNKNOWN_TIER_PROXY);
        }
        if (context.getReference().getEReferenceType() == ProjectIntentPackage.Literals.PROCESS) {
            return new DiagnosticMessage(
                    "no Process of this Application is named " + name, Severity.ERROR, UNKNOWN_PROCESS);
        }
        EObject owner = context.getContext();
        EObject process = (EObject) owner.eGet(owner.eClass().getEStructuralFeature("process"));
        if (process.eIsProxy()) {
            return null;
        }
        return new DiagnosticMessage("the Process provides no surface named " + name, Severity.ERROR, UNKNOWN_SURFACE);
    }

    /** The references a set judges only where it composes the named Project, each by what the name stands for. */
    private static final Map<EReference, String> COMPOSED_ONLY = Map.of(
            ProjectIntentPackage.Literals.FORWARD_AUTH__PROVIDER, " that answers the forward-auth surface",
            ProjectIntentPackage.Literals.MONITORING__GRAFANA, " the monitoring stack's grafana names",
            ProjectIntentPackage.Literals.MONITORING__PROMETHEUS, " the monitoring stack's prometheus names",
            ProjectIntentPackage.Literals.MONITORING__ALERTMANAGER, " the monitoring stack's alertmanager names",
            ProjectIntentPackage.Literals.MONITORING_STORES__LOKI, " the monitoring stack's stores/loki names",
            ProjectIntentPackage.Literals.MONITORING_STORES__TEMPO, " the monitoring stack's stores/tempo names",
            ProjectIntentPackage.Literals.MONITORING_STORES__PYROSCOPE,
                    " the monitoring stack's stores/pyroscope names",
            ProjectIntentPackage.Literals.PRIORITY_POLICY__CRITICAL_APPLICATIONS, " the platform names critical");

    private static final Map<EReference, String> CODES = Map.of(
            ProjectIntentPackage.Literals.FORWARD_AUTH__PROVIDER, UNKNOWN_FORWARD_AUTH_PROVIDER,
            ProjectIntentPackage.Literals.MONITORING__GRAFANA, UNKNOWN_MONITORING_APPLICATION,
            ProjectIntentPackage.Literals.MONITORING__PROMETHEUS, UNKNOWN_MONITORING_APPLICATION,
            ProjectIntentPackage.Literals.MONITORING__ALERTMANAGER, UNKNOWN_MONITORING_APPLICATION,
            ProjectIntentPackage.Literals.MONITORING_STORES__LOKI, UNKNOWN_MONITORING_APPLICATION,
            ProjectIntentPackage.Literals.MONITORING_STORES__TEMPO, UNKNOWN_MONITORING_APPLICATION,
            ProjectIntentPackage.Literals.MONITORING_STORES__PYROSCOPE, UNKNOWN_MONITORING_APPLICATION,
            ProjectIntentPackage.Literals.PRIORITY_POLICY__CRITICAL_APPLICATIONS, UNKNOWN_CRITICAL_APPLICATION);

    /** Whether a project file of the set declares the Project {@code name} is written under. */
    private static boolean composes(EObject owner, String name) {
        String project = name.substring(0, Math.max(name.indexOf('/'), 0));
        return owner.eResource().getResourceSet().getResources().stream()
                .flatMap(resource -> resource.getContents().stream())
                .anyMatch(root -> root instanceof Project declared && project.equals(declared.getProject()));
    }

    /**
     * Where below its owner the name sits, as the diagnostic's path writes it: nothing where the owner
     * is the name's own block, the key of a role, and the key and position of a list's entry.
     */
    private static String suffix(EObject owner, EReference reference, String name) {
        if (reference == ProjectIntentPackage.Literals.FORWARD_AUTH__PROVIDER) {
            return "";
        }
        if (!reference.isMany()) {
            return "/" + reference.getName();
        }
        List<String> written = NodeModelUtils.findNodesForFeature(owner, reference).stream()
                .map(NodeModelUtils::getTokenText)
                .toList();
        // A name written in quotes is not written as its text: such a name is placed last.
        int found = written.indexOf(name);
        return "/" + reference.getName() + "/" + (found < 0 ? written.size() - 1 : found);
    }
}
