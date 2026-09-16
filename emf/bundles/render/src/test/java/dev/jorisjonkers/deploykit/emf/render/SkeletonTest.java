package dev.jorisjonkers.deploykit.emf.render;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.eclipse.acceleo.Module;
import org.eclipse.acceleo.aql.AcceleoUtil;
import org.eclipse.acceleo.aql.evaluation.AcceleoEvaluator;
import org.eclipse.acceleo.aql.evaluation.strategy.DefaultGenerationStrategy;
import org.eclipse.acceleo.aql.evaluation.strategy.DefaultWriterFactory;
import org.eclipse.acceleo.aql.parser.AcceleoParser;
import org.eclipse.acceleo.aql.parser.ModuleLoader;
import org.eclipse.acceleo.query.runtime.impl.namespace.ClassLoaderQualifiedNameResolver;
import org.eclipse.acceleo.query.runtime.impl.namespace.JavaLoader;
import org.eclipse.acceleo.query.runtime.namespace.IQualifiedNameQueryEnvironment;
import org.eclipse.emf.common.util.BasicMonitor;
import org.eclipse.emf.common.util.Diagnostic;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.EcorePackage;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.resource.ResourceSet;
import org.eclipse.emf.ecore.resource.impl.ResourceSetImpl;
import org.eclipse.emf.ecore.xmi.impl.EcoreResourceFactoryImpl;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

// Walking skeleton (#81): an Acceleo 4 template writes a file headless. Deleted
// by the Task 3 rendering ticket, whose suite covers Acceleo.
class SkeletonTest {

    @Test
    void anAcceleoTemplateWritesOneFile(@TempDir Path out) throws IOException {
        ResourceSet resources = new ResourceSetImpl();
        resources.getResourceFactoryRegistry().getExtensionToFactoryMap().put("ecore", new EcoreResourceFactoryImpl());
        resources.getPackageRegistry().put(EcorePackage.eNS_URI, EcorePackage.eINSTANCE);
        Resource model = resources.getResource(
                URI.createFileURI(
                        Path.of("model", "notes.ecore").toAbsolutePath().toString()),
                true);

        try (URLClassLoader templates = new URLClassLoader(
                new URL[] {Path.of("model").toUri().toURL()}, getClass().getClassLoader())) {
            ClassLoaderQualifiedNameResolver resolver =
                    new ClassLoaderQualifiedNameResolver(templates, resources.getPackageRegistry(), "::");
            IQualifiedNameQueryEnvironment environment =
                    AcceleoUtil.newAcceleoQueryEnvironment(Map.of(), resolver, resources, false);
            AcceleoEvaluator evaluator = new AcceleoEvaluator(environment.getLookupEngine(), "\n");
            resolver.addLoader(new ModuleLoader(new AcceleoParser(), evaluator));
            resolver.addLoader(new JavaLoader("::", false));
            Module module = (Module) resolver.resolve("file");

            AcceleoUtil.generate(
                    evaluator,
                    environment,
                    module,
                    model,
                    new DefaultGenerationStrategy(resources.getURIConverter(), new DefaultWriterFactory()),
                    URI.createFileURI(out.toString() + "/"),
                    null,
                    new BasicMonitor());
            assertThat(evaluator.getGenerationResult().getDiagnostic().getSeverity())
                    .as(evaluator.getGenerationResult().getDiagnostic().toString())
                    .isEqualTo(Diagnostic.OK);
            AcceleoUtil.cleanServices(environment, resources);
        }

        assertThat(Files.readString(out.resolve("notes.txt"), StandardCharsets.UTF_8))
                .isEqualTo("package notes\n");
    }
}
