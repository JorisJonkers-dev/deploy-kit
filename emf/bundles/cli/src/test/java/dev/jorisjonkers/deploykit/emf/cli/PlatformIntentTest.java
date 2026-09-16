package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.groups.Tuple.tuple;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * REQ-030 (docs/requirements.md): the authored Platform document parses to its intent, and a tier that
 * carries the authenticated audience without an endpoint to authenticate it is refused.
 */
class PlatformIntentTest {

    private static final String WORKED = Examples.read("platform/platform.intent.yml");

    @Test
    void aPlatformDocumentParsesAndATierWithoutItsEndpointIsRefused(@TempDir Path directory) {
        Parsed parsed = Pipeline.intent(Examples.of("platform/platform.intent.yml"));
        Parsed refused = Pipeline.intent(
                Examples.write(directory, "platform.intent.yml", WORKED.replaceFirst("\n\\s+forwardAuth: [^\n]*", "")));

        assertThat(parsed.diagnostics()).isEmpty();
        assertThat(refused.diagnostics())
                .extracting(Diagnostic::code, Diagnostic::document, Diagnostic::path)
                .containsExactly(tuple("E_NO_FORWARD_AUTH_ENDPOINT", "platform.intent.yml", "/tiers/0"));
    }

    @Test
    void aTiersProxyReadAloneIsWrittenAsTheNameTheDocumentGaveIt(@TempDir Path directory) {
        Parsed quoted = Pipeline.intent(Examples.write(
                directory, "platform.intent.yml", WORKED.replace("traefik: traefik-lan", "traefik: 'traefik-lan'")));

        assertThat(tiers(quoted))
                .extracting(tier -> tier.get("traefik"))
                .containsExactly("traefik-public", "traefik-lan");
    }

    @Test
    void aQuotedScalarHoldsTheColonsAPlainOneCannot() {
        Parsed parsed = Pipeline.intent(Examples.of("platform/platform.intent.yml"));

        assertThat(parsed.intent().get("metadata"))
                .asInstanceOf(org.assertj.core.api.InstanceOfAssertFactories.MAP)
                .containsEntry("cluster", "production")
                .extractingByKey("nodeContract")
                .asString()
                .startsWith("sha256:6f1c");
        assertThat(tiers(parsed).get(0))
                .containsEntry("forwardAuth", "http://auth-api.auth-system.svc.cluster.local:8081/api/auth/forward");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> tiers(Parsed parsed) {
        return (List<Map<String, Object>>) parsed.intent().get("tiers");
    }
}
