package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.AdapterName;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.NamespaceFile;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentFactory;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.TreeMap;
import org.eclipse.emf.common.util.URI;
import org.eclipse.emf.ecore.resource.Resource;
import org.eclipse.emf.ecore.util.EcoreUtil;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** The stage harness's comparator, held to the differences it exists to report (Comparison). */
class ComparisonTest {

    private static final String WORKLOAD = """
            # GENERATED. Never hand-edit.
            ---
            apiVersion: apps/v1
            kind: Deployment
            spec:
              template:
                spec:
                  containers:
                    - name: api
                      env:
                        - name: MODE
                          value: "true"
                        - name: LEVEL
                          value: info
            ---
            apiVersion: v1
            kind: Service
            """;

    @Test
    void oneChangedFieldIsReportedAtItsPathWithBothValues() {
        assertThat(Comparison.yaml("workload.yaml", WORKLOAD, WORKLOAD.replace("value: info", "value: debug")))
                .containsExactly(
                        "workload.yaml#1 .spec.template.spec.containers[name=\"api\"].env[name=\"LEVEL\"].value: expected"
                                + " \"info\", got \"debug\"");
        assertThat(Comparison.json("intent.json", "{\"owner\":\"joris\"}", "{\"owner\":\"someone-else\"}"))
                .containsExactly("intent.json .owner: expected \"joris\", got \"someone-else\"");
    }

    @Test
    void anExtraKeyAndAMissingKeyAreEachReported() {
        assertThat(Comparison.json("intent.json", "{\"a\":1,\"b\":2}", "{\"a\":1,\"c\":[3],\"d.e\":{}}"))
                .containsExactly(
                        "intent.json .b: missing (expected 2)",
                        "intent.json .c: extra (got a list of 1)",
                        "intent.json [\"d.e\"]: extra (got a map of 0)");
    }

    @Test
    void aQuotedScalarAndAPlainOneDifferByTypeUnderAYaml11Reader() {
        assertThat(Comparison.yaml("workload.yaml", WORKLOAD, WORKLOAD.replace("value: \"true\"", "value: true")))
                .containsExactly(
                        "workload.yaml#1 .spec.template.spec.containers[name=\"api\"].env[name=\"MODE\"].value: expected \"true\""
                                + " (string), got true (boolean)");
        // YAML 1.1 reads `on` as a boolean and `0755` as an octal integer: neither is a string.
        assertThat(Comparison.yaml("x.yaml", "a: \"on\"\nb: \"0755\"\n", "a: on\nb: 0755\n"))
                .containsExactly(
                        "x.yaml#1 .a: expected \"on\" (string), got true (boolean)",
                        "x.yaml#1 .b: expected \"0755\" (string), got 493 (integer)");
    }

    @Test
    void aReorderedKeyPassesByContentAndFailsByBytesAsFormattingOnly() {
        String reordered = WORKLOAD.replace("apiVersion: v1\nkind: Service", "kind: Service\napiVersion: v1");

        assertThat(Comparison.yaml("workload.yaml", WORKLOAD, reordered)).isEmpty();
        assertThat(Comparison.files("workload.yaml", URI.createURI("workload.yaml"), utf8(WORKLOAD), utf8(reordered)))
                .containsExactly("workload.yaml: formatting only (quoting, indentation or key order); line 16:"
                        + " expected \"apiVersion: v1\", got \"kind: Service\"");
        assertThat(Comparison.files("x.json", URI.createURI("x.json"), utf8("{\"a\":1}"), utf8("{\"a\":1}\n")))
                .containsExactly("x.json: formatting only (quoting, indentation or key order); line endings or the"
                        + " final line break");
        assertThat(Comparison.files("x.json", URI.createURI("x.json"), utf8("{\"a\":1}"), utf8("{\n\"a\":1}")))
                .containsExactly("x.json: formatting only (quoting, indentation or key order); line 1: expected"
                        + " \"{\\\"a\\\":1}\", got \"{\"");
    }

    @Test
    void everyDifferenceIsReportedNotOnlyTheFirst() {
        String changed = WORKLOAD.replace("name: api", "name: web")
                .replace("value: info", "value: debug")
                .replace("kind: Service", "kind: Service\nmetadata: {}");

        assertThat(Comparison.yaml("workload.yaml", WORKLOAD, changed)).hasSize(3);
    }

    @Test
    void aMissingOrExtraDocumentOrListItemIsReported() {
        String one = "---\na: [1, 2]\n";
        String two = "---\na: [1]\n---\nb: 1\n";

        assertThat(Comparison.yaml("x.yaml", one, two))
                .containsExactly("x.yaml#1 .a[1]: missing (expected 2)", "x.yaml#2: extra document");
        assertThat(Comparison.yaml("x.yaml", two, one))
                .containsExactly("x.yaml#1 .a[1]: extra (got 2)", "x.yaml#2: missing document");
        assertThat(Comparison.yaml("x.yaml", "a: 1.0\n", "a: 1\n"))
                .containsExactly("x.yaml#1 .a: expected 1.0 (float), got 1 (integer)");
        assertThat(Comparison.json("x.json", "{\"a\":1}", "{\"a\":1.0}"))
                .containsExactly("x.json .a: expected 1 (integer), got 1.0 (float)");
        assertThat(Comparison.yaml("x.yaml", "true: 1\n", "\"true\": 1\n"))
                .containsExactly("x.yaml#1 [true]: missing (expected 1)", "x.yaml#1 .true: extra (got 1)");
    }

    @Test
    void aListOfNamedItemsIsComparedByNameSoOneInsertionIsOneDifference() {
        String expected = "{\"env\":[{\"name\":\"A\",\"value\":\"1\"},{\"name\":\"B\",\"value\":\"2\"}]}";

        assertThat(Comparison.json("x.json", expected, expected.replace("[{", "[{\"name\":\"N\"},{")))
                .containsExactly("x.json .env[name=\"N\"]: extra (got a map of 1)");
        assertThat(Comparison.json(
                        "x.json",
                        expected,
                        "{\"env\":[{\"name\":\"B\",\"value\":\"3\"},{\"name\":\"C\",\"value\":\"1\"}]}"))
                .containsExactly(
                        "x.json .env[name=\"A\"]: missing (expected a map of 2)",
                        "x.json .env[name=\"B\"].value: expected \"2\", got \"3\"",
                        "x.json .env[name=\"C\"]: extra (got a map of 2)");
        assertThat(Comparison.json(
                        "x.json",
                        expected,
                        "{\"env\":[{\"name\":\"B\",\"value\":\"2\"},{\"name\":\"A\",\"value\":\"1\"}]}"))
                .containsExactly("x.json .env: order differs by name: expected [A, B], got [B, A]");
        // A name two items share names neither, so the list is compared by position.
        assertThat(Comparison.json("x.json", "[{\"name\":\"A\"},{\"name\":\"A\"}]", "[{\"name\":\"A\"}]"))
                .containsExactly("x.json [1]: missing (expected a map of 1)");
    }

    @Test
    void aFileThatDoesNotParseIsOneDifference() {
        assertThat(Comparison.json("x.json", "{", "{}"))
                .singleElement()
                .asString()
                .startsWith("x.json: not JSON: ");
        assertThat(Comparison.yaml("x.yaml", "a: [", "a: 1"))
                .singleElement()
                .asString()
                .startsWith("x.yaml: not YAML");
        assertThat(Comparison.xmi("x.xmi", URI.createURI("x.xmi"), utf8("<"), utf8("<")))
                .singleElement()
                .asString()
                .startsWith("x.xmi: not XMI");
    }

    @Test
    void aFileOfAnotherFormatIsComparedByItsBytesAlone() {
        assertThat(Comparison.files("a.conf", URI.createURI("a.conf"), utf8("x\n"), utf8("x\n")))
                .isEmpty();
        assertThat(Comparison.files("a.conf", URI.createURI("a.conf"), utf8("x\n"), utf8("y\n")))
                .containsExactly(
                        "a.conf: formatting only (quoting, indentation or key order); line 1: expected \"x\", got \"y\"");
    }

    @Test
    void aMissingOrExtraFileInATreeIsReported(@TempDir Path expected) throws IOException {
        Files.writeString(expected.resolve("kept.yaml"), "a: 1\n");
        Files.writeString(expected.resolve("gone.yaml"), "a: 1\n");
        Files.writeString(expected.resolve("README.md"), "not part of the tree");
        Map<String, byte[]> written = new TreeMap<>();
        written.put("kept.yaml", utf8("a: 2\n"));
        written.put("new.yaml", utf8("a: 1\n"));

        assertThat(Comparison.trees(expected, written))
                .containsExactly(
                        "gone.yaml: missing file", "kept.yaml#1 .a: expected 1, got 2", "new.yaml: extra file");
        assertThat(Comparison.read(expected.resolve("absent"))).isEmpty();
    }

    @Test
    void anXmiModelIsWalkedFeatureByFeatureAndEqualityHelperDecides() throws IOException {
        URI uri = URI.createURI("file:/stages/render/x/expected/notes.resolveddeployment");
        byte[] expected = xmi(uri, deployment("notes-system", 1));
        byte[] renamed = xmi(uri, deployment("other-system", 1));
        byte[] longer = xmi(uri, deployment("notes-system", 2));

        assertThat(Comparison.xmi("m.xmi", uri, expected, xmi(uri, deployment("notes-system", 1))))
                .isEmpty();
        assertThat(Comparison.xmi("m.xmi", uri, expected, renamed))
                .containsExactly("m.xmi#1 .deliverables[0].namespace: expected \"notes-system\", got \"other-system\"");
        assertThat(Comparison.xmi("m.xmi", uri, expected, longer))
                .containsExactly("m.xmi#1 .deliverables[1]: extra (got NamespaceFile -> apps/notes/namespace.yaml)");
        assertThat(Comparison.xmi("m.xmi", uri, longer, expected))
                .containsExactly(
                        "m.xmi#1 .deliverables[1]: missing (expected NamespaceFile -> apps/notes/namespace.yaml)");
    }

    @Test
    void anXmiFeatureSetOnOneSideOnlyAndAMissingRootAreReported() throws IOException {
        URI uri = URI.createURI("file:/stages/x.xmi");
        ResolvedDeployment unset = deployment("notes-system", 1);
        ((NamespaceFile) unset.getDeliverables().get(0)).setNamespace(null);
        ResolvedDeployment other = ResolvedDeploymentFactory.eINSTANCE.createResolvedDeployment();

        assertThat(Comparison.xmi("m.xmi", uri, xmi(uri, deployment("notes-system", 1)), xmi(uri, unset)))
                .singleElement()
                .asString()
                .isEqualTo("m.xmi#1 .deliverables[0].namespace: expected set \"notes-system\", got unset null");
        assertThat(Comparison.xmi("m.xmi", uri, xmi(uri, other, other), xmi(uri, other)))
                .containsExactly("m.xmi#2: missing root");
        assertThat(Comparison.xmi("m.xmi", uri, xmi(uri, other), xmi(uri, other, other)))
                .containsExactly("m.xmi#2: extra root");
    }

    private static ResolvedDeployment deployment(String namespace, int files) {
        ResolvedDeploymentFactory model = ResolvedDeploymentFactory.eINSTANCE;
        ResolvedDeployment deployment = model.createResolvedDeployment();
        for (int i = 0; i < files; i++) {
            NamespaceFile file = model.createNamespaceFile();
            file.setPath("apps/notes/namespace.yaml");
            file.setAdapter(AdapterName.KUBERNETES);
            file.setNamespace(namespace);
            deployment.getDeliverables().add(file);
        }
        return deployment;
    }

    private static byte[] xmi(URI uri, ResolvedDeployment... roots) throws IOException {
        Resource resource = Stages.resources().createResource(uri);
        for (ResolvedDeployment root : roots) {
            resource.getContents().add(EcoreUtil.copy(root));
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        resource.save(out, null);
        return out.toByteArray();
    }

    private static byte[] utf8(String text) {
        return text.getBytes(StandardCharsets.UTF_8);
    }
}
