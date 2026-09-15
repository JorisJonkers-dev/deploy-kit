package dev.jorisjonkers.deploykit.emf.cli;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;

/** The worked examples under {@code spec/v1/examples/}, and scratch copies of them with one change. */
final class Examples {

    private Examples() {}

    static Path of(String relative) {
        Path dir = Path.of("").toAbsolutePath();
        while (!Files.isRegularFile(dir.resolve("emf/pom.xml"))) {
            dir = dir.getParent();
        }
        return dir.resolve("spec/v1/examples").resolve(relative);
    }

    static String read(String relative) {
        try {
            return Files.readString(of(relative));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** {@code text} written to {@code name} in {@code directory}. */
    static Path write(Path directory, String name, String text) {
        try {
            return Files.writeString(directory.resolve(name), text);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
