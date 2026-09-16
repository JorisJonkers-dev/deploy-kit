package dev.jorisjonkers.deploykit.emf.cli;

import java.util.List;
import java.util.Map;

/**
 * The outcome of reading one authored document: the parsed intent as a JSON value, or the
 * diagnostics that refused it. One of the two is always empty.
 */
public record Parsed(Map<String, Object> intent, List<Diagnostic> diagnostics) {

    public Parsed {
        intent = Map.copyOf(intent);
        diagnostics = List.copyOf(diagnostics);
    }

    public static Parsed of(Map<String, Object> intent) {
        return new Parsed(intent, List.of());
    }

    public static Parsed refused(List<Diagnostic> diagnostics) {
        return new Parsed(Map.of(), diagnostics);
    }

    public boolean ok() {
        return diagnostics.isEmpty();
    }
}
