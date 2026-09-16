package dev.jorisjonkers.deploykit.emf.parity

import java.nio.file.Files
import java.nio.file.Path

/** The repository this suite runs inside, found from its own working directory. */
fun repository(): Path {
    var dir = Path.of("").toAbsolutePath()
    while (!Files.isRegularFile(dir.resolve("emf/pom.xml"))) {
        dir = dir.parent
    }
    return dir
}
