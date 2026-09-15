package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.groups.Tuple.tuple;

import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * REQ-031 (docs/requirements.md): the Platform document and the project files read beside it are
 * refused where a reference one makes into the other does not resolve, or a policy one asks for the
 * other does not offer.
 */
class IntentSetTest {

    private static final List<Path> WORKED = List.of(
            Examples.of("platform/platform.intent.yml"),
            Examples.of("auth/auth.project.yml"),
            Examples.of("data/data.project.yml"),
            Examples.of("knowledge/knowledge.project.yml"),
            Examples.of("minimal/notes.project.yml"));

    @Test
    void theWorkedEstateIsRefusedExactlyWhereThePlatformDocumentSaysItWillBe() {
        assertThat(Pipeline.check(WORKED))
                .extracting(Diagnostic::code, Diagnostic::document, Diagnostic::path)
                .containsExactlyInAnyOrder(
                        tuple("E_UNKNOWN_TIER_PROXY", "platform.intent.yml", "/tiers/0"),
                        tuple("E_UNKNOWN_TIER_PROXY", "platform.intent.yml", "/tiers/1"),
                        tuple(
                                "E_SECRETS_AT_REST_REQUIRED",
                                "data.project.yml",
                                "/applications/0/processes/0/secrets/0"),
                        tuple("E_SECRETS_AT_REST_REQUIRED", "knowledge.project.yml", "/applications/0/secrets/0"),
                        tuple("E_SECRETS_AT_REST_REQUIRED", "knowledge.project.yml", "/applications/0/secrets/1"),
                        tuple(
                                "E_SECRETS_AT_REST_REQUIRED",
                                "knowledge.project.yml",
                                "/applications/0/processes/0/secrets/0"),
                        tuple(
                                "E_SECRETS_AT_REST_REQUIRED",
                                "knowledge.project.yml",
                                "/applications/0/processes/1/secrets/0"));
    }

    @Test
    void projectFilesReadWithoutAPlatformDocumentAnswerNoRuleAcrossDocuments() {
        assertThat(Pipeline.check(WORKED.subList(1, WORKED.size()))).isEmpty();
    }

    @Test
    void aSetThatBreaksNothingIsNotRefused(@TempDir Path directory) {
        Path platform = Examples.write(
                directory,
                "platform.intent.yml",
                Examples.read("platform/platform.intent.yml")
                        .replace("secretsEncryption: false", "secretsEncryption: true")
                        .replace("traefik: traefik-public", "traefik: notes")
                        .replace("traefik: traefik-lan", "traefik: notes"));

        assertThat(Pipeline.check(List.of(platform, Examples.of("minimal/notes.project.yml"))))
                .isEmpty();
    }

    @Test
    void noRuleAcrossDocumentsRunsUntilEveryFileHolds(@TempDir Path directory) {
        Path broken = Examples.write(directory, "broken.project.yml", "kind: Project\n");

        assertThat(Pipeline.check(List.of(WORKED.get(0), WORKED.get(2), broken)))
                .extracting(Diagnostic::document)
                .containsOnly("broken.project.yml")
                .isNotEmpty();
    }

    @Test
    void aFileThatIsNeitherDocumentIsNotRead(@TempDir Path directory) {
        Path environment = Examples.write(directory, "notes.env", "NODE_ENV=production\n");

        assertThat(Pipeline.check(List.of(environment))).isEmpty();
    }

    @Test
    void aRouteWhoseOwnAudienceNoTierCarriesIsRefusedAtTheRoute(@TempDir Path directory) {
        Path platform = Examples.write(
                directory,
                "platform.intent.yml",
                Examples.read("platform/platform.intent.yml")
                        .replace("audiences: [anonymous, authenticated]", "audiences: [lan]")
                        .replaceFirst("\n\\s+forwardAuth: [^\n]*", "")
                        .replace("secretsEncryption: false", "secretsEncryption: true")
                        .replace("traefik: traefik-public", "traefik: knowledge")
                        .replace("traefik: traefik-lan", "traefik: knowledge"));
        Path knowledge = Examples.write(
                directory,
                "knowledge.project.yml",
                Examples.read("knowledge/knowledge.project.yml").replace("audience: authenticated", "audience: lan"));

        assertThat(Pipeline.check(List.of(platform, knowledge)))
                .extracting(Diagnostic::code, Diagnostic::path)
                .containsExactly(
                        tuple("E_NO_TIER_FOR_AUDIENCE", "/applications/0/exposure/0/routes/0"),
                        tuple("E_NO_TIER_FOR_AUDIENCE", "/applications/0/exposure/0/routes/1"),
                        tuple("E_NO_TIER_FOR_AUDIENCE", "/applications/0/exposure/0/routes/2"),
                        tuple("E_NO_TIER_FOR_AUDIENCE", "/applications/0/exposure/0/routes/3"));
    }
}
