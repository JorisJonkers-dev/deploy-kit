package dev.jorisjonkers.deploykit.emf.cli;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.eclipse.emf.common.util.TreeIterator;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.compare.AttributeChange;
import org.eclipse.emf.compare.Comparison;
import org.eclipse.emf.compare.Diff;
import org.eclipse.emf.compare.EMFCompare;
import org.eclipse.emf.compare.Match;
import org.eclipse.emf.compare.ReferenceChange;
import org.eclipse.emf.compare.ResourceAttachmentChange;
import org.eclipse.emf.compare.match.DefaultComparisonFactory;
import org.eclipse.emf.compare.match.DefaultEqualityHelperFactory;
import org.eclipse.emf.compare.match.DefaultMatchEngine;
import org.eclipse.emf.compare.match.IMatchEngine;
import org.eclipse.emf.compare.match.eobject.IdentifierEObjectMatcher;
import org.eclipse.emf.compare.match.impl.MatchEngineFactoryRegistryImpl;
import org.eclipse.emf.compare.scope.DefaultComparisonScope;
import org.eclipse.emf.compare.scope.IComparisonScope;
import org.eclipse.emf.compare.utils.UseIdentifiers;
import org.eclipse.emf.ecore.EAttribute;
import org.eclipse.emf.ecore.EEnum;
import org.eclipse.emf.ecore.EEnumLiteral;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EReference;
import org.eclipse.emf.ecore.EStructuralFeature;
import org.eclipse.emf.ecore.InternalEObject;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.resource.impl.ResourceImpl;
import org.eclipse.emf.ecore.util.EcoreUtil;

/**
 * The tests' one comparison of two models (docs/adr/emf/0152-emf-compare-decides-and-explains-every-model-comparison.md):
 * EMF Compare decides whether they differ and says where, and two models are equal only when it
 * reports no difference. Objects are paired by their natural key, a path from the root naming each
 * list item by a key unique among its siblings, and by similarity only where no key exists. Every
 * difference is one line in {@link dev.jorisjonkers.deploykit.emf.cli.Comparison}'s format: {@code
 * notes.resolveddeployment#1 .applications[id="notes"].processes[name="api"].memory: expected
 * "256Mi", got "512Mi"}.
 *
 * <p>A list item's key is, in this order, the first of
 * {@link #IDENTITIES} unique among its siblings; else one of them together with a qualifier that
 * makes the pair unique, another of them or an enumeration-typed attribute, in declaration order ({@code [input="cluster-state",
 * name="production"]}); else a single-valued reference to an object that is itself keyed ({@code
 * [process=.applications[id="notes"].processes[name="api"]]}). A root is keyed the same way among
 * the roots of its resource, and by its position among them when it has none. Two objects pair by
 * key only when both sides key them alike; the rest, and every item with no key, are paired by
 * similarity, and a line about an item with no key writes it by its index and says it was {@link
 * #SIMILARITY paired by similarity}.
 */
final class ModelDiff {

    /** What a line about an object with no natural key ends with. */
    static final String SIMILARITY = " (no natural key; paired by similarity)";

    /** The attributes a list item is named by, in the order they are tried. */
    static final List<String> IDENTITIES = List.of("name", "id", "path", "alias", "key", "project", "from");

    /** How many references deep a key may follow before it gives up. */
    private static final int DEPTH = 3;

    private static final ObjectMapper JSON = new ObjectMapper();

    private final String name;
    /** The keys EMF Compare pairs objects by: each object's own, where the other side holds the same key. */
    private final Map<EObject, String> keys = new IdentityHashMap<>();

    /** The objects that have a natural key of their own, whether or not the other side shares it. */
    private final Set<EObject> named = Collections.newSetFromMap(new IdentityHashMap<>());

    private final Map<EObject, String> identities = new IdentityHashMap<>();
    private final Set<EObject> unnamed = Collections.newSetFromMap(new IdentityHashMap<>());
    private Comparison comparison;

    private ModelDiff(String name) {
        this.name = name;
    }

    /**
     * Every difference between the models whose roots are {@code expected} and {@code actual},
     * reported under the file {@code name}; none when they are equal. Roots that are not exactly the
     * contents of one resource are compared as copies, so neither model is moved.
     */
    static List<String> differences(String name, List<? extends EObject> expected, List<? extends EObject> actual) {
        return differences(name, resource(expected), resource(actual));
    }

    /** Every difference between the two resources' models, reported under the file {@code name}. */
    static List<String> differences(String name, Resource expected, Resource actual) {
        ModelDiff diff = new ModelDiff(name);
        diff.key(diff.key(expected), diff.key(actual));
        diff.comparison = compare(expected, actual, diff.keys);
        return diff.report();
    }

    private static Resource resource(List<? extends EObject> roots) {
        Resource holder = roots.isEmpty() ? null : roots.get(0).eResource();
        if (holder != null && holder.getContents().equals(roots)) {
            return holder;
        }
        Resource copy = new ResourceImpl(URI.createURI("model"));
        copy.getContents().addAll(EcoreUtil.copyAll(roots));
        return copy;
    }

    /** EMF Compare's two-way comparison: {@code actual} is the left side, {@code expected} the right. */
    private static Comparison compare(Resource expected, Resource actual, Map<EObject, String> keys) {
        IMatchEngine engine = new DefaultMatchEngine(
                new IdentifierEObjectMatcher(
                        DefaultMatchEngine.createDefaultEObjectMatcher(UseIdentifiers.NEVER), keys::get),
                new DefaultComparisonFactory(new DefaultEqualityHelperFactory()));
        IMatchEngine.Factory.Registry registry = MatchEngineFactoryRegistryImpl.createStandaloneInstance();
        registry.add(new IMatchEngine.Factory() {
            @Override
            public IMatchEngine getMatchEngine() {
                return engine;
            }

            @Override
            public int getRanking() {
                return Integer.MAX_VALUE;
            }

            @Override
            public void setRanking(int ranking) {
                throw new UnsupportedOperationException("the one engine ranks first");
            }

            @Override
            public boolean isMatchEngineFactoryFor(IComparisonScope scope) {
                return true;
            }
        });
        return EMFCompare.builder()
                .setMatchEngineFactoryRegistry(registry)
                .build()
                .compare(new DefaultComparisonScope(actual, expected, null));
    }

    // -------------------------------------------------------------------------------------- keys

    /** Every object of {@code resource} by its natural key; a key two objects of it share keys neither. */
    private Map<EObject, String> key(Resource resource) {
        Map<String, EObject> seen = new HashMap<>();
        Set<String> shared = new HashSet<>();
        for (TreeIterator<EObject> objects = resource.getAllContents(); objects.hasNext(); ) {
            EObject object = objects.next();
            String path = path(object, 0, false);
            if (path != null) {
                String key = object.eClass().getName() + path;
                if (seen.put(key, object) != null) {
                    shared.add(key);
                }
            }
        }
        Map<EObject, String> keyed = new IdentityHashMap<>();
        seen.forEach((key, object) -> {
            if (!shared.contains(key)) {
                keyed.put(object, key);
            }
        });
        return keyed;
    }

    /**
     * Pairs by key only what both sides key alike: an object whose key the other side lacks, because
     * it was added, removed or re-keyed, is left to similarity, which pairs it with what it most
     * resembles or reports it added or removed.
     */
    private void key(Map<EObject, String> expected, Map<EObject, String> actual) {
        Set<String> expectedKeys = new HashSet<>(expected.values());
        Set<String> actualKeys = new HashSet<>(actual.values());
        named.addAll(expected.keySet());
        named.addAll(actual.keySet());
        expected.forEach((object, key) -> {
            if (actualKeys.contains(key)) {
                keys.put(object, key);
            }
        });
        actual.forEach((object, key) -> {
            if (expectedKeys.contains(key)) {
                keys.put(object, key);
            }
        });
    }

    /**
     * {@code object}'s path from its root: in a key ({@code byIndex} false) the root's own key first
     * and null when an item on the way has no key, in a report each unkeyed item by its index.
     */
    private String path(EObject object, int depth, boolean byIndex) {
        StringBuilder path = new StringBuilder();
        EObject at = object;
        for (; at.eContainer() != null; at = at.eContainer()) {
            EStructuralFeature feature = at.eContainingFeature();
            String step = "." + feature.getName();
            if (feature.isMany()) {
                String identity = identity(at, (List<?>) at.eContainer().eGet(feature, false), depth);
                if (identity == null && !byIndex) {
                    return null;
                }
                step += identity == null ? "[" + index(at) + "]" : identity;
            }
            path.insert(0, step);
        }
        if (!byIndex) {
            String root = root(at, depth);
            if (root == null) {
                return null;
            }
            path.insert(0, root);
        }
        return path.toString();
    }

    /** A root's key among its resource's roots: its natural key, else its position. */
    private String root(EObject root, int depth) {
        if (root.eResource() == null) {
            return "/";
        }
        List<EObject> roots = root.eResource().getContents();
        String identity = identity(root, roots, depth);
        return "/" + (identity == null ? "#" + (roots.indexOf(root) + 1) : identity);
    }

    /** {@code item}'s key among {@code siblings}, by the rules the class comment states; null when it has none. */
    private String identity(EObject item, List<?> siblings, int depth) {
        if (depth == 0 && identities.containsKey(item)) {
            return identities.get(item);
        }
        if (depth == 0 && unnamed.contains(item)) {
            return null;
        }
        String identity = computeIdentity(item, siblings, depth);
        if (depth == 0) {
            if (identity == null) {
                unnamed.add(item);
            } else {
                identities.put(item, identity);
            }
        }
        return identity;
    }

    private String computeIdentity(EObject item, List<?> siblings, int depth) {
        List<EAttribute> candidates = new ArrayList<>();
        for (String key : IDENTITIES) {
            if (item.eClass().getEStructuralFeature(key) instanceof EAttribute attribute
                    && !attribute.isMany()
                    && item.eIsSet(attribute)) {
                candidates.add(attribute);
            }
        }
        for (EAttribute candidate : candidates) {
            if (unique(siblings, List.of(candidate.getName()))) {
                return "[" + candidate.getName() + "=" + show(item.eGet(candidate)) + "]";
            }
        }
        for (EAttribute candidate : candidates) {
            List<EAttribute> partners = new ArrayList<>(candidates);
            item.eClass().getEAllAttributes().stream()
                    .filter(attribute -> attribute.getEType() instanceof EEnum)
                    .forEach(partners::add);
            for (EAttribute other : partners) {
                if (other != candidate
                        && !other.isMany()
                        && !other.isDerived()
                        && item.eIsSet(other)
                        && unique(siblings, List.of(candidate.getName(), other.getName()))) {
                    List<EAttribute> pair = item.eClass().getEAllAttributes().indexOf(other)
                                    < item.eClass().getEAllAttributes().indexOf(candidate)
                            ? List.of(other, candidate)
                            : List.of(candidate, other);
                    return "[" + pair.get(0).getName() + "=" + show(item.eGet(pair.get(0))) + ","
                            + pair.get(1).getName() + "=" + show(item.eGet(pair.get(1))) + "]";
                }
            }
        }
        if (depth < DEPTH) {
            for (EReference reference : item.eClass().getEAllReferences()) {
                if (reference.isContainment()
                        || reference.isContainer()
                        || reference.isMany()
                        || reference.isDerived()
                        || !item.eIsSet(reference)
                        || !unique(siblings, List.of(reference.getName()))) {
                    continue;
                }
                EObject target = (EObject) item.eGet(reference, false);
                String path = target.eIsProxy() ? null : path(target, depth + 1, false);
                if (path != null) {
                    // A target in a file of one root is written without the root's position.
                    String shown = target.eResource() != null
                                    && target.eResource().getContents().size() == 1
                                    && path.startsWith("/#1")
                            ? path.substring(3)
                            : path.substring(1);
                    return "[" + reference.getName() + "=" + shown + "]";
                }
            }
        }
        return null;
    }

    /**
     * Whether no two of {@code siblings} that set every feature named in {@code features} share one
     * value of them.
     */
    private static boolean unique(List<?> siblings, List<String> features) {
        Set<List<Object>> seen = new HashSet<>();
        for (Object sibling : siblings) {
            EObject other = (EObject) sibling;
            List<Object> values = new ArrayList<>();
            for (String feature : features) {
                EStructuralFeature same = other.eClass().getEStructuralFeature(feature);
                if (same == null || same.isMany() || !other.eIsSet(same)) {
                    break;
                }
                values.add(other.eGet(same, false));
            }
            if (values.size() == features.size() && !seen.add(values)) {
                return false;
            }
        }
        return true;
    }

    // ------------------------------------------------------------------------------------ report

    /** One line a difference, match by match in the tree's order; a feature set on one side only counts too. */
    private List<String> report() {
        List<String> lines = new ArrayList<>();
        List<Match> matches = new ArrayList<>(comparison.getMatches());
        for (int i = 0; i < matches.size(); i++) {
            Match match = matches.get(i);
            matches.addAll(i + 1, match.getSubmatches());
            for (Diff diff : match.getDifferences()) {
                String line = line(diff);
                if (line != null) {
                    lines.add(line);
                }
            }
            lines.addAll(setOnOneSide(match));
        }
        if (lines.isEmpty() && !comparison.getDifferences().isEmpty()) {
            lines.add(name + ": " + comparison.getDifferences().size()
                    + " differences EMF Compare reports, none of them inside a reported one");
        }
        return lines;
    }

    private String line(Diff diff) {
        Match match = diff.getMatch();
        if (!(diff instanceof ResourceAttachmentChange) && (match.getLeft() == null || match.getRight() == null)) {
            // The owner is itself added or removed, and that line says how much it holds.
            return null;
        }
        EObject owner = match.getRight() != null ? match.getRight() : match.getLeft();
        return switch (diff) {
            case ResourceAttachmentChange root -> root(root, owner);
            case ReferenceChange change ->
                change.getReference().isContainment() ? containment(change) : reference(change, owner);
            case AttributeChange change -> attribute(change, owner);
            default ->
                where(owner, "") + ": " + diff.getKind() + " " + diff.eClass().getName() + similarity(owner);
        };
    }

    private String root(ResourceAttachmentChange change, EObject root) {
        Match match = change.getMatch();
        return switch (change.getKind()) {
            case ADD -> where(root, "") + ": extra root (got " + subtree(root) + ")" + similarity(root);
            case DELETE -> where(root, "") + ": missing root (expected " + subtree(root) + ")" + similarity(root);
            default ->
                where(root, "") + ": root moved from index " + index(match.getRight()) + " to " + index(match.getLeft())
                        + similarity(root);
        };
    }

    private String containment(ReferenceChange change) {
        Match valueMatch = comparison.getMatch(change.getValue());
        EObject expected = valueMatch.getRight();
        EObject actual = valueMatch.getLeft();
        return switch (change.getKind()) {
            case ADD -> where(actual, "") + ": extra (got " + subtree(actual) + ")" + similarity(actual);
            case DELETE ->
                where(expected, "") + ": missing (expected " + subtree(expected) + ")" + similarity(expected);
            default -> {
                Match parent = comparison.getMatch(expected.eContainer());
                boolean moved = parent == null
                        || parent.getLeft() != actual.eContainer()
                        || expected.eContainingFeature() != actual.eContainingFeature();
                yield where(expected, "") + ": moved from index " + index(expected) + " to " + index(actual)
                        + (moved ? " under " + target(actual.eContainer()) : "") + similarity(expected);
            }
        };
    }

    private String reference(ReferenceChange change, EObject owner) {
        EReference reference = change.getReference();
        Match match = change.getMatch();
        String at = where(owner, "." + reference.getName()) + ": ";
        if (!reference.isMany()) {
            return at + "expected " + target(value(match.getRight(), reference)) + ", got "
                    + target(value(match.getLeft(), reference)) + similarity(owner);
        }
        EObject value = change.getValue();
        return at
                + switch (change.getKind()) {
                    case ADD -> "extra " + target(value);
                    case DELETE -> "missing " + target(value);
                    default -> {
                        Match moved = comparison.getMatch(value);
                        yield target(value) + " moved from index "
                                + list(match.getRight(), reference).indexOf(moved == null ? value : moved.getRight())
                                + " to " + list(match.getLeft(), reference).indexOf(value);
                    }
                }
                + similarity(owner);
    }

    private String attribute(AttributeChange change, EObject owner) {
        EAttribute attribute = change.getAttribute();
        Match match = change.getMatch();
        String at = where(owner, "." + attribute.getName()) + ": ";
        if (!attribute.isMany()) {
            return at + "expected " + show(value(match.getRight(), attribute)) + ", got "
                    + show(value(match.getLeft(), attribute)) + similarity(owner);
        }
        Object value = change.getValue();
        return at
                + switch (change.getKind()) {
                    case ADD -> "extra " + show(value);
                    case DELETE -> "missing " + show(value);
                    default ->
                        show(value) + " moved from index "
                                + list(match.getRight(), attribute).indexOf(value) + " to "
                                + list(match.getLeft(), attribute).indexOf(value);
                }
                + similarity(owner);
    }

    /**
     * A feature EMF Compare finds no difference in, but which one side sets and the other does not:
     * an unsettable feature unset beside one set to its default, which an XMI file tells apart.
     */
    private List<String> setOnOneSide(Match match) {
        List<String> lines = new ArrayList<>();
        EObject expected = match.getRight();
        EObject actual = match.getLeft();
        if (expected == null || actual == null) {
            return lines;
        }
        Set<EStructuralFeature> reported = new HashSet<>();
        for (Diff diff : match.getDifferences()) {
            if (diff instanceof AttributeChange change) {
                reported.add(change.getAttribute());
            } else if (diff instanceof ReferenceChange change) {
                reported.add(change.getReference());
            }
        }
        for (EStructuralFeature feature : expected.eClass().getEAllStructuralFeatures()) {
            if (feature.isDerived()
                    || feature.isTransient()
                    || (feature instanceof EReference reference && reference.isContainer())
                    || reported.contains(feature)
                    || expected.eIsSet(feature) == actual.eIsSet(feature)) {
                continue;
            }
            lines.add(where(expected, "." + feature.getName()) + ": expected " + set(expected, feature) + ", got "
                    + set(actual, feature) + similarity(expected));
        }
        return lines;
    }

    private String set(EObject owner, EStructuralFeature feature) {
        Object value = owner.eGet(feature, false);
        return (owner.eIsSet(feature) ? "set " : "unset ")
                + (feature instanceof EReference ? target(value) : show(value));
    }

    // ----------------------------------------------------------------------------------- helpers

    /** The marker a line about an object with no natural key ends with; nothing for a keyed one. */
    private String similarity(EObject object) {
        return object == null || named.contains(object) ? "" : SIMILARITY;
    }

    private static Object value(EObject owner, EStructuralFeature feature) {
        return owner == null || !owner.eIsSet(feature) ? null : owner.eGet(feature, false);
    }

    private static List<?> list(EObject owner, EStructuralFeature feature) {
        return owner == null ? List.of() : (List<?>) owner.eGet(feature, false);
    }

    private static int index(EObject object) {
        if (object.eContainer() == null) {
            return object.eResource().getContents().indexOf(object);
        }
        return object.eContainingFeature().isMany()
                ? ((List<?>) object.eContainer().eGet(object.eContainingFeature(), false)).indexOf(object)
                : 0;
    }

    /** {@code <file>#<root> <path><feature>}, as {@link dev.jorisjonkers.deploykit.emf.cli.Comparison} writes it. */
    private String where(EObject object, String feature) {
        EObject root = EcoreUtil.getRootContainer(object);
        String at = path(object, 0, true) + feature;
        String file = name + "#" + (root.eResource().getContents().indexOf(root) + 1);
        return at.isEmpty() ? file : file + " " + at;
    }

    /** An added or removed object as a line shows it: its class, and how many objects its subtree holds. */
    private static String subtree(EObject object) {
        int size = 0;
        for (TreeIterator<EObject> contents = object.eAllContents(); contents.hasNext(); contents.next()) {
            size++;
        }
        return "a " + object.eClass().getName() + (size == 0 ? "" : " holding " + size + " objects");
    }

    /** A referenced object as a line shows it: by its keyed path, its root's index first in a file of several. */
    private String target(Object value) {
        if (!(value instanceof EObject object)) {
            return "null";
        }
        if (object.eIsProxy()) {
            return "-> " + ((InternalEObject) object).eProxyURI();
        }
        EObject root = EcoreUtil.getRootContainer(object);
        String file = root.eResource() == null || root.eResource().getContents().size() == 1
                ? ""
                : "#" + (root.eResource().getContents().indexOf(root) + 1) + " ";
        String path = path(object, 0, true);
        return object.eClass().getName() + " -> " + (file + path).strip();
    }

    private static String show(Object value) {
        return switch (value) {
            case null -> "null";
            case String text -> quoted(text);
            case EEnumLiteral literal -> literal.getName();
            case List<?> list -> "(" + list.size() + " values)";
            default -> String.valueOf(value);
        };
    }

    private static String quoted(String text) {
        try {
            return JSON.writeValueAsString(text);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
