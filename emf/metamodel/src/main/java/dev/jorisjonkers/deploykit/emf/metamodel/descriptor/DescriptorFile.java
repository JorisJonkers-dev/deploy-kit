package dev.jorisjonkers.deploykit.emf.metamodel.descriptor;

import dev.jorisjonkers.deploykit.emf.metamodel.json.CanonicalJson;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentPackage;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * The source metamodel's descriptor, written where a run of the build leaves it: the same reflective
 * walk {@link Descriptor} performs, in the canonical JSON the oracle is committed in
 * (docs/adr/emf/0120-parity-crosses-the-cli-file-interface.md). The file is named for its oracle,
 * {@code spec/v1/examples/expected/descriptor.json}, so the two are obviously a pair.
 */
public final class DescriptorFile {

    /** The name a run writes, the oracle's own. */
    public static final String NAME = "descriptor.json";

    private DescriptorFile() {}

    /** Writes the source metamodel's descriptor under {@code directory}, and returns the file. */
    public static Path write(Path directory) throws IOException {
        Files.createDirectories(directory);
        return Files.writeString(
                directory.resolve(NAME),
                CanonicalJson.write(Descriptor.of(ProjectIntentPackage.eINSTANCE)),
                StandardCharsets.UTF_8);
    }
}
