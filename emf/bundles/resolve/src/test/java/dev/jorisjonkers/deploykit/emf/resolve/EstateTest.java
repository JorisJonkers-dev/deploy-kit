package dev.jorisjonkers.deploykit.emf.resolve;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.AdapterName;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.Deliverable;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.IndexFile;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.PolicyDocument;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.PolicyJobFile;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentFactory;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedGrant;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedPolicyJob;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.VaultPolicyFile;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.VaultRoleFile;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The estate-wide pass plans the Vault policy job over every project rendered together
 * (spec/v1/30-deliverables.md#vault-configuration-is-rendered-not-applied): handed each project's
 * documents as canonical JSON, named by their digest, and planned once.
 */
class EstateTest {

    private static final ResolvedDeploymentFactory MODEL = ResolvedDeploymentFactory.eINSTANCE;

    private static ResolvedPolicyJob job(String image) {
        ResolvedPolicyJob job = MODEL.createResolvedPolicyJob();
        job.setIdentity("vault-policy");
        job.setNamespace("secrets-system");
        job.setImage(image);
        return job;
    }

    /** A project's document: its job, and one identity's policy over a kv grant and its role. */
    private static ResolvedDeployment holding(String identity, ResolvedPolicyJob job) {
        ResolvedDeployment deployment = MODEL.createResolvedDeployment();
        deployment.setPolicyJob(job);
        if (identity != null) {
            ResolvedGrant grant = MODEL.createResolvedGrant();
            grant.setPath("secret/data/platform/" + identity);
            VaultPolicyFile policy = MODEL.createVaultPolicyFile();
            policy.setPath("apps/vso-secrets/policies/data-system-" + identity + ".policy.json");
            policy.setNamespace("data-system");
            policy.setIdentity(identity);
            policy.getGrants().add(grant);
            VaultRoleFile role = MODEL.createVaultRoleFile();
            role.setPath("apps/vso-secrets/policies/data-system-" + identity + ".role.json");
            role.setNamespace("data-system");
            role.setIdentity(identity);
            deployment.getDeliverables().addAll(List.of(policy, role));
        }
        return deployment;
    }

    private static List<PolicyJobFile> planned(ResolvedDeployment deployment) {
        return deployment.getDeliverables().stream()
                .filter(PolicyJobFile.class::isInstance)
                .map(PolicyJobFile.class::cast)
                .toList();
    }

    @Test
    void theJobIsPlannedOnceOverEveryProjectsDocumentsAndNamedByTheirDigest() {
        ResolvedDeployment first = holding("valkey", job("vault-policy@sha256:1"));
        ResolvedDeployment second = holding("postgres", job("vault-policy@sha256:1"));

        Estate.plan(List.of(first, second));

        List<PolicyJobFile> files = planned(first);
        assertThat(planned(second)).isEmpty();
        assertThat(files)
                .extracting(Deliverable::getPath, Deliverable::getAdapter)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(
                                "apps/vso-secrets/configmap.yaml", AdapterName.VAULT_POLICY),
                        org.assertj.core.groups.Tuple.tuple("apps/vso-secrets/job.yaml", AdapterName.VAULT_POLICY),
                        org.assertj.core.groups.Tuple.tuple(
                                "apps/vso-secrets/serviceaccount.yaml", AdapterName.VAULT_POLICY),
                        org.assertj.core.groups.Tuple.tuple(
                                "apps/vso-secrets/networkpolicy.yaml", AdapterName.NETWORKING));
        // Both projects' documents, in name order, each as canonical JSON.
        assertThat(files.get(0).getDocuments())
                .extracting(PolicyDocument::getFile, PolicyDocument::getJson)
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(
                                "data-system-postgres.policy.json",
                                "{\"path\":{\"secret/data/platform/postgres\":{\"capabilities\":[\"read\"]},"
                                        + "\"secret/metadata/platform/postgres\":{\"capabilities\":[\"read\"]}}}"),
                        org.assertj.core.groups.Tuple.tuple(
                                "data-system-postgres.role.json",
                                "{\"bound_service_account_names\":[\"postgres\"],"
                                        + "\"bound_service_account_namespaces\":[\"data-system\"],"
                                        + "\"token_policies\":[\"data-system-postgres\"]}"),
                        org.assertj.core.groups.Tuple.tuple(
                                "data-system-valkey.policy.json",
                                "{\"path\":{\"secret/data/platform/valkey\":{\"capabilities\":[\"read\"]},"
                                        + "\"secret/metadata/platform/valkey\":{\"capabilities\":[\"read\"]}}}"),
                        org.assertj.core.groups.Tuple.tuple(
                                "data-system-valkey.role.json",
                                "{\"bound_service_account_names\":[\"valkey\"],"
                                        + "\"bound_service_account_namespaces\":[\"data-system\"],"
                                        + "\"token_policies\":[\"data-system-valkey\"]}"));
        assertThat(files).allSatisfy(file -> {
            assertThat(file.getName()).matches("vault-policy-[0-9a-f]{12}");
            assertThat(file.getName()).isEqualTo(files.get(0).getName());
            assertThat(file.getJob()).isSameAs(first.getPolicyJob());
        });
        // The index applies the job's objects and not its policy.
        assertThat(first.getDeliverables().stream()
                        .filter(IndexFile.class::isInstance)
                        .map(IndexFile.class::cast)
                        .toList())
                .singleElement()
                .satisfies(index -> {
                    assertThat(index.getPath()).isEqualTo("apps/vso-secrets/kustomization.yaml");
                    assertThat(index.getResources())
                            .containsExactly("configmap.yaml", "job.yaml", "serviceaccount.yaml");
                });
    }

    @Test
    void aChangedDocumentIsANewName() {
        ResolvedDeployment one = holding("postgres", job("vault-policy@sha256:1"));
        ResolvedDeployment other = holding("valkey", job("vault-policy@sha256:1"));

        Estate.plan(List.of(one));
        Estate.plan(List.of(other));

        assertThat(planned(one).get(0).getName())
                .isNotEqualTo(planned(other).get(0).getName());
    }

    @Test
    void noJobIsPlannedWhereThePlatformNamesNoneOrTheRenderHoldsNoDocument() {
        ResolvedDeployment unnamed = holding("postgres", null);
        ResolvedDeployment empty = holding(null, job("vault-policy@sha256:1"));

        Estate.plan(List.of(unnamed));
        Estate.plan(List.of(empty));

        assertThat(unnamed.getDeliverables()).hasSize(2);
        assertThat(empty.getDeliverables()).isEmpty();
    }

    @Test
    void projectsThatCarryDifferentJobsStopTheRun() {
        ResolvedDeployment one = holding("postgres", job("vault-policy@sha256:1"));
        ResolvedDeployment other = holding("valkey", job("vault-policy@sha256:2"));

        assertThatThrownBy(() -> Estate.plan(List.of(one, other)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("the projects of one render carry different Vault policy jobs");
    }
}
