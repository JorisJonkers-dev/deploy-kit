package dev.jorisjonkers.deploykit.emf.metamodel.json;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Writes a JSON value in the RFC 8785 canonical form the parity contract compares oracle files in:
 * object keys sorted by UTF-16 code units, numbers as ECMAScript formats a double, no insignificant
 * whitespace. A value is a {@link Map} with string keys, a {@link List}, a {@link String}, a {@link
 * Boolean}, a {@link Double}, or an integral {@link Integer}, {@link Long}, {@link Short} or {@link
 * Byte}. An absent optional field is absent, so {@code null} is refused rather than written.
 */
public final class CanonicalJson {

    private static final long MAX_SAFE_INTEGER = 9_007_199_254_740_991L;

    private CanonicalJson() {}

    /** The canonical serialisation of {@code value}. */
    public static String write(Object value) {
        StringBuilder out = new StringBuilder();
        append(out, value, "");
        return out.toString();
    }

    private static void append(StringBuilder out, Object value, String pointer) {
        switch (value) {
            case null ->
                throw new IllegalArgumentException(
                        "null at " + pointer + ": an absent optional field is absent, never null");
            case Map<?, ?> map -> appendObject(out, map, pointer);
            case List<?> list -> appendArray(out, list, pointer);
            case String text -> appendString(out, text, pointer);
            case Boolean bool -> out.append(bool);
            case Double number -> out.append(formatDouble(number, pointer));
            case Integer number -> out.append(number);
            case Short number -> out.append(number);
            case Byte number -> out.append(number);
            case Long number -> out.append(checkSafe(number, pointer));
            default ->
                throw new IllegalArgumentException(
                        value.getClass().getName() + " at " + pointer + " is not a JSON value");
        }
    }

    private static void appendObject(StringBuilder out, Map<?, ?> map, String pointer) {
        List<String> keys = new ArrayList<>(map.size());
        for (Object key : map.keySet()) {
            if (!(key instanceof String text)) {
                throw new IllegalArgumentException("object key at " + pointer + " is not a string");
            }
            keys.add(text);
        }
        keys.sort(String::compareTo);
        out.append('{');
        String separator = "";
        for (String key : keys) {
            out.append(separator);
            appendString(out, key, pointer);
            out.append(':');
            append(out, map.get(key), pointer + "/" + escapePointer(key));
            separator = ",";
        }
        out.append('}');
    }

    private static void appendArray(StringBuilder out, List<?> list, String pointer) {
        out.append('[');
        for (int i = 0; i < list.size(); i++) {
            if (i > 0) {
                out.append(',');
            }
            append(out, list.get(i), pointer + "/" + i);
        }
        out.append(']');
    }

    private static void appendString(StringBuilder out, String text, String pointer) {
        out.append('"');
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (Character.isHighSurrogate(c) && i + 1 < text.length() && Character.isLowSurrogate(text.charAt(i + 1))) {
                out.append(c).append(text.charAt(++i));
            } else if (Character.isSurrogate(c)) {
                throw new IllegalArgumentException("string at " + pointer + " holds a lone surrogate at index " + i);
            } else {
                appendChar(out, c);
            }
        }
        out.append('"');
    }

    private static void appendChar(StringBuilder out, char c) {
        switch (c) {
            case '"' -> out.append("\\\"");
            case '\\' -> out.append("\\\\");
            case '\b' -> out.append("\\b");
            case '\f' -> out.append("\\f");
            case '\n' -> out.append("\\n");
            case '\r' -> out.append("\\r");
            case '\t' -> out.append("\\t");
            default -> {
                if (c < 0x20) {
                    out.append(String.format("\\u%04x", (int) c));
                } else {
                    out.append(c);
                }
            }
        }
    }

    private static long checkSafe(long number, String pointer) {
        if (Math.abs(number) > MAX_SAFE_INTEGER) {
            throw new IllegalArgumentException(
                    number + " at " + pointer + " is outside the range a JSON number carries exactly");
        }
        return number;
    }

    /** ECMAScript Number::toString over the shortest decimal that round-trips the double. */
    private static String formatDouble(double value, String pointer) {
        if (Double.isNaN(value) || Double.isInfinite(value)) {
            throw new IllegalArgumentException(value + " at " + pointer + " is not a JSON number");
        }
        if (value == 0.0) {
            return "0";
        }
        // Double.toString yields the shortest round-tripping decimal (JDK 19 and later), except that
        // it never prints fewer than two significant digits; one digit may still round-trip.
        BigDecimal decimal = new BigDecimal(Double.toString(Math.abs(value))).stripTrailingZeros();
        BigDecimal oneDigit = decimal.round(new MathContext(1, RoundingMode.HALF_EVEN));
        if (oneDigit.doubleValue() == Math.abs(value)) {
            decimal = oneDigit.stripTrailingZeros();
        }
        String digits = decimal.unscaledValue().toString();
        int k = digits.length();
        int n = decimal.precision() - decimal.scale();
        String sign = Double.toString(value).startsWith("-") ? "-" : "";
        if (n > 21 || n <= -6) {
            String exponent = Integer.toString(n - 1);
            String mantissa = k == 1 ? digits : digits.charAt(0) + "." + digits.substring(1);
            return sign + mantissa + "e" + (exponent.startsWith("-") ? exponent : "+" + exponent);
        }
        if (n <= 0) {
            return sign + "0." + "0".repeat(-n) + digits;
        }
        if (n >= k) {
            return sign + digits + "0".repeat(n - k);
        }
        return sign + digits.substring(0, n) + "." + digits.substring(n);
    }

    private static String escapePointer(String segment) {
        return segment.replace("~", "~0").replace("/", "~1");
    }
}
