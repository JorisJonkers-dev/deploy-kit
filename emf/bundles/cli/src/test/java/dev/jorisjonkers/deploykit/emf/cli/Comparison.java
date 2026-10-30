package dev.jorisjonkers.deploykit.emf.cli;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EAttribute;
import org.eclipse.emf.ecore.EEnumLiteral;
import org.eclipse.emf.ecore.EObject;
import org.eclipse.emf.ecore.EReference;
import org.eclipse.emf.ecore.EStructuralFeature;
import org.eclipse.emf.ecore.InternalEObject;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.emf.ecore.resource.impl.ResourceSetImpl;
import org.eclipse.emf.ecore.util.EcoreUtil;
import org.eclipse.emf.ecore.xmi.impl.XMIResourceFactoryImpl;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

/**
 * The stage harness's one comparator: two files, or two trees of files, compared by what they hold
 * first and by their bytes last. JSON is read as a Jackson tree, YAML as every document of a stream
 * through SnakeYAML's YAML 1.1 reader on both sides, so a quoted {@code "true"} and a plain {@code
 * true} still differ by type, and XMI is loaded into EMF and walked feature by feature, with {@link
 * EcoreUtil.EqualityHelper} deciding. Every difference is reported, as a path into the file: {@code
 * apps/x/workload.yaml#1 .spec.containers[0].env[3].value: expected "x", got "y"}. A file that holds
 * the same content in other bytes is one difference, "formatting only", naming the first line that
 * differs.
 */
final class Comparison {

    private static final ObjectMapper JSON =
            new ObjectMapper().enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS);

    /** A key written bare in a path; any other is written quoted, in brackets. */
    private static final Pattern BARE = Pattern.compile("[A-Za-z0-9_-]+");

    /** The keys an item of a list is named by, in the order they are tried. */
    private static final List<String> IDENTITIES = List.of("name", "id", "path", "alias", "key");

    /** A file in a tree that is documentation of the tree rather than part of it. */
    private static final String README = "README.md";

    private Comparison() {}

    /** Every difference between the tree under {@code expected} and the files of {@code actual}. */
    static List<String> trees(Path expected, Map<String, byte[]> actual) {
        Map<String, byte[]> committed = read(expected);
        List<String> differences = new ArrayList<>();
        TreeSet<String> names = new TreeSet<>(committed.keySet());
        names.addAll(actual.keySet());
        for (String name : names) {
            if (!actual.containsKey(name)) {
                differences.add(name + ": missing file");
            } else if (!committed.containsKey(name)) {
                differences.add(name + ": extra file");
            } else {
                URI uri = URI.createFileURI(
                        expected.resolve(name).toAbsolutePath().toString());
                differences.addAll(files(name, uri, committed.get(name), actual.get(name)));
            }
        }
        return differences;
    }

    /** Every file under {@code root} but a README, by its path below it, sorted; nothing when there is no root. */
    static Map<String, byte[]> read(Path root) {
        Map<String, byte[]> files = new TreeMap<>();
        if (!Files.isDirectory(root)) {
            return files;
        }
        try (Stream<Path> tree = Files.walk(root)) {
            for (Path file : tree.filter(Files::isRegularFile).toList()) {
                String name = root.relativize(file).toString().replace('\\', '/');
                if (!file.getFileName().toString().equals(README)) {
                    files.put(name, Files.readAllBytes(file));
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return files;
    }

    /**
     * Every difference between two versions of the file {@code name}, by the format its extension
     * names; {@code uri} is where both are read as being, so an XMI reference resolves the same way
     * from either.
     */
    static List<String> files(String name, URI uri, byte[] expected, byte[] actual) {
        String committed = new String(expected, StandardCharsets.UTF_8);
        String written = new String(actual, StandardCharsets.UTF_8);
        List<String> differences;
        if (name.endsWith(".json")) {
            differences = json(name, committed, written);
        } else if (name.endsWith(".yaml") || name.endsWith(".yml")) {
            differences = yaml(name, committed, written);
        } else if (name.endsWith(".xmi") || name.endsWith(".resolveddeployment")) {
            differences = xmi(name, uri, expected, actual);
        } else {
            differences = new ArrayList<>();
        }
        if (differences.isEmpty() && !committed.equals(written)) {
            differences.add(formattingOnly(name, committed, written));
        }
        return differences;
    }

    /** Every difference between two JSON documents, by value. */
    static List<String> json(String name, String expected, String actual) {
        List<String> differences = new ArrayList<>();
        Object committed;
        Object written;
        try {
            committed = JSON.readValue(expected, Object.class);
            written = JSON.readValue(actual, Object.class);
        } catch (JsonProcessingException e) {
            differences.add(name + ": not JSON: " + e.getOriginalMessage());
            return differences;
        }
        values(name, "", committed, written, differences);
        return differences;
    }

    /** Every difference between two YAML streams, document by document, as a YAML 1.1 reader reads them. */
    static List<String> yaml(String name, String expected, String actual) {
        List<String> differences = new ArrayList<>();
        List<Object> committed;
        List<Object> written;
        try {
            committed = documents(expected);
            written = documents(actual);
        } catch (RuntimeException e) {
            differences.add(
                    name + ": not YAML: " + e.getMessage().lines().findFirst().orElse(""));
            return differences;
        }
        for (int i = 0; i < Math.max(committed.size(), written.size()); i++) {
            String document = name + "#" + (i + 1);
            if (i >= written.size()) {
                differences.add(document + ": missing document");
            } else if (i >= committed.size()) {
                differences.add(document + ": extra document");
            } else {
                values(document, "", committed.get(i), written.get(i), differences);
            }
        }
        return differences;
    }

    private static List<Object> documents(String text) {
        List<Object> documents = new ArrayList<>();
        for (Object document : new Yaml(new SafeConstructor(new LoaderOptions())).loadAll(text)) {
            documents.add(document);
        }
        return documents;
    }

    /**
     * Every difference between two XMI files, each loaded on its own as if it were at {@code uri}.
     * {@link EcoreUtil.EqualityHelper} decides whether they differ; the walk says where.
     */
    static List<String> xmi(String name, URI uri, byte[] expected, byte[] actual) {
        List<String> differences = new ArrayList<>();
        List<EObject> committed;
        List<EObject> written;
        try {
            committed = load(uri, expected);
            written = load(uri, actual);
        } catch (IOException | RuntimeException e) {
            differences.add(name + ": not XMI: " + e.getMessage());
            return differences;
        }
        if (new EcoreUtil.EqualityHelper().equals(committed, written)) {
            return differences;
        }
        for (int i = 0; i < Math.max(committed.size(), written.size()); i++) {
            String root = name + "#" + (i + 1);
            if (i >= written.size()) {
                differences.add(root + ": missing root");
            } else if (i >= committed.size()) {
                differences.add(root + ": extra root");
            } else {
                objects(root, "", committed.get(i), written.get(i), differences);
            }
        }
        if (differences.isEmpty()) {
            differences.add(name + ": differs where the walk does not look, by EcoreUtil.EqualityHelper");
        }
        return differences;
    }

    /** The roots of {@code bytes} read as XMI at {@code uri}, in a resource set of their own. */
    static List<EObject> load(URI uri, byte[] bytes) throws IOException {
        ResourceSet resources = new ResourceSetImpl();
        resources
                .getResourceFactoryRegistry()
                .getExtensionToFactoryMap()
                .put(Resource.Factory.Registry.DEFAULT_EXTENSION, new XMIResourceFactoryImpl());
        Resource resource = resources.createResource(uri);
        resource.load(new ByteArrayInputStream(bytes), null);
        return new ArrayList<>(resource.getContents());
    }

    private static void objects(String root, String at, EObject expected, EObject actual, List<String> out) {
        if (expected.eClass() != actual.eClass()) {
            out.add(where(root, at) + ": expected a " + expected.eClass().getName() + ", got a "
                    + actual.eClass().getName());
            return;
        }
        for (EStructuralFeature feature : expected.eClass().getEAllStructuralFeatures()) {
            if (feature.isDerived()
                    || feature.isTransient()
                    || (feature instanceof EReference reference && reference.isContainer())) {
                continue;
            }
            String path = at + "." + feature.getName();
            if (expected.eIsSet(feature) != actual.eIsSet(feature)) {
                out.add(where(root, path) + ": expected " + (expected.eIsSet(feature) ? "set" : "unset") + " "
                        + feature(expected, feature) + ", got " + (actual.eIsSet(feature) ? "set" : "unset") + " "
                        + feature(actual, feature));
                continue;
            }
            List<?> committed = many(expected, feature);
            List<?> written = many(actual, feature);
            for (int i = 0; i < Math.max(committed.size(), written.size()); i++) {
                String item = feature.isMany() ? path + "[" + i + "]" : path;
                if (i >= written.size()) {
                    out.add(where(root, item) + ": missing (expected " + element(committed.get(i)) + ")");
                } else if (i >= committed.size()) {
                    out.add(where(root, item) + ": extra (got " + element(written.get(i)) + ")");
                } else {
                    element(root, item, feature, committed.get(i), written.get(i), out);
                }
            }
        }
    }

    private static void element(
            String root, String at, EStructuralFeature feature, Object expected, Object actual, List<String> out) {
        if (feature instanceof EReference reference && reference.isContainment()) {
            objects(root, at, (EObject) expected, (EObject) actual, out);
        } else if (feature instanceof EAttribute) {
            if (!Objects.equals(expected, actual)) {
                out.add(where(root, at) + ": expected " + element(expected) + ", got " + element(actual));
            }
        } else if (!element(expected).equals(element(actual))) {
            out.add(where(root, at) + ": expected " + element(expected) + ", got " + element(actual));
        }
    }

    /** A feature's values as a list, one value or none for a single-valued one. */
    private static List<?> many(EObject owner, EStructuralFeature feature) {
        Object value = owner.eGet(feature, false);
        if (feature.isMany()) {
            return (List<?>) value;
        }
        List<Object> one = new ArrayList<>();
        if (value != null) {
            one.add(value);
        }
        return one;
    }

    private static String feature(EObject owner, EStructuralFeature feature) {
        return feature.isMany()
                ? "(" + ((List<?>) owner.eGet(feature, false)).size() + " values)"
                : element(owner.eGet(feature, false));
    }

    /** A value as a report shows it: a string quoted, an object by its class and where it is. */
    private static String element(Object value) {
        return switch (value) {
            case null -> "null";
            case String text -> quoted(text);
            case EEnumLiteral literal -> literal.getName();
            case EObject object ->
                object.eIsProxy()
                        ? "-> " + ((InternalEObject) object).eProxyURI()
                        : object.eResource() == null
                                ? object.eClass().getName()
                                : object.eClass().getName() + " -> "
                                        + EcoreUtil.getURI(object).fragment();
            default -> String.valueOf(value);
        };
    }

    private static void values(String document, String at, Object expected, Object actual, List<String> out) {
        String committed = kind(expected);
        String written = kind(actual);
        if (!committed.equals(written)) {
            out.add(where(document, at) + ": expected " + show(expected) + " (" + committed + "), got " + show(actual)
                    + " (" + written + ")");
            return;
        }
        switch (expected) {
            case Map<?, ?> map -> {
                Map<?, ?> other = (Map<?, ?>) actual;
                for (Map.Entry<?, ?> entry : map.entrySet()) {
                    String path = at + key(entry.getKey());
                    if (other.containsKey(entry.getKey())) {
                        values(document, path, entry.getValue(), other.get(entry.getKey()), out);
                    } else {
                        out.add(where(document, path) + ": missing (expected " + show(entry.getValue()) + ")");
                    }
                }
                for (Map.Entry<?, ?> entry : other.entrySet()) {
                    if (!map.containsKey(entry.getKey())) {
                        out.add(where(document, at + key(entry.getKey())) + ": extra (got " + show(entry.getValue())
                                + ")");
                    }
                }
            }
            case List<?> list -> {
                List<?> other = (List<?>) actual;
                String identity = identity(list, other);
                if (identity != null) {
                    keyed(document, at, identity, list, other, out);
                    return;
                }
                for (int i = 0; i < Math.max(list.size(), other.size()); i++) {
                    String path = at + "[" + i + "]";
                    if (i >= other.size()) {
                        out.add(where(document, path) + ": missing (expected " + show(list.get(i)) + ")");
                    } else if (i >= list.size()) {
                        out.add(where(document, path) + ": extra (got " + show(other.get(i)) + ")");
                    } else {
                        values(document, path, list.get(i), other.get(i), out);
                    }
                }
            }
            default -> {
                if (!same(expected, actual)) {
                    out.add(where(document, at) + ": expected " + show(expected) + ", got " + show(actual));
                }
            }
        }
    }

    /**
     * The key every item of both lists is a map naming uniquely, if there is one: such a list is
     * compared item by item by that key, so one inserted item is one difference rather than a shift
     * of every item after it, and an order that differs is one more.
     */
    private static String identity(List<?> expected, List<?> actual) {
        for (String key : IDENTITIES) {
            if (named(expected, key) && named(actual, key)) {
                return key;
            }
        }
        return null;
    }

    private static boolean named(List<?> items, String key) {
        Set<Object> names = new HashSet<>();
        for (Object item : items) {
            if (!(item instanceof Map<?, ?> map) || !(map.get(key) instanceof String name) || !names.add(name)) {
                return false;
            }
        }
        return true;
    }

    private static void keyed(
            String document, String at, String identity, List<?> expected, List<?> actual, List<String> out) {
        Map<Object, Object> written = new LinkedHashMap<>();
        actual.forEach(item -> written.put(((Map<?, ?>) item).get(identity), item));
        List<Object> committedOrder = new ArrayList<>();
        for (Object item : expected) {
            Object name = ((Map<?, ?>) item).get(identity);
            String path = at + "[" + identity + "=" + quoted((String) name) + "]";
            if (written.containsKey(name)) {
                committedOrder.add(name);
                values(document, path, item, written.get(name), out);
            } else {
                out.add(where(document, path) + ": missing (expected " + show(item) + ")");
            }
        }
        Map<Object, Object> committed = new LinkedHashMap<>();
        expected.forEach(item -> committed.put(((Map<?, ?>) item).get(identity), item));
        List<Object> writtenOrder = new ArrayList<>();
        for (Map.Entry<Object, Object> item : written.entrySet()) {
            if (committed.containsKey(item.getKey())) {
                writtenOrder.add(item.getKey());
            } else {
                out.add(where(document, at + "[" + identity + "=" + quoted((String) item.getKey()) + "]")
                        + ": extra (got " + show(item.getValue()) + ")");
            }
        }
        if (!committedOrder.equals(writtenOrder)) {
            out.add(where(document, at) + ": order differs by " + identity + ": expected " + committedOrder + ", got "
                    + writtenOrder);
        }
    }

    private static boolean same(Object expected, Object actual) {
        if (expected instanceof Number committed && actual instanceof Number written) {
            return new BigDecimal(committed.toString()).compareTo(new BigDecimal(written.toString())) == 0;
        }
        return Objects.equals(expected, actual);
    }

    /** What a YAML 1.1 or JSON reader made of a value, by the type a consumer would see. */
    private static String kind(Object value) {
        return switch (value) {
            case null -> "null";
            case Map<?, ?> ignored -> "map";
            case List<?> ignored -> "list";
            case String ignored -> "string";
            case Boolean ignored -> "boolean";
            case BigDecimal ignored -> "float";
            case Double ignored -> "float";
            case Float ignored -> "float";
            case Number ignored -> "integer";
            case Date ignored -> "timestamp";
            default -> value.getClass().getSimpleName();
        };
    }

    private static String show(Object value) {
        return switch (value) {
            case null -> "null";
            case String text -> quoted(text);
            case Map<?, ?> map -> "a map of " + map.size();
            case List<?> list -> "a list of " + list.size();
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

    private static String key(Object key) {
        String text = String.valueOf(key);
        return key instanceof String && BARE.matcher(text).matches() ? "." + text : "[" + show(key) + "]";
    }

    private static String where(String document, String at) {
        return at.isEmpty() ? document : document + " " + at;
    }

    /** The one difference of two files that hold the same values in other bytes: the first line they part at. */
    static String formattingOnly(String name, String expected, String actual) {
        List<String> committed = expected.lines().toList();
        List<String> written = actual.lines().toList();
        int line = 0;
        while (line < committed.size()
                && line < written.size()
                && committed.get(line).equals(written.get(line))) {
            line++;
        }
        String detail = line < committed.size() || line < written.size()
                ? "line " + (line + 1) + ": expected " + lineAt(committed, line) + ", got " + lineAt(written, line)
                : "line endings or the final line break";
        return name + ": formatting only (quoting, indentation or key order); " + detail;
    }

    private static String lineAt(List<String> lines, int index) {
        return index < lines.size() ? quoted(lines.get(index)) : "the end of the file";
    }
}
