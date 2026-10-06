package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.groups.Tuple.tuple;

import java.io.UncheckedIOException;
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
            Examples.of("delivery/delivery.project.yml"),
            Examples.of("edge/edge.project.yml"),
            Examples.of("knowledge/knowledge.project.yml"),
            Examples.of("minimal/notes.project.yml"),
            Examples.of("observability/observability.project.yml"),
            Examples.of("secrets/secrets.project.yml"));

    /** The worked Platform document's telemetry block, which a variant composed with fewer projects drops. */
    private static final String TELEMETRY = "\ntelemetry:\n(  .*\n)+";

    /** Its API access block, which names Applications a variant may not compose. */
    private static final String API_ACCESS = "\napiAccess:\n(  .*\n)+";

    @Test
    void theWorkedEstateIsRefusedNowhere() {
        // The foundation is declared and secrets are encrypted at rest.
        assertThat(Pipeline.check(WORKED)).isEmpty();
    }

    @Test
    void aYamlFileThatSaysItIsAProjectIsReadAsOneWhateverItsName(@TempDir Path directory) {
        String broken = Examples.read("minimal/notes.project.yml").replace("runtime: node", "runtime: rust");

        assertThat(Pipeline.check(List.of(Examples.write(directory, "notes.yml", broken))))
                .extracting(Diagnostic::document)
                .containsOnly("notes.yml");
        assertThat(Pipeline.check(List.of(
                        Examples.write(directory, "asset.yml", broken.replace("kind: Project", "kind: Asset")),
                        Examples.write(directory, "notes.txt", broken))))
                .isEmpty();
    }

    @Test
    void aYamlFileThatCannotBeReadIsAnErrorRatherThanAProjectOrNot(@TempDir Path directory) {
        assertThatThrownBy(() -> Pipeline.check(List.of(directory.resolve("missing.yml"))))
                .isInstanceOf(UncheckedIOException.class);
    }

    @Test
    void everyEnvAndFileGrantIsRefusedWhereSecretsAreNotEncryptedAtRest(@TempDir Path directory) {
        Path platform = Examples.write(
                directory,
                "platform.intent.yml",
                Examples.read("platform/platform.intent.yml")
                        .replace("secretsEncryption: true", "secretsEncryption: false"));
        List<Path> unencrypted = new java.util.ArrayList<>(WORKED.subList(1, WORKED.size()));
        unencrypted.add(0, platform);

        assertThat(Pipeline.check(unencrypted))
                .extracting(Diagnostic::code, Diagnostic::document, Diagnostic::path)
                .containsExactlyInAnyOrder(
                        tuple(
                                "E_SECRETS_AT_REST_REQUIRED",
                                "data.project.yml",
                                "/applications/0/processes/0/secrets/0"),
                        tuple("E_SECRETS_AT_REST_REQUIRED", "knowledge.project.yml", "/secrets/0"),
                        tuple("E_SECRETS_AT_REST_REQUIRED", "knowledge.project.yml", "/secrets/1"),
                        tuple(
                                "E_SECRETS_AT_REST_REQUIRED",
                                "knowledge.project.yml",
                                "/applications/0/processes/0/secrets/0"),
                        tuple(
                                "E_SECRETS_AT_REST_REQUIRED",
                                "knowledge.project.yml",
                                "/applications/1/processes/0/secrets/0"));
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
                        .replace("traefik: traefik-lan", "traefik: notes")
                        .replace(
                                "machinery: [traefik-public, traefik-lan, flagger, release-gate]", "machinery: [notes]")
                        .replace("gate: release-gate", "gate: notes")
                        .replace("secretStore: vault", "secretStore: notes")
                        .replaceFirst(TELEMETRY, "\n")
                        .replaceFirst(API_ACCESS, "\n"));

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
                        .replace("traefik: traefik-lan", "traefik: knowledge")
                        .replace(
                                "machinery: [traefik-public, traefik-lan, flagger, release-gate]",
                                "machinery: [knowledge]")
                        .replace("gate: release-gate", "gate: knowledge")
                        .replace("secretStore: vault", "secretStore: knowledge")
                        .replaceFirst(TELEMETRY, "\n")
                        .replaceFirst(API_ACCESS, "\n"));
        Path knowledge = Examples.write(
                directory,
                "knowledge.project.yml",
                Examples.read("knowledge/knowledge.project.yml").replace("audience: authenticated", "audience: lan"));

        // knowledge stands in for the machinery here, and a changelog on the machinery is its own refusal.
        assertThat(Pipeline.check(List.of(platform, knowledge)).stream()
                        .filter(refusal -> refusal.code().equals("E_NO_TIER_FOR_AUDIENCE")))
                .extracting(Diagnostic::code, Diagnostic::path)
                .containsExactly(
                        tuple("E_NO_TIER_FOR_AUDIENCE", "/applications/0/exposure/0/routes/0"),
                        tuple("E_NO_TIER_FOR_AUDIENCE", "/applications/0/exposure/0/routes/1"),
                        tuple("E_NO_TIER_FOR_AUDIENCE", "/applications/0/exposure/0/routes/2"),
                        tuple("E_NO_TIER_FOR_AUDIENCE", "/applications/0/exposure/0/routes/3"));
    }

    @Test
    void aHolderOfApiAccessIsRefusedWhereNoProjectFileDeclaresIt(@TempDir Path directory) {
        Path platform = Examples.write(
                directory,
                "platform.intent.yml",
                Examples.read("platform/platform.intent.yml")
                        .replace("holders: [flagger, release-gate, collector]", "holders: [flagger, gone]"));
        List<Path> admitted = new java.util.ArrayList<>(WORKED.subList(1, WORKED.size()));
        admitted.add(0, platform);

        // `gone` is declared nowhere, and the Release Gate and the Collector declare access the
        // platform no longer admits.
        assertThat(Pipeline.check(admitted))
                .extracting(Diagnostic::code, Diagnostic::document, Diagnostic::path)
                .containsExactlyInAnyOrder(
                        tuple("E_UNKNOWN_API_HOLDER", "platform.intent.yml", "/apiAccess"),
                        tuple("E_PROCESS_RBAC_GRANT", "delivery.project.yml", "/applications/1/processes/0/api"),
                        tuple("E_PROCESS_RBAC_GRANT", "delivery.project.yml", "/applications/2/processes/0/api"));
    }

    @Test
    void anIdTwoApplicationsCarryAdmitsNeitherToHoldApiAccess(@TempDir Path directory) {
        Path impostor = Examples.write(
                directory,
                "impostor.project.yml",
                Examples.read("refusals/process-rbac-grant/refusals.project.yml")
                        .replace("id: edge-proxy", "id: flagger"));
        List<Path> doubled = new java.util.ArrayList<>(WORKED);
        doubled.add(impostor);

        // The platform admits `flagger` by id, and nothing says which of the two it meant.
        assertThat(Pipeline.check(doubled).stream()
                        .filter(refusal -> refusal.code().equals("E_PROCESS_RBAC_GRANT")))
                .extracting(Diagnostic::document, Diagnostic::path)
                .containsExactlyInAnyOrder(
                        tuple("delivery.project.yml", "/applications/0/processes/0/api"),
                        tuple("impostor.project.yml", "/applications/0/processes/0/api"));
    }

    @Test
    void theFoundationsNamesAreRefusedWhereNoProjectFileDeclaresThem() {
        assertThat(Pipeline.check(WORKED.stream()
                        .filter(path -> !path.toString().contains("/edge/")
                                && !path.toString().contains("/observability/"))
                        .toList()))
                .extracting(Diagnostic::code, Diagnostic::path)
                .contains(
                        tuple("E_UNKNOWN_TIER_PROXY", "/tiers/0"),
                        tuple("E_UNKNOWN_TIER_PROXY", "/tiers/1"),
                        tuple("E_UNKNOWN_MACHINERY", "/delivery"),
                        tuple("E_UNKNOWN_TELEMETRY_COLLECTOR", "/telemetry"),
                        tuple("E_UNKNOWN_METRICS_STACK", "/telemetry"));
    }
}
