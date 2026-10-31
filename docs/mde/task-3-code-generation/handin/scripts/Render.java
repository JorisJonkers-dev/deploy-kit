import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentPackage;
import dev.jorisjonkers.deploykit.emf.render.Rendering;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.stream.Stream;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.emf.ecore.resource.impl.ResourceSetImpl;
import org.eclipse.emf.ecore.xmi.impl.XMIResourceFactoryImpl;

/**
 * Runs the model-to-text transformation, render.mtl, on one Resolved Deployment model and writes
 * the generated files under OUTPUT, through the same entry point the implementation's pipeline and
 * tests use: Rendering.render. With EXPECTED, it then compares the generated tree with that tree,
 * file by file and byte by byte, and exits with 1 on any missing, extra or different file.
 *
 * <pre>java -cp "implementation/emf/target/lib/*" Render.java MODEL OUTPUT [EXPECTED]</pre>
 *
 * The class path is the directory build.sh fills after the Maven build: the implementation's
 * bundles and the EMF and Acceleo jars they need. OUTPUT is emptied first.
 */
public final class Render {

    public static void main(String[] args) throws IOException {
        if (args.length < 2 || args.length > 3) {
            System.err.println("usage: java -cp \"<implementation>/emf/target/lib/*\" Render.java MODEL OUTPUT [EXPECTED]");
            System.exit(2);
        }
        Path model = Path.of(args[0]);
        Path output = Path.of(args[1]);

        // The generated package is registered by its namespace URI, so the model loads as the
        // typed classes the templates are written against, whatever schemaLocation it carries.
        ResourceSet resources = new ResourceSetImpl();
        resources.getPackageRegistry().put(ResolvedDeploymentPackage.eNS_URI, ResolvedDeploymentPackage.eINSTANCE);
        resources.getResourceFactoryRegistry().getExtensionToFactoryMap().put("*", new XMIResourceFactoryImpl());
        Resource resource = resources.getResource(URI.createFileURI(model.toAbsolutePath().toString()), true);
        List<ResolvedDeployment> deployments =
                resource.getContents().stream().map(ResolvedDeployment.class::cast).toList();

        delete(output);
        Rendering.render(deployments, output);
        Map<String, byte[]> generated = read(output);
        System.out.printf("%s: %d files generated under %s%n", model, generated.size(), output);
        if (args.length == 3) {
            Path expected = Path.of(args[2]);
            List<String> differences = compare(generated, read(expected));
            if (!differences.isEmpty()) {
                differences.forEach(System.out::println);
                System.out.printf("FAIL: %d of the generated files differ from %s%n", differences.size(), expected);
                System.exit(1);
            }
            System.out.printf("OK: every generated file equals its expected file under %s, byte for byte%n", expected);
        }
    }

    /** Every difference between the two trees, one line each, by path. */
    private static List<String> compare(Map<String, byte[]> generated, Map<String, byte[]> expected) {
        TreeSet<String> paths = new TreeSet<>(generated.keySet());
        paths.addAll(expected.keySet());
        return paths.stream()
                .map(path -> {
                    byte[] got = generated.get(path);
                    byte[] want = expected.get(path);
                    if (want == null) {
                        return "  extra:     " + path;
                    } else if (got == null) {
                        return "  missing:   " + path;
                    } else if (!Arrays.equals(got, want)) {
                        return "  differs:   " + path + " (from line " + firstDifferentLine(got, want) + ")";
                    }
                    return null;
                })
                .filter(line -> line != null)
                .toList();
    }

    private static int firstDifferentLine(byte[] got, byte[] want) {
        int line = 1;
        for (int i = 0; i < Math.min(got.length, want.length) && got[i] == want[i]; i++) {
            if (got[i] == '\n') {
                line++;
            }
        }
        return line;
    }

    /** Every file under {@code root}, by its path below it with forward slashes. */
    private static Map<String, byte[]> read(Path root) throws IOException {
        Map<String, byte[]> files = new TreeMap<>();
        try (Stream<Path> paths = Files.walk(root)) {
            for (Path file : paths.filter(Files::isRegularFile).toList()) {
                files.put(root.relativize(file).toString().replace('\\', '/'), Files.readAllBytes(file));
            }
        }
        return files;
    }

    private static void delete(Path directory) throws IOException {
        if (!Files.exists(directory)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(directory)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.delete(path);
            }
        }
    }
}
