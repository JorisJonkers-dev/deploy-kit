package dev.jorisjonkers.deploykit.emf.syntax.values;

import org.eclipse.xtext.common.services.DefaultTerminalConverters;
import org.eclipse.xtext.conversion.IValueConverter;
import org.eclipse.xtext.conversion.ValueConverter;
import org.eclipse.xtext.conversion.ValueConverterException;
import org.eclipse.xtext.nodemodel.INode;

/** What the authored text of a scalar means: quotes are syntax, and a boolean is a boolean. */
public class ProjectIntentValueConverters extends DefaultTerminalConverters {

    @ValueConverter(rule = "Text")
    public IValueConverter<String> text() {
        return new IValueConverter<>() {
            @Override
            public String toValue(String string, INode node) {
                return unquote(string);
            }

            @Override
            public String toString(String value) {
                return value;
            }
        };
    }

    @ValueConverter(rule = "Bool")
    public IValueConverter<Boolean> bool() {
        return new IValueConverter<>() {
            @Override
            public Boolean toValue(String string, INode node) throws ValueConverterException {
                if (!"true".equals(string) && !"false".equals(string)) {
                    throw new ValueConverterException(string + " is not true or false", node, null);
                }
                return Boolean.valueOf(string);
            }

            @Override
            public String toString(Boolean value) {
                return value.toString();
            }
        };
    }

    /** The text of a quoted scalar without its quotes; a plain scalar unchanged. */
    static String unquote(String text) {
        boolean quoted = text.length() > 1
                && (text.charAt(0) == '"' || text.charAt(0) == '\'')
                && text.charAt(text.length() - 1) == text.charAt(0);
        return quoted ? text.substring(1, text.length() - 1) : text;
    }
}
