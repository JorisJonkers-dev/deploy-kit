package dev.jorisjonkers.deploykit.emf.cli;

import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.EnvFile;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.EnvLiteral;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.EnvValue;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.EnvVariable;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.Placeholder;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.PlaceholderKind;
import dev.jorisjonkers.deploykit.emf.metamodel.projectintent.ProjectIntentFactory;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The dotenv subset chapter 10 fixes, read into the model
 * (spec/v1/10-project-intent.md#the-dotenv-subset-that-is-read). A reader rather than a grammar, for
 * the reason emf/docs/adr/emf/0082-the-env-files-are-read-not-parsed-by-xtext.md records.
 */
public final class EnvFiles {

    /** Which level a scope directory names, and the name it names it by. */
    public record Scope(Level level, String name) {
        public enum Level {
            PROJECT,
            APPLICATION,
            PROCESS
        }
    }

    /** An authored env file, by the path that says which level it reaches. */
    public record Source(String path, String text) {}

    /** One file read, with the scope its directory put it in. */
    public record Scoped(String path, Scope scope, EnvFile file) {}

    /** What reading gave: the scoped files, or the diagnostics that refused them. */
    public record Read(List<Scoped> files, List<Diagnostic> diagnostics) {

        public Read {
            files = List.copyOf(files);
            diagnostics = List.copyOf(diagnostics);
        }

        public boolean ok() {
            return diagnostics.isEmpty();
        }
    }

    private static final ProjectIntentFactory MODEL = ProjectIntentFactory.eINSTANCE;
    private static final Pattern NAME = Pattern.compile("[A-Za-z_][A-Za-z0-9_]*");
    private static final String OPENS = "${";
    private static final String PROJECT_SCOPE = "_project";
    private static final String APPLICATION_SCOPE = "_applications";

    private EnvFiles() {}

    /** Every source read and scoped, or every line they break the subset on. */
    public static Read read(List<Source> sources) {
        List<Scoped> files = new ArrayList<>();
        List<Diagnostic> refusals = new ArrayList<>();
        for (Source source : sources) {
            Optional<Scope> scope = scopeOf(source.path());
            if (scope.isEmpty()) {
                refusals.add(schema(source.path(), source.path(), "this path names no env scope directory"));
                continue;
            }
            List<Diagnostic> broke = new ArrayList<>();
            EnvFile file = readOne(source, broke);
            if (broke.isEmpty()) {
                files.add(new Scoped(source.path(), scope.get(), file));
            } else {
                refusals.addAll(broke);
            }
        }
        return new Read(files, refusals);
    }

    /** The level {@code path}'s scope directory names, or nothing where it names none. */
    public static Optional<Scope> scopeOf(String path) {
        String[] segments = path.split("/");
        int env = List.of(segments).lastIndexOf("env");
        if (env < 0 || !path.endsWith(".env")) {
            return Optional.empty();
        }
        // A scope is a directory, so the file is one segment deeper than it, and one deeper
        // again where the Application scope names which Application.
        // The `.env` file is itself a segment after `env`, so `rest` is never empty here.
        String[] rest = Arrays.copyOfRange(segments, env + 1, segments.length);
        if (APPLICATION_SCOPE.equals(rest[0])) {
            return rest.length == 3 ? Optional.of(new Scope(Scope.Level.APPLICATION, rest[1])) : Optional.empty();
        }
        if (rest.length != 2) {
            return Optional.empty();
        }
        return Optional.of(
                PROJECT_SCOPE.equals(rest[0])
                        ? new Scope(Scope.Level.PROJECT, rest[0])
                        : new Scope(Scope.Level.PROCESS, rest[0]));
    }

    private static EnvFile readOne(Source source, List<Diagnostic> refusals) {
        EnvFile file = MODEL.createEnvFile();
        clusterOf(source.path()).ifPresent(file::setCluster);
        Set<String> seen = new LinkedHashSet<>();
        String[] lines = source.text().split("\n", -1);
        for (int i = 0; i < lines.length; i++) {
            String content = lines[i].trim();
            if (content.isEmpty() || content.startsWith("#")) {
                continue;
            }
            String at = source.path() + ":" + (i + 1);
            int equals = content.indexOf('=');
            String name = equals < 1 ? "" : content.substring(0, equals);
            if (equals < 1 || !NAME.matcher(name).matches()) {
                refusals.add(schema(source.path(), at, "a line is not a NAME=value assignment"));
                continue;
            }
            Optional<EnvValue> value = value(content.substring(equals + 1));
            if (value.isEmpty()) {
                refusals.add(schema(source.path(), at, "the value of " + name + " is outside the subset"));
                continue;
            }
            if (!seen.add(name)) {
                refusals.add(new Diagnostic(
                        "E_SHARED_DECLARATION_DUPLICATED", source.path(), at, name + " is set twice in one file"));
            }
            EnvVariable variable = MODEL.createEnvVariable();
            variable.setName(name);
            variable.setValue(value.get());
            file.getEntries().add(variable);
        }
        return file;
    }

    /**
     * A literal, or one placeholder with literal text after it, and never a secret with text after
     * it: a secret becomes one key of a Secret, and half a key is nothing.
     */
    private static Optional<EnvValue> value(String raw) {
        if (raw.startsWith(OPENS)) {
            int close = raw.indexOf('}');
            if (close == -1) {
                return Optional.empty();
            }
            // Split once: a source may hold colons, and the kind may hold none.
            String[] parts = raw.substring(OPENS.length(), close).split(":", 2);
            PlaceholderKind kind = parts.length == 2 ? PlaceholderKind.get(parts[0]) : null;
            String source = parts.length == 2 ? parts[1] : "";
            String suffix = raw.substring(close + 1);
            boolean whole = kind != PlaceholderKind.SECRET || suffix.isEmpty();
            if (kind == null || source.isEmpty() || !literal(suffix) || !whole) {
                return Optional.empty();
            }
            Placeholder placeholder = MODEL.createPlaceholder();
            placeholder.setKind(kind);
            placeholder.setSource(source);
            if (!suffix.isEmpty()) {
                placeholder.setSuffix(suffix);
            }
            return Optional.of(placeholder);
        }
        if (raw.isEmpty() || !literal(raw)) {
            return Optional.empty();
        }
        EnvLiteral literal = MODEL.createEnvLiteral();
        literal.setText(raw);
        return Optional.of(literal);
    }

    /** Literal text: no {@code #}, which is a comment wherever it appears, and no placeholder. */
    private static boolean literal(String text) {
        return !text.contains("#") && !text.contains(OPENS);
    }

    /** {@code base.env} does not vary, so it names no Cluster Target. */
    private static Optional<String> clusterOf(String path) {
        String file = path.substring(path.lastIndexOf('/') + 1).replaceFirst("\\.env$", "");
        return "base".equals(file) ? Optional.empty() : Optional.of(file);
    }

    private static Diagnostic schema(String document, String at, String message) {
        return new Diagnostic(Diagnostic.SCHEMA, document, at, message);
    }
}
