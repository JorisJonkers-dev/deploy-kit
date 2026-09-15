package dev.jorisjonkers.deploykit.emf.cli;

/**
 * A refusal: the code the specification gives it, the file name of the authored document it points
 * into, the JSON Pointer of the authored value it concerns, and a message for a human. The code, the
 * document and the path are the parity contract's; the message is this implementation's own.
 */
public record Diagnostic(String code, String document, String path, String message) {

    /** The code every refusal of a document's shape carries, until a rule gives it its own. */
    public static final String SCHEMA = "schema";
}
