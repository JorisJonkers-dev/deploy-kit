package dev.jorisjonkers.deploykit.emf.syntax.linking;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
import java.util.Set;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.xtext.diagnostics.DiagnosticMessage;
import org.eclipse.xtext.diagnostics.Severity;
import org.eclipse.xtext.linking.impl.LinkingDiagnosticMessageProvider;

/**
 * A name that links to nothing, as the code the specification gives it: `E_UNKNOWN_PROCESS` for a
 * Process, `E_UNKNOWN_SURFACE` for a surface, `E_UNKNOWN_TIER_PROXY` for a tier's proxy Application,
 * `E_UNKNOWN_MACHINERY` for an Application the delivery machinery names, `E_UNKNOWN_TELEMETRY_COLLECTOR` for
 * the Application the telemetry block names, `E_UNKNOWN_SECRET_STORE` for the Application the Secret
 * Store names. A surface whose Process did not link is not reported
 * as well: there is no Process to look it up in, and the Process's own refusal already says so.
 */
public class UnlinkedNames extends LinkingDiagnosticMessageProvider {

    public static final String UNKNOWN_PROCESS = "E_UNKNOWN_PROCESS";
    public static final String UNKNOWN_SURFACE = "E_UNKNOWN_SURFACE";
    public static final String UNKNOWN_TIER_PROXY = "E_UNKNOWN_TIER_PROXY";
    public static final String UNKNOWN_MACHINERY = "E_UNKNOWN_MACHINERY";
    public static final String UNKNOWN_TELEMETRY_COLLECTOR = "E_UNKNOWN_TELEMETRY_COLLECTOR";
    public static final String UNKNOWN_METRICS_STACK = "E_UNKNOWN_METRICS_STACK";
    public static final String UNKNOWN_RELEASE_GATE = "E_UNKNOWN_RELEASE_GATE";
    public static final String UNKNOWN_SECRET_STORE = "E_UNKNOWN_SECRET_STORE";

    /** The codes of names that link into another document, reported only when the documents are read together. */
    public static final Set<String> ACROSS_DOCUMENTS = Set.of(
            UNKNOWN_TIER_PROXY,
            UNKNOWN_MACHINERY,
            UNKNOWN_TELEMETRY_COLLECTOR,
            UNKNOWN_METRICS_STACK,
            UNKNOWN_RELEASE_GATE,
            UNKNOWN_SECRET_STORE);

    @Override
    public DiagnosticMessage getUnresolvedProxyMessage(ILinkingDiagnosticContext context) {
        String name = context.getLinkText();
        if (context.getReference() == ProjectIntentPackage.Literals.DELIVERY_POLICY__MACHINERY) {
            return new DiagnosticMessage(
                    "no project file declares the Application " + name + " the delivery machinery names",
                    Severity.ERROR,
                    UNKNOWN_MACHINERY);
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
}
