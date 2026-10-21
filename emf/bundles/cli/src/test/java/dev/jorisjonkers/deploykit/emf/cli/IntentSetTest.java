package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.groups.Tuple.tuple;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
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
    void theEnvFilesBesideAProjectFileReachTheProcessesTheyName() {
        assertThat(Pipeline.check(List.of(
                        Examples.of("refusals/unbound-secret-grant/platform.intent.yml"),
                        Examples.of("refusals/unbound-secret-grant/refusals.project.yml"))))
                .extracting(Diagnostic::code, Diagnostic::path)
                .containsExactly(tuple("E_UNBOUND_SECRET_GRANT", "/applications/0/processes/0"));
    }

    @Test
    void anAssetIsReadOnlyFromBelowItsProjectsDirectory(@TempDir Path directory) throws IOException {
        Path project = Files.createDirectories(directory.resolve("project"));
        Files.writeString(directory.resolve("outside.conf"), "a = 1\n");
        String notes = Examples.read("minimal/notes.project.yml")
                .replace(
                        "        cutover: continuous",
                        "        assets:\n          - { from: FROM, mountAt: /etc/a.conf }\n        cutover: continuous");

        for (String from :
                List.of("../outside.conf", directory.resolve("outside.conf").toString())) {
            assertThat(Pipeline.check(
                            List.of(Examples.write(project, "notes.project.yml", notes.replace("FROM", from)))))
                    .as(from)
                    .extracting(Diagnostic::code)
                    .containsExactly("E_ASSET_NOT_FOUND");
        }
    }

    @Test
    void anEnvFileThatCannotBeReadIsAnErrorRatherThanARefusal(@TempDir Path directory) throws IOException {
        Path project = Examples.write(directory, "notes.project.yml", Examples.read("minimal/notes.project.yml"));
        Path env = Files.createDirectories(directory.resolve("env/notes-api"));
        Path unreadable = Files.writeString(env.resolve("base.env"), "A=1\n");
        Files.setPosixFilePermissions(unreadable, PosixFilePermissions.fromString("---------"));

        assertThatThrownBy(() -> Pipeline.check(List.of(project))).isInstanceOf(UncheckedIOException.class);
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
                        .replace("traefik: edge/traefik-public", "traefik: notes/notes")
                        .replace("traefik: edge/traefik-lan", "traefik: notes/notes")
                        .replace(
                                "machinery: [edge/traefik-public, edge/traefik-lan, delivery/flagger, delivery/release-gate]",
                                "machinery: [notes/notes]")
                        .replace("gate: delivery/release-gate", "gate: notes/notes")
                        .replace("reporter: delivery/reporter", "reporter: notes/notes")
                        .replace("secretStore: secrets/vault", "secretStore: notes/notes")
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
                        .replace("traefik: edge/traefik-public", "traefik: knowledge/knowledge")
                        .replace("traefik: edge/traefik-lan", "traefik: knowledge/knowledge")
                        .replace(
                                "machinery: [edge/traefik-public, edge/traefik-lan, delivery/flagger, delivery/release-gate]",
                                "machinery: [knowledge/knowledge]")
                        .replace("gate: delivery/release-gate", "gate: knowledge/knowledge")
                        .replace("reporter: delivery/reporter", "reporter: knowledge/knowledge")
                        .replace("secretStore: secrets/vault", "secretStore: knowledge/knowledge")
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
                        .replace(
                                "holders: [delivery/flagger, delivery/release-gate, delivery/collector, delivery/reporter]",
                                "holders: [delivery/flagger, delivery/gone]"));
        List<Path> admitted = new java.util.ArrayList<>(WORKED.subList(1, WORKED.size()));
        admitted.add(0, platform);

        // `gone` is declared nowhere, and the Release Gate, the Collector and the Reporter declare
        // access the platform no longer admits.
        assertThat(Pipeline.check(admitted))
                .extracting(Diagnostic::code, Diagnostic::document, Diagnostic::path)
                .containsExactlyInAnyOrder(
                        tuple("E_UNKNOWN_API_HOLDER", "platform.intent.yml", "/apiAccess"),
                        tuple("E_PROCESS_RBAC_GRANT", "delivery.project.yml", "/applications/1/processes/0/api"),
                        tuple("E_PROCESS_RBAC_GRANT", "delivery.project.yml", "/applications/2/processes/0/api"),
                        tuple("E_PROCESS_RBAC_GRANT", "delivery.project.yml", "/applications/3/processes/0/api"));
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

    @Test
    void anAttachmentToAVpnThePlatformDoesNotRunIsRefusedAndOneItRunsIsNot(@TempDir Path directory) {
        String fixture = "refusals/no-vpn-policy/";
        String platform = Examples.read(fixture + "platform.intent.yml");
        Path project = Examples.of(fixture + "refusals.project.yml");

        assertThat(Pipeline.check(List.of(Examples.of(fixture + "platform.intent.yml"), project)))
                .extracting(Diagnostic::code, Diagnostic::document, Diagnostic::path)
                .containsExactly(tuple("E_NO_VPN_POLICY", "refusals.project.yml", "/applications/0/processes/0/vpn"));
        assertThat(Pipeline.check(List.of(
                        Examples.write(
                                directory,
                                "platform.intent.yml",
                                platform
                                        + "vpn:\n  image: gluetun\n  credential: secret/data/platform/vpn\n"
                                        + "  memory: 128Mi\n  cpu: 50m\n"),
                        project)))
                .isEmpty();
    }

    @Test
    void aVpnSettingTheRenderDerivesIsASchemaRefusal(@TempDir Path directory) {
        String platform = Examples.read("refusals/no-vpn-policy/platform.intent.yml")
                + "vpn:\n  image: gluetun\n  credential: secret/data/platform/vpn\n"
                + "  memory: 128Mi\n  cpu: 50m\n  settings:\n    VPN_PORT_FORWARDING: \"on\"\n";

        assertThat(Pipeline.check(List.of(Examples.write(directory, "platform.intent.yml", platform))))
                .extracting(Diagnostic::code, Diagnostic::path)
                .containsExactly(tuple("schema", "/vpn"));
    }

    /** The library-not-granted fixture, its Platform document's grant written as {@code grant}. */
    private static List<Path> granting(Path directory, String grant, String mount) {
        String fixture = "refusals/library-not-granted/";
        return List.of(
                Examples.write(
                        directory,
                        "platform.intent.yml",
                        Examples.read(fixture + "platform.intent.yml").replace("refusals: read", grant)),
                Examples.write(
                        directory,
                        "refusals.project.yml",
                        Examples.read(fixture + "refusals.project.yml").replace("access: write", mount)));
    }

    @Test
    void aLibraryIsMountedOnlyForWhatItGrantsTheProject(@TempDir Path directory) {
        String at = "/applications/0/processes/0/libraries/0";

        assertThat(Pipeline.check(granting(directory, "refusals: write", "access: write")))
                .isEmpty();
        assertThat(Pipeline.check(granting(directory, "refusals: read", "access: read")))
                .isEmpty();
        assertThat(Pipeline.check(granting(directory, "jellyfin: write", "access: read")))
                .extracting(Diagnostic::code, Diagnostic::document, Diagnostic::path)
                .containsExactly(tuple("E_LIBRARY_NOT_GRANTED", "refusals.project.yml", at));
    }

    @Test
    void aLibraryOutsideAnAbsoluteDirectoryOrAMountClimbingOutOfOneIsASchemaRefusal(@TempDir Path directory) {
        String platform = Examples.read("refusals/library-not-granted/platform.intent.yml");
        String project = Examples.read("refusals/library-not-granted/refusals.project.yml");

        assertThat(Pipeline.check(List.of(Examples.write(
                        directory, "platform.intent.yml", platform.replace("path: /srv/media", "path: /srv/../etc")))))
                .extracting(Diagnostic::code, Diagnostic::path)
                .containsExactly(tuple("schema", "/libraries/media"));
        assertThat(Pipeline.check(List.of(
                        Examples.write(directory, "platform.intent.yml", platform.replace("gid: 3001", "gid: 0")))))
                .extracting(Diagnostic::code, Diagnostic::path)
                .containsExactly(tuple("schema", "/libraries/media"));
        assertThat(Pipeline.check(List.of(Examples.write(
                        directory, "refusals.project.yml", project.replace("subPath: Photos", "subPath: ../Photos")))))
                .extracting(Diagnostic::code, Diagnostic::path)
                .containsExactly(tuple("schema", "/applications/0/processes/0/libraries/0"));
    }
}
