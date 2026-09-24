package dev.jorisjonkers.deploykit.emf.metamodel.revision;

import dev.jorisjonkers.deploykit.emf.metamodel.json.CanonicalJson;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedApplication;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentPackage;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.eclipse.emf.common.util.Enumerator;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EReference;
import org.eclipse.emf.ecore.EStructuralFeature;
import org.eclipse.emf.ecore.util.EcoreUtil;

/**
 * The Application revision (spec/v1/20-resolved-deployment.md#the-application-revision): the
 * digest of one Application's element of the Resolved Deployment, the revision itself excluded. The
 * element is walked reflectively, so a feature added to the {@code .ecore} is covered without a line
 * here: an attribute as its value, an enumeration as its literal, a contained object as an object,
 * and a reference as the identifier of what it points at.
 */
public final class ApplicationRevision {

    private ApplicationRevision() {}

    /** {@code sha256:<hex>} over the canonical JSON of {@code application}. */
    public static String of(ResolvedApplication application) {
        Map<String, Object> element = json(application);
        // The Application's reconcile ordering is a decision about it, and it lives on the unit the
        // element references: the production implementation's element carries it as
        // `reconcileAfter`, so it is covered here under that name.
        List<Object> after = new ArrayList<>();
        for (EObject unit : application.getReconcileUnit().getAfter()) {
            after.add(EcoreUtil.getID(unit));
        }
        element.put("reconcileAfter", after);
        return "sha256:" + HexFormat.of().formatHex(digest("SHA-256", CanonicalJson.write(element)));
    }

    /** {@code text} digested by {@code algorithm}; every Java platform implements SHA-256. */
    static byte[] digest(String algorithm, String text) {
        try {
            return MessageDigest.getInstance(algorithm).digest(text.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException absent) {
            throw new IllegalStateException(absent);
        }
    }

    private static Map<String, Object> json(EObject object) {
        Map<String, Object> json = new LinkedHashMap<>();
        for (EStructuralFeature feature : object.eClass().getEAllStructuralFeatures()) {
            if (feature != ResolvedDeploymentPackage.Literals.RESOLVED_APPLICATION__REVISION
                    && (feature.isRequired() || object.eIsSet(feature))) {
                json.put(feature.getName(), value(object, feature));
            }
        }
        return json;
    }

    private static Object value(EObject owner, EStructuralFeature feature) {
        Object value = owner.eGet(feature);
        if (feature.isMany()) {
            List<Object> items = new ArrayList<>();
            for (Object item : (List<?>) value) {
                items.add(single(feature, item));
            }
            return items;
        }
        return single(feature, value);
    }

    private static Object single(EStructuralFeature feature, Object value) {
        if (feature instanceof EReference reference) {
            EObject target = (EObject) value;
            return reference.isContainment() ? json(target) : EcoreUtil.getID(target);
        }
        if (value instanceof Enumerator literal) {
            return literal.getLiteral();
        }
        return value;
    }
}
