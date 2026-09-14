package dev.jorisjonkers.deploykit.emf.parity;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * The two ledgers the model-driven build holds itself to, checked against the repository they
 * describe. Each check returns every violation it finds, never only the first.
 */
public final class Ledgers {

    private static final Pattern REQUIREMENT_ROW =
            Pattern.compile("^\\|\\s*(REQ-\\d{3})\\s*\\|.*\\[[^]]*]\\(\\.\\./([^)]+)\\)\\s*\\|\\s*$");
    private static final Pattern WITNESS_ROW =
            Pattern.compile("^\\|\\s*(REQ-\\d{3})\\s*\\|\\s*`([A-Za-z0-9_]+)#([A-Za-z0-9_]+)`\\s*\\|\\s*$");
    private static final Pattern RULE_ROW =
            Pattern.compile("^\\|\\s*(EMF-\\d{3})\\s*\\|\\s*[^|]+\\|\\s*`([^`]+)`\\s*\\|\\s*`([^`]+)`\\s*\\|\\s*$");
    private static final Pattern STATED = Pattern.compile("holds \\*\\*(\\d+)\\*\\*");

    private Ledgers() {}

    /**
     * The witness list: every behaviour ledger row proved by a test under {@code test/model/} names a
     * JUnit test here, and every witness names a real model row and a real test method.
     */
    public static List<String> checkWitnesses(Path repository) {
        List<String> errors = new ArrayList<>();
        Set<String> modelRows = new HashSet<>();
        for (String line : lines(repository.resolve("docs/requirements.md"))) {
            Matcher row = REQUIREMENT_ROW.matcher(line);
            if (row.matches() && row.group(2).startsWith("test/model/")) {
                modelRows.add(row.group(1));
            }
        }
        Path witnesses = repository.resolve("emf/docs/witnesses.md");
        Map<String, String> listed = new LinkedHashMap<>();
        List<String> text = lines(witnesses);
        for (String line : text) {
            Matcher row = WITNESS_ROW.matcher(line);
            if (!row.matches()) {
                continue;
            }
            String id = row.group(1);
            if (listed.put(id, row.group(2) + "#" + row.group(3)) != null) {
                errors.add(id + ": listed twice");
            }
            if (!modelRows.contains(id)) {
                errors.add(id + ": names no model behaviour row in docs/requirements.md");
            }
            if (!testMethodExists(repository.resolve("emf"), row.group(2), row.group(3))) {
                errors.add(id + ": names " + row.group(2) + "#" + row.group(3) + ", which is not a test in emf/");
            }
        }
        for (String id : modelRows) {
            if (!listed.containsKey(id)) {
                errors.add(id + ": is a model behaviour with no witness in emf/docs/witnesses.md");
            }
        }
        checkStatedCount(text, listed.size(), "emf/docs/witnesses.md", errors);
        return errors;
    }

    /**
     * The rule ledger: every row names a file under {@code emf/} that exists and still contains the
     * witness literal that enforces the rule.
     */
    public static List<String> checkRules(Path repository) {
        List<String> errors = new ArrayList<>();
        Path emf = repository.resolve("emf");
        List<String> text = lines(emf.resolve("docs/rules.md"));
        Set<String> ids = new HashSet<>();
        int rows = 0;
        for (String line : text) {
            Matcher row = RULE_ROW.matcher(line);
            if (!row.matches()) {
                continue;
            }
            rows++;
            String id = row.group(1);
            if (!ids.add(id)) {
                errors.add(id + ": listed twice");
            }
            Path enforcer = emf.resolve(row.group(2)).normalize();
            if (!enforcer.startsWith(emf) || !Files.isRegularFile(enforcer)) {
                errors.add(id + ": names enforcer " + row.group(2) + ", which is not a file in emf/");
            } else if (!read(enforcer).contains(row.group(3))) {
                errors.add(id + ": " + row.group(2) + " no longer contains `" + row.group(3) + "`");
            }
        }
        checkStatedCount(text, rows, "emf/docs/rules.md", errors);
        return errors;
    }

    private static void checkStatedCount(List<String> text, int rows, String file, List<String> errors) {
        Matcher stated = STATED.matcher(String.join("\n", text));
        if (!stated.find()) {
            errors.add(file + ": states no row count");
        } else if (Integer.parseInt(stated.group(1)) != rows) {
            errors.add(file + ": states " + stated.group(1) + " rows but holds " + rows);
        }
    }

    private static boolean testMethodExists(Path emf, String className, String method) {
        try (Stream<Path> files = io(() -> Files.walk(emf))) {
            return files.filter(p -> p.toString().contains("src/test/java"))
                    .filter(p -> p.getFileName().toString().equals(className + ".java"))
                    .anyMatch(p -> read(p).matches("(?s).*\\bvoid " + Pattern.quote(method) + "\\s*\\(.*"));
        }
    }

    private static List<String> lines(Path file) {
        return read(file).lines().toList();
    }

    private static String read(Path file) {
        return io(() -> Files.readString(file));
    }

    /** An IO action whose failure is a broken repository, reported rather than declared. */
    @FunctionalInterface
    private interface Io<T> {
        T get() throws IOException;
    }

    private static <T> T io(Io<T> action) {
        try {
            return action.get();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
