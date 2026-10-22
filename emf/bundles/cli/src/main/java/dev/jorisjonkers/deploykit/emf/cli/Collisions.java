package dev.jorisjonkers.deploykit.emf.cli;

import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.CatalogJobFile;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.Deliverable;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.IdentityFile;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.MigrationFile;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.PolicyJobFile;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedApplication;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedProcess;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedVolume;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * One owner per path (spec/v1/30-deliverables.md#path-allocation), over the Resolved Deployments
 * rendered together: no two Deliverables at one path, no two ServiceAccounts of one name, since a
 * Vault role binds an account's name and namespace, and no two Vault documents of one name, since
 * Vault holds every name in one place. Each is {@code E_PATH_COLLISION}, naming no document, as the
 * production implementation refuses it.
 */
final class Collisions {

    private static final String CODE = "E_PATH_COLLISION";

    /** Where the estate-scoped share lands, which every Project reading it plans alike. */
    private static final String ESTATE = "estate/";

    private static final Pattern VAULT_DOCUMENT = Pattern.compile(".*/policies/[^/]+\\.(policy|role)\\.json$");

    private Collisions() {}

    /** Every collision in the Deliverables {@code deployments} plan, in the order found. */
    static List<Diagnostic> of(List<ResolvedDeployment> deployments) {
        List<Deliverable> planned = new ArrayList<>();
        // Every Project that reads an estate-scoped share plans the same files, which the render
        // writes once, so a second planning of one is no second owner.
        Set<String> estate = new HashSet<>();
        for (ResolvedDeployment deployment : deployments) {
            for (Deliverable deliverable : deployment.getDeliverables()) {
                if (!deliverable.getPath().startsWith(ESTATE) || estate.add(deliverable.getPath())) {
                    planned.add(deliverable);
                }
            }
        }
        Map<String, List<String>> owners = new LinkedHashMap<>();
        Map<String, Set<String>> names = new LinkedHashMap<>();
        Map<String, Set<String>> accounts = new LinkedHashMap<>();
        for (Deliverable deliverable : planned) {
            String path = deliverable.getPath();
            owners.computeIfAbsent(path, key -> new ArrayList<>())
                    .add(deliverable.getAdapter().getLiteral());
            if (VAULT_DOCUMENT.matcher(path).matches()) {
                names.computeIfAbsent(path.substring(path.lastIndexOf('/') + 1), key -> new LinkedHashSet<>())
                        .add(path);
            }
            for (String account : accountsOf(deliverable)) {
                accounts.computeIfAbsent(account, key -> new LinkedHashSet<>()).add(path);
            }
        }
        List<Diagnostic> collisions = new ArrayList<>();
        names.forEach((name, paths) -> {
            if (paths.size() > 1) {
                collisions.add(refusal("the Vault name " + name + " is claimed by " + String.join(" and ", paths)));
            }
        });
        owners.forEach((path, adapters) -> {
            if (adapters.size() > 1) {
                collisions.add(refusal(path + " is claimed by " + String.join(" and ", adapters)));
            }
        });
        accounts.forEach((account, paths) -> {
            if (paths.size() > 1) {
                collisions.add(
                        refusal("the ServiceAccount " + account + " is claimed by " + String.join(" and ", paths)));
            }
        });
        return collisions;
    }

    /** The {@code <namespace>/<name>} of each ServiceAccount a Deliverable's file writes. */
    private static List<String> accountsOf(Deliverable deliverable) {
        List<String> accounts = new ArrayList<>();
        if (deliverable instanceof IdentityFile identities) {
            for (ResolvedProcess process : identities.getProcesses()) {
                String namespace = ((ResolvedApplication) process.eContainer()).getNamespace();
                accounts.add(namespace + "/" + process.getName());
                process.getVolumes().stream()
                        .map(ResolvedVolume::getBackup)
                        .filter(backup -> backup != null)
                        .findFirst()
                        .ifPresent(backup -> accounts.add(namespace + "/" + backup.getIdentity()));
            }
        } else if (deliverable instanceof MigrationFile migration) {
            ResolvedApplication application = migration.getApplication();
            accounts.add(application.getNamespace() + "/"
                    + application.getMigration().getIdentity());
        } else if (deliverable instanceof PolicyJobFile job && "serviceaccount".equals(job.getPart())) {
            accounts.add(job.getNamespace() + "/" + job.getJob().getIdentity());
        } else if (deliverable instanceof CatalogJobFile job && "objects".equals(job.getPart())) {
            accounts.add(job.getJob().getNamespace() + "/" + job.getJob().getIdentity());
        }
        return accounts;
    }

    private static Diagnostic refusal(String message) {
        return new Diagnostic(CODE, null, "", message);
    }
}
