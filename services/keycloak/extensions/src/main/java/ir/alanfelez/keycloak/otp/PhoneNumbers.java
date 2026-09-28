package ir.alanfelez.keycloak.otp;

import java.util.Optional;
import java.util.regex.Pattern;

/** Normalises Iranian mobile numbers. Only Iranian mobiles are accepted (SECURITY.md §4). */
public final class PhoneNumbers {

    private static final Pattern IR_MOBILE_E164 = Pattern.compile("^\\+989\\d{9}$");

    private PhoneNumbers() {
    }

    /**
     * Accepts 09121234567, 9121234567, 989121234567, +989121234567, 00989121234567, with Persian/Arabic digits,
     * spaces or dashes, and returns the E.164 form {@code +989121234567}.
     */
    public static Optional<String> normalize(String input) {
        if (input == null) {
            return Optional.empty();
        }
        StringBuilder digits = new StringBuilder();
        boolean plus = false;
        for (char c : input.strip().toCharArray()) {
            char d = toAsciiDigit(c);
            if (d != 0) {
                digits.append(d);
            } else if (c == '+' && digits.isEmpty()) {
                plus = true;
            } else if (c != ' ' && c != '-' && c != '(' && c != ')') {
                return Optional.empty();
            }
        }
        String s = digits.toString();
        String national; // 9xxxxxxxxx
        if (s.startsWith("0098")) {
            national = s.substring(4);
        } else if (s.startsWith("98") && (plus || s.length() == 12)) {
            national = s.substring(2);
        } else if (s.startsWith("0")) {
            national = s.substring(1);
        } else {
            national = s;
        }
        String e164 = "+98" + national;
        return IR_MOBILE_E164.matcher(e164).matches() ? Optional.of(e164) : Optional.empty();
    }

    /** The username stored in Keycloak: national format 09xxxxxxxxx (digits only, easy to type and search). */
    public static String toUsername(String e164) {
        return "0" + e164.substring(3);
    }

    /** Masks a number for display and logs: +98912***4567. */
    public static String mask(String e164) {
        return e164.substring(0, 6) + "***" + e164.substring(e164.length() - 4);
    }

    /** Converts Persian/Arabic digits to ASCII; other characters are kept. */
    public static String normalizeDigits(String s) {
        StringBuilder sb = new StringBuilder(s.length());
        for (char c : s.toCharArray()) {
            char d = toAsciiDigit(c);
            sb.append(d != 0 ? d : c);
        }
        return sb.toString();
    }

    private static char toAsciiDigit(char c) {
        if (c >= '0' && c <= '9') {
            return c;
        }
        if (c >= '۰' && c <= '۹') { // Persian ۰-۹
            return (char) ('0' + (c - '۰'));
        }
        if (c >= '٠' && c <= '٩') { // Arabic-Indic ٠-٩
            return (char) ('0' + (c - '٠'));
        }
        return 0;
    }
}
