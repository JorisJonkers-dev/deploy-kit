package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.AdapterName;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.NamespaceFile;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentFactory;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** One owner per path, Vault name and ServiceAccount (spec/v1/30-deliverables.md#path-allocation). */
class CollisionsTest {

    /** A deployment planning one file at each of {@code paths}, every one written by {@code adapter}. */
    private static ResolvedDeployment planning(AdapterName adapter, String... paths) {
        ResolvedDeployment deployment = ResolvedDeploymentFactory.eINSTANCE.createResolvedDeployment();
        for (String path : paths) {
            NamespaceFile file = ResolvedDeploymentFactory.eINSTANCE.createNamespaceFile();
            file.setPath(path);
            file.setAdapter(adapter);
            deployment.getDeliverables().add(file);
        }
        return deployment;
    }

    private static List<String> messages(List<Diagnostic> refused) {
        assertThat(refused).allSatisfy(diagnostic -> {
            assertThat(diagnostic.code()).isEqualTo("E_PATH_COLLISION");
            assertThat(diagnostic.document()).isEmpty();
            assertThat(diagnostic.path()).isEmpty();
        });
        return refused.stream().map(Diagnostic::message).toList();
    }

    @Test
    void aPlanWhoseEveryPathHasOneOwnerHoldsNoCollision() {
        assertThat(Collisions.ofPlan(List.of(
                        planning(AdapterName.KUBERNETES, "apps/a/namespace.yaml"),
                        planning(AdapterName.KUBERNETES, "apps/b/namespace.yaml"))))
                .isEmpty();
    }

    @Test
    void aPathTwoDeliverablesClaimIsRefusedWithBothOwners() {
        assertThat(messages(Collisions.ofPlan(List.of(
                        planning(AdapterName.KUBERNETES, "apps/a/namespace.yaml"),
                        planning(AdapterName.TRAEFIK, "apps/a/namespace.yaml")))))
                .containsExactly("apps/a/namespace.yaml is claimed by kubernetes and traefik");
        assertThat(messages(Collisions.ofPlan(
                        List.of(planning(AdapterName.KUBERNETES, "apps/a/x.yaml", "apps/a/x.yaml")))))
                .containsExactly("apps/a/x.yaml is claimed by kubernetes and kubernetes");
    }

    @Test
    void anEstateFileEveryProjectPlansIsOneFileUnlessTwoAdaptersWriteIt() {
        String estate = "estate/priority-classes/priorityclasses.yaml";
        assertThat(Collisions.ofPlan(List.of(
                        planning(AdapterName.KUBERNETES, estate), planning(AdapterName.KUBERNETES, estate))))
                .isEmpty();
        assertThat(messages(Collisions.ofPlan(List.of(
                        planning(AdapterName.KUBERNETES, estate), planning(AdapterName.VSO, estate)))))
                .containsExactly(estate + " is claimed by kubernetes and vso");
    }

    @Test
    void aVaultNameTwoDocumentsClaimIsRefusedWithBothPaths() {
        assertThat(messages(Collisions.ofPlan(List.of(planning(
                        AdapterName.VAULT_POLICY,
                        "apps/a-b/policies/a-b-c.policy.json",
                        "apps/a/policies/a-b-c.policy.json",
                        "apps/a/policies/a-b-c.role.json")))))
                .containsExactly(
                        "the Vault name a-b-c.policy.json is claimed by apps/a-b/policies/a-b-c.policy.json"
                                + " and apps/a/policies/a-b-c.policy.json");
        assertThat(Collisions.ofPlan(List.of(planning(
                        AdapterName.VAULT_POLICY, "apps/a/policies/x.policy.json", "apps/a/policies/x.policy.json.bak"))))
                .isEmpty();
    }

    @Test
    void aServiceAccountTwoFilesHoldIsRefusedWithBothFiles(@TempDir Path root) throws IOException {
        write(root, "apps/a/identity.yaml", account("a", "notes-system"));
        write(root, "apps/a/backup.yaml", "---\napiVersion: batch/v1\nkind: CronJob\n" + account("a", "notes-system"));
        write(root, "apps/b/identity.yaml", account("a", "other-system"));

        assertThat(messages(Collisions.ofAccounts(root)))
                .containsExactly("the ServiceAccount notes-system/a is claimed by apps/a/backup.yaml"
                        + " and apps/a/identity.yaml");
    }

    @Test
    void aServiceAccountIsReadAtAnyIndentationAndOnlyFromItsOwnMetadata(@TempDir Path root) throws IOException {
        write(root, "apps/a/one.yaml", indented(account("a", "ns")) + "kind: ConfigMap\nmetadata:\n  name: a\n");
        write(root, "apps/a/two.yaml", "kind: ServiceAccount\nmetadata:\n  labels:\n    x: y\n  namespace: ns\n  name: a\n");

        assertThat(messages(Collisions.ofAccounts(root)))
                .containsExactly("the ServiceAccount ns/a is claimed by apps/a/one.yaml and apps/a/two.yaml");
    }

    @Test
    void aServiceAccountWithoutANameOrNamespaceIsKeyedByWhatItHolds(@TempDir Path root) throws IOException {
        write(root, "a.yaml", "kind: ServiceAccount\nmetadata:\n  labels:\n    x: y\n");
        write(root, "b.yaml", "kind: ServiceAccount\nmetadata:\n  labels:\n    z: w\n");

        assertThat(messages(Collisions.ofAccounts(root))).containsExactly("the ServiceAccount / is claimed by a.yaml and b.yaml");
    }

    @Test
    void aTreeThatCannotBeReadIsAnErrorRatherThanARefusal(@TempDir Path root) {
        assertThatThrownBy(() -> Collisions.ofAccounts(root.resolve("missing")))
                .isInstanceOf(UncheckedIOException.class);
    }

    private static String account(String name, String namespace) {
        return "kind: ServiceAccount\nmetadata:\n  name: " + name + "\n  namespace: " + namespace + "\n";
    }

    private static String indented(String text) {
        return text.lines().map(line -> "  " + line + "\n").reduce("", String::concat);
    }

    private static void write(Path root, String path, String text) throws IOException {
        Path file = root.resolve(path);
        Files.createDirectories(file.getParent());
        Files.writeString(file, text);
    }
}
