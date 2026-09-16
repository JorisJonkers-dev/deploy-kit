package dev.jorisjonkers.deploykit.emf.metamodel.descriptor;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.metamodel.json.CanonicalJson;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** The descriptor a run of this module's build leaves behind, beside the oracle it is paired with. */
class DescriptorFileTest {

    /** Where a run of this module leaves what the parity contract compares, under its build output. */
    private static final Path OUTPUT = Path.of("target", "parity");

    @Test
    void aRunLeavesTheDescriptorUnderTheModulesBuildOutput() throws IOException {
        Path file = DescriptorFile.write(OUTPUT);

        assertThat(file).isEqualTo(OUTPUT.resolve("descriptor.json"));
        assertThat(Files.readString(file, StandardCharsets.UTF_8))
                .isEqualTo(CanonicalJson.write(Descriptor.of(ProjectIntentPackage.eINSTANCE)));
    }

    @Test
    void aDirectoryNoRunHasWrittenYetIsCreated(@TempDir Path directory) throws IOException {
        Path file = DescriptorFile.write(directory.resolve("target").resolve("parity"));

        assertThat(file).exists();
    }
}
