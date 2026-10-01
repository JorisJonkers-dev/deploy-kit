package dev.jorisjonkers.deploykit.emf.metamodel.revision;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Application;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Lifecycle;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Platform;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Process;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Project;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentFactory;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Scrape;
import org.eclipse.emf.ecore.util.EcoreUtil;
import org.junit.jupiter.api.Test;

/** A pinned input's digest: the canonical form of its model, so it moves when what it says does. */
class ModelDigestTest {

    private static final ProjectIntentFactory MODEL = ProjectIntentFactory.eINSTANCE;

    private static Project project() {
        Process process = MODEL.createProcess();
        process.setName("notes-api");
        process.setLifecycle(Lifecycle.APPLICATION);
        process.getWritablePaths().add("/tmp");
        Application application = MODEL.createApplication();
        application.setId("notes");
        application.getProcesses().add(process);
        application.setObservability(MODEL.createObservability());
        Scrape scrape = MODEL.createScrape();
        scrape.setProcess(process);
        scrape.setPath("/metrics");
        application.getObservability().setScrape(scrape);
        Project project = MODEL.createProject();
        project.setProject("notes");
        project.getApplications().add(application);
        return project;
    }

    @Test
    void theSameModelHasTheSameDigestAndAnythingItSaysMovesIt() {
        String recorded = ModelDigest.of(project());

        assertThat(recorded).matches("sha256:[0-9a-f]{64}");
        assertThat(ModelDigest.of(EcoreUtil.copy(project()))).isEqualTo(recorded);

        // An attribute, a list entry and an enumeration literal each move it.
        Project renamed = project();
        renamed.setOwner("someone-else");
        assertThat(ModelDigest.of(renamed)).isNotEqualTo(recorded);
        Project listed = project();
        listed.getApplications().get(0).getProcesses().get(0).getWritablePaths().add("/var/cache");
        assertThat(ModelDigest.of(listed)).isNotEqualTo(recorded);
        Project job = project();
        job.getApplications().get(0).getProcesses().get(0).setLifecycle(Lifecycle.JOB);
        assertThat(ModelDigest.of(job)).isNotEqualTo(recorded);
    }

    @Test
    void aReferenceIsTheIdOfWhatItNamesOrItsPathWhereItCarriesNone() {
        // A Process carries no ID, so the scrape names it by its path; renaming it moves only the
        // Process's own entry, and moving the scrape to another Process moves the digest.
        Project one = project();
        Process second = MODEL.createProcess();
        second.setName("notes-api");
        second.setLifecycle(Lifecycle.APPLICATION);
        second.getWritablePaths().add("/tmp");
        one.getApplications().get(0).getProcesses().add(second);
        String first = ModelDigest.of(one);
        one.getApplications().get(0).getObservability().getScrape().setProcess(second);

        assertThat(ModelDigest.of(one)).isNotEqualTo(first);

        // An Application carries one, so a Platform document names it by it.
        Platform platform = MODEL.createPlatform();
        platform.setSecretStore(one.getApplications().get(0));
        String named = ModelDigest.of(platform);
        one.getApplications().get(0).setId("vault");
        assertThat(ModelDigest.of(platform)).isNotEqualTo(named);
    }

    @Test
    void aTextIsDigestedAsTheJsonStringItIsWrittenAs() {
        // sha256 over `"a\nb"`, the canonical JSON of the two-line text: the digest the production
        // implementation gives an Asset's content, so an Asset's name is the same in both.
        assertThat(ModelDigest.ofText("a\nb"))
                .isEqualTo(ModelDigest.ofText("a\nb"))
                .isNotEqualTo(ModelDigest.ofText("a\nc"))
                .isEqualTo("sha256:" + sha256("\"a\\nb\""));
    }

    @Test
    void aCanonicalTextIsDigestedAsWrittenAndAnUnknownAlgorithmIsADefect() {
        // The revision's text is already canonical JSON, so its bytes are what is hashed.
        assertThat(ModelDigest.ofBytes("{\"id\":\"notes\"}")).isEqualTo("sha256:" + sha256("{\"id\":\"notes\"}"));
        assertThatThrownBy(() -> ModelDigest.digest("no-such-algorithm", "text"))
                .isInstanceOf(IllegalStateException.class);
    }

    private static String sha256(String text) {
        try {
            return java.util.HexFormat.of()
                    .formatHex(java.security.MessageDigest.getInstance("SHA-256")
                            .digest(text.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException absent) {
            throw new IllegalStateException(absent);
        }
    }
}
