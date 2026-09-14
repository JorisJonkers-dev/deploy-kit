package dev.jorisjonkers.deploykit.emf.syntax;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.syntax.skeleton.Document;
import dev.jorisjonkers.deploykit.emf.syntax.skeleton.Entry;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.xtext.resource.XtextResourceSet;
import org.junit.jupiter.api.Test;

// Walking skeleton (#81): a generated Xtext parser reads a document headless.
// Deleted by the Task 1 syntax ticket, whose suite covers Xtext.
class SkeletonTest {

    private static Resource parse(String text) throws IOException {
        XtextResourceSet resources = new SkeletonStandaloneSetup()
                .createInjectorAndDoEMFRegistration()
                .getInstance(XtextResourceSet.class);
        Resource resource = resources.createResource(URI.createURI("memory:/notes.skeleton"));
        resource.load(new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8)), Map.of());
        return resource;
    }

    @Test
    void anXtextGrammarParsesAThreeLineDocument() throws IOException {
        Resource resource = parse("project: 'notes'\napplication: 'notes'\nprocess: 'web'\n");

        assertThat(resource.getErrors()).isEmpty();
        assertThat(((Document) resource.getContents().get(0)).getEntries())
                .extracting(Entry::getKey, Entry::getValue)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple("project", "notes"),
                        org.assertj.core.groups.Tuple.tuple("application", "notes"),
                        org.assertj.core.groups.Tuple.tuple("process", "web"));
    }

    @Test
    void aDocumentOutsideTheGrammarIsRefused() throws IOException {
        assertThat(parse("project 'notes'\n").getErrors()).isNotEmpty();
    }
}
