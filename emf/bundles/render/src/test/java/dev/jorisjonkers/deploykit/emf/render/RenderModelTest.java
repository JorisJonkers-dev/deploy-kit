package dev.jorisjonkers.deploykit.emf.render;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** The run render.launch makes: the committed minimal model rendered to minimal's committed tree. */
class RenderModelTest {

    /** The directory holding {@code emf/pom.xml}, from wherever the test runs below it. */
    private static Path repository() {
        Path dir = Path.of("").toAbsolutePath();
        while (!Files.isRegularFile(dir.resolve("emf/pom.xml"))) {
            dir = dir.getParent();
        }
        return dir;
    }

    /** Every file below {@code root}, by its path below it. */
    private static Map<String, String> tree(Path root) throws IOException {
        Map<String, String> files = new TreeMap<>();
        try (Stream<Path> paths = Files.walk(root)) {
            for (Path file : paths.filter(Files::isRegularFile).toList()) {
                files.put(root.relativize(file).toString().replace('\\', '/'), Files.readString(file));
            }
        }
        return files;
    }

    @Test
    void theCommittedMinimalModelRendersMinimalsCommittedTreeByteForByte(@TempDir Path out) throws IOException {
        Path repository = repository();

        RenderModel.main(new String[] {
            repository.resolve("emf/models/minimal.resolveddeployment").toString(), out.toString()
        });

        assertThat(tree(out.resolve("apps/notes")))
                .isEqualTo(tree(repository.resolve("spec/v1/examples/minimal/rendered/apps/notes")));
    }
}
