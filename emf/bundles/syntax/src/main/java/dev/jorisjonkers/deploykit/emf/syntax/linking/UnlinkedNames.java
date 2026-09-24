package dev.jorisjonkers.deploykit.emf.syntax.linking;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.xtext.diagnostics.DiagnosticMessage;
import org.eclipse.xtext.diagnostics.Severity;
import org.eclipse.xtext.linking.impl.LinkingDiagnosticMessageProvider;

/**
 * A name that links to nothing, as the code the specification gives it: `E_UNKNOWN_PROCESS` for a
 * Process, `E_UNKNOWN_SURFACE` for a surface, `E_UNKNOWN_TIER_PROXY` for a tier's proxy Application,
 * `E_UNKNOWN_MACHINERY` for an Application the delivery machinery names. A surface whose Process did not link is not reported
 * as well: there is no Process to look it up in, and the Process's own refusal already says so.
 */
public class UnlinkedNames extends LinkingDiagnosticMessageProvider {

    public static final String UNKNOWN_PROCESS = "E_UNKNOWN_PROCESS";
    public static final String UNKNOWN_SURFACE = "E_UNKNOWN_SURFACE";
    public static final String UNKNOWN_TIER_PROXY = "E_UNKNOWN_TIER_PROXY";
    public static final String UNKNOWN_MACHINERY = "E_UNKNOWN_MACHINERY";

    /** The codes of names that link into another document, reported only when the documents are read together. */
    public static final java.util.Set<String> ACROSS_DOCUMENTS =
            java.util.Set.of(UNKNOWN_TIER_PROXY, UNKNOWN_MACHINERY);

    @Override
    public DiagnosticMessage getUnresolvedProxyMessage(ILinkingDiagnosticContext context) {
        String name = context.getLinkText();
        if (context.getReference() == ProjectIntentPackage.Literals.DELIVERY_POLICY__MACHINERY) {
            return new DiagnosticMessage(
                    "no project file declares the Application " + name + " the delivery machinery names",
                    Severity.ERROR,
                    UNKNOWN_MACHINERY);
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
