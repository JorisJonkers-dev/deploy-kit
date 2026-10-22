package dev.jorisjonkers.deploykit.emf.cli;

import static org.assertj.core.api.Assertions.assertThat;

import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.AdapterName;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.BackupPlan;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.CatalogJobFile;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.Deliverable;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.IdentityFile;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.MigrationFile;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.NamespaceFile;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.PolicyJobFile;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedApplication;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedCatalogJob;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeploymentFactory;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedMigration;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedPolicyJob;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedProcess;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedVolume;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.VaultRoleFile;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.junit.jupiter.api.Test;

// deploy-kit#573: one owner per path (spec/v1/30-deliverables.md#path-allocation), refused as the
// production implementation refuses it, with E_PATH_COLLISION and no document.
class CollisionsTest {

    private static final ResolvedDeploymentFactory MODEL = ResolvedDeploymentFactory.eINSTANCE;

    private static ResolvedDeployment planning(Deliverable... deliverables) {
        ResolvedDeployment deployment = MODEL.createResolvedDeployment();
        deployment.getDeliverables().addAll(List.of(deliverables));
        return deployment;
    }

    private static NamespaceFile namespace(String path, AdapterName adapter) {
        NamespaceFile file = MODEL.createNamespaceFile();
        file.setPath(path);
        file.setAdapter(adapter);
        file.setNamespace("notes-system");
        return file;
    }

    private static VaultRoleFile role(String path) {
        VaultRoleFile file = MODEL.createVaultRoleFile();
        file.setPath(path);
        file.setAdapter(AdapterName.VAULT_POLICY);
        file.setNamespace("a-system");
        file.setIdentity("c");
        return file;
    }

    /** A deployment holding one Application of one Process, and the file of that Process's account. */
    private static ResolvedDeployment accountOf(String application, String path) {
        ResolvedDeployment deployment = MODEL.createResolvedDeployment();
        ResolvedApplication app = MODEL.createResolvedApplication();
        app.setId(application);
        app.setNamespace("notes-system");
        ResolvedProcess process = MODEL.createResolvedProcess();
        process.setName("api");
        app.getProcesses().add(process);
        deployment.getApplications().add(app);
        IdentityFile file = MODEL.createIdentityFile();
        file.setPath(path);
        file.setAdapter(AdapterName.KUBERNETES);
        file.getProcesses().add(process);
        deployment.getDeliverables().add(file);
        return deployment;
    }

    private static List<List<String>> triples(List<Diagnostic> diagnostics) {
        return diagnostics.stream()
                .map(diagnostic -> Arrays.asList(diagnostic.code(), diagnostic.document(), diagnostic.path()))
                .toList();
    }

    @Test
    void refusesTwoVaultDocumentsOfOneNameInTwoProjects() {
        // a-system + system-c and a-system-system + c are one Vault name.
        List<Diagnostic> found = Collisions.of(List.of(
                planning(role("apps/a/vault-policy/policies/a-system-system-c.role.json")),
                planning(role("apps/a-system/vault-policy/policies/a-system-system-c.role.json"))));

        assertThat(triples(found)).containsExactly(Arrays.asList("E_PATH_COLLISION", null, ""));
        assertThat(found.get(0).message()).contains("a-system-system-c.role.json");
    }

    @Test
    void refusesOnePathTwoAdaptersClaim() {
        assertThat(triples(Collisions.of(List.of(planning(
                        namespace("apps/notes/namespace.yaml", AdapterName.KUBERNETES),
                        namespace("apps/notes/namespace.yaml", AdapterName.NETWORKING))))))
                .containsExactly(Arrays.asList("E_PATH_COLLISION", null, ""));
    }

    @Test
    void refusesTwoAccountsOfOneNameInOneNamespace() {
        List<Diagnostic> found = Collisions.of(List.of(
                accountOf("notes", "apps/notes/notes/serviceaccount.yaml"),
                accountOf("notes-web", "apps/notes/notes-web/serviceaccount.yaml")));

        assertThat(triples(found)).containsExactly(Arrays.asList("E_PATH_COLLISION", null, ""));
        assertThat(found.get(0).message()).contains("notes-system/api");
    }

    @Test
    void acceptsTheEstateShareEveryReaderPlansAlikeAndDistinctPaths() {
        assertThat(Collisions.of(List.of(
                        planning(
                                role("estate/vso-secrets/policies/data-system-postgres-catalog.role.json"),
                                namespace("apps/notes/namespace.yaml", AdapterName.KUBERNETES)),
                        planning(
                                role("estate/vso-secrets/policies/data-system-postgres-catalog.role.json"),
                                namespace("apps/auth/namespace.yaml", AdapterName.KUBERNETES)))))
                .isEmpty();
    }

    @Test
    void namesEveryAccountADerivedIdentityHoldsBesideAProcesssOwn() {
        ResolvedDeployment deployment = accountOf("notes", "apps/notes/notes/serviceaccount.yaml");
        ResolvedApplication app = deployment.getApplications().get(0);
        ResolvedProcess process = app.getProcesses().get(0);
        // The first volume derives no backup; the second's identity is the account.
        process.getVolumes().add(MODEL.createResolvedVolume());
        ResolvedVolume backed = MODEL.createResolvedVolume();
        BackupPlan backup = MODEL.createBackupPlan();
        backup.setIdentity("api-backup");
        backed.setBackup(backup);
        process.getVolumes().add(backed);
        ResolvedMigration migration = MODEL.createResolvedMigration();
        migration.setIdentity("notes-migration");
        app.setMigration(migration);
        MigrationFile migrating = MODEL.createMigrationFile();
        migrating.setPath("apps/notes/notes/migration.yaml");
        migrating.setAdapter(AdapterName.KUBERNETES);
        migrating.setApplication(app);
        ResolvedPolicyJob job = MODEL.createResolvedPolicyJob();
        job.setIdentity("api-backup");
        ResolvedCatalogJob catalog = MODEL.createResolvedCatalogJob();
        catalog.setIdentity("notes-migration");
        catalog.setNamespace("notes-system");
        deployment
                .getDeliverables()
                .addAll(List.of(
                        migrating,
                        policyJob(job, "apps/notes/vault-policy/serviceaccount.yaml", "serviceaccount"),
                        policyJob(job, "apps/notes/vault-policy/configmap.yaml", "configmap"),
                        catalogJob(catalog, "apps/notes/postgres-catalog.yaml", "objects"),
                        catalogJob(catalog, "apps/notes/postgres-catalog-cronjob.yaml", "cronjob")));

        assertThat(Collisions.of(List.of(deployment)))
                .extracting(Diagnostic::message)
                .containsExactly(
                        "the ServiceAccount notes-system/api-backup is claimed by"
                                + " apps/notes/notes/serviceaccount.yaml and apps/notes/vault-policy/serviceaccount.yaml",
                        "the ServiceAccount notes-system/notes-migration is claimed by"
                                + " apps/notes/notes/migration.yaml and apps/notes/postgres-catalog.yaml");
    }

    private static PolicyJobFile policyJob(ResolvedPolicyJob job, String path, String part) {
        PolicyJobFile file = MODEL.createPolicyJobFile();
        file.setPath(path);
        file.setAdapter(AdapterName.KUBERNETES);
        file.setNamespace("notes-system");
        file.setPart(part);
        file.setJob(job);
        return file;
    }

    private static CatalogJobFile catalogJob(ResolvedCatalogJob job, String path, String part) {
        CatalogJobFile file = MODEL.createCatalogJobFile();
        file.setPath(path);
        file.setAdapter(AdapterName.KUBERNETES);
        file.setPart(part);
        file.setJob(job);
        return file;
    }

    @Test
    void aRefusalThatNamesNoDocumentLeavesTheDocumentOutOfItsTriple() {
        assertThat(Outputs.triples(List.of(new Diagnostic("E_PATH_COLLISION", null, "", "two owners"))))
                .containsExactly(new TreeMap<>(Map.of("code", "E_PATH_COLLISION", "path", "")));
    }
}
