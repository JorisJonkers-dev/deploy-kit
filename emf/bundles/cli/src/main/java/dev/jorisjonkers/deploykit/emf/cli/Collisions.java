package dev.jorisjonkers.deploykit.emf.cli;

import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.Deliverable;
import dev.jorisjonkers.deploykit.emf.metamodel.resolveddeployment.ResolvedDeployment;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * One owner per path (spec/v1/30-deliverables.md#path-allocation): two Deliverables may never claim
 * one path, no two documents one Vault name, and no two objects one ServiceAccount, since a Vault
 * role is bound to the account's name and namespace alone. Every collision is refused before
 * anything is written.
 */
final class Collisions {

    static final String PATH_COLLISION = "E_PATH_COLLISION";

    /**
     * The estate-scoped share: each Project's resolution plans the files of it its own model names,
     * so a render of several Projects plans one such file once for each of them.
     */
    private static final String ESTATE = "estate/";

    /** Where a Vault document lands: a policies directory, under the name Vault holds it by. */
    private static final Pattern VAULT_DOCUMENT = Pattern.compile("/policies/([^/]+\\.(?:policy|role)\\.json)$");

    /** A ServiceAccount as the templates write one: its kind, then its metadata's name and namespace. */
    private static final Pattern ACCOUNT = Pattern.compile(
            "(?m)^ *kind: ServiceAccount\\n( *)metadata:\\n((?:\\1  .*\\n)+)");

    private static final Pattern NAME = Pattern.compile("(?m)^ *name: (.+)$");
    private static final Pattern NAMESPACE = Pattern.compile("(?m)^ *namespace: (.+)$");

    private Collisions() {}

    /** Every path and every Vault name of the Deliverables {@code deployments} plan, owned twice. */
    static List<Diagnostic> ofPlan(List<ResolvedDeployment> deployments) {
        Map<String, Collection<String>> owners = new TreeMap<>();
        Map<String, Collection<String>> names = new TreeMap<>();
        for (ResolvedDeployment deployment : deployments) {
            for (Deliverable deliverable : deployment.getDeliverables()) {
                String path = deliverable.getPath();
                owners.computeIfAbsent(path, key -> key.startsWith(ESTATE) ? new LinkedHashSet<>() : new ArrayList<>())
                        .add(deliverable.getAdapter().getLiteral());
                Matcher vault = VAULT_DOCUMENT.matcher(path);
                if (vault.find()) {
                    names.computeIfAbsent(vault.group(1), key -> new LinkedHashSet<>()).add(path);
                }
            }
        }
        List<Diagnostic> refused = new ArrayList<>();
        names.forEach((name, paths) -> {
            if (paths.size() > 1) {
                refused.add(refusal("the Vault name " + name + " is claimed by " + String.join(" and ", paths)));
            }
        });
        owners.forEach((path, adapters) -> {
            if (adapters.size() > 1) {
                refused.add(refusal(path + " is claimed by " + String.join(" and ", adapters)));
            }
        });
        return refused;
    }

    /** Every ServiceAccount the files written under {@code root} hold, held by two of them. */
    static List<Diagnostic> ofAccounts(Path root) {
        Map<String, List<String>> accounts = new TreeMap<>();
        try (Stream<Path> files = Files.walk(root)) {
            for (Path file : files.filter(Files::isRegularFile).sorted().toList()) {
                String text = Files.readString(file, StandardCharsets.UTF_8);
                Matcher account = ACCOUNT.matcher(text);
                while (account.find()) {
                    String metadata = account.group(2);
                    accounts.computeIfAbsent(
                                    value(NAMESPACE, metadata) + "/" + value(NAME, metadata), key -> new ArrayList<>())
                            .add(root.relativize(file).toString());
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        List<Diagnostic> refused = new ArrayList<>();
        accounts.forEach((account, paths) -> {
            if (paths.size() > 1) {
                refused.add(refusal("the ServiceAccount " + account + " is claimed by " + String.join(" and ", paths)));
            }
        });
        return refused;
    }

    private static String value(Pattern key, String metadata) {
        Matcher matcher = key.matcher(metadata);
        return matcher.find() ? matcher.group(1).strip() : "";
    }

    private static Diagnostic refusal(String message) {
        return new Diagnostic(PATH_COLLISION, "", "", message);
    }
}
