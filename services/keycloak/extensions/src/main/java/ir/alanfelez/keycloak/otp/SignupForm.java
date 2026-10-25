package ir.alanfelez.keycloak.otp;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The sign-up form shown once after the first SMS code (client, 2026-10-25): name or company, password and its repeat,
 * field of activity and acceptance of the terms are required; specialty metals, province, city and address are
 * optional. Options are stored as stable slugs; the theme shows their labels (apps/keycloak-theme/src/login/i18n.ts).
 * Pure: reading and checking only, so it is unit tested without Keycloak.
 */
public record SignupForm(
        String fullName,
        String password,
        String passwordConfirm,
        String activity,
        List<String> metals,
        String province,
        String city,
        String address,
        boolean termsAccepted) {

    public static final List<String> ACTIVITIES =
            List.of("trader", "producer", "industrial-consumer", "distributor", "recycler", "investor", "other");
    /** The site's metals (config/seed/reference/10-market.yaml). */
    public static final List<String> METALS = List.of("aluminum", "copper", "brass", "zinc", "lead", "iron", "cast-iron");
    /** Iran's 31 provinces. */
    public static final List<String> PROVINCES = List.of(
            "alborz", "ardabil", "azerbaijan-east", "azerbaijan-west", "bushehr", "chaharmahal-bakhtiari", "fars", "gilan",
            "golestan", "hamadan", "hormozgan", "ilam", "isfahan", "kerman", "kermanshah", "khorasan-north",
            "khorasan-razavi", "khorasan-south", "khuzestan", "kohgiluyeh-boyerahmad", "kurdistan", "lorestan", "markazi",
            "mazandaran", "qazvin", "qom", "semnan", "sistan-baluchestan", "tehran", "yazd", "zanjan");

    static final int NAME_MAX = 100;
    static final int CITY_MAX = 60;
    static final int ADDRESS_MAX = 300;

    /** Reads the posted form; text is trimmed, unknown metals are dropped. */
    public static SignupForm from(Map<String, List<String>> form) {
        List<String> metals = new ArrayList<>();
        for (String m : form.getOrDefault("metals", List.of())) {
            if (METALS.contains(m) && !metals.contains(m)) {
                metals.add(m);
            }
        }
        return new SignupForm(
                text(form, "fullName"), raw(form, "password"), raw(form, "passwordConfirm"), text(form, "activity"),
                metals, text(form, "province"), text(form, "city"), text(form, "address"),
                "on".equals(text(form, "terms")) || "true".equals(text(form, "terms")));
    }

    /**
     * Field → message key for every problem, in form order (empty = valid). The password policy itself (length, not the
     * username) is checked by Keycloak afterwards; here only presence and the repeat.
     */
    public Map<String, String> errors(boolean needPassword) {
        Map<String, String> e = new LinkedHashMap<>();
        if (fullName.isEmpty()) {
            e.put("fullName", "signupFullNameRequired");
        } else if (fullName.length() > NAME_MAX) {
            e.put("fullName", "signupTooLong");
        }
        if (needPassword) {
            if (password.isEmpty()) {
                e.put("password", "signupPasswordRequired");
            } else if (!password.equals(passwordConfirm)) {
                e.put("passwordConfirm", "signupPasswordMismatch");
            }
        }
        if (!ACTIVITIES.contains(activity)) {
            e.put("activity", "signupActivityRequired");
        }
        if (!province.isEmpty() && !PROVINCES.contains(province)) {
            e.put("province", "signupInvalidChoice");
        }
        if (city.length() > CITY_MAX) {
            e.put("city", "signupTooLong");
        }
        if (address.length() > ADDRESS_MAX) {
            e.put("address", "signupTooLong");
        }
        if (!termsAccepted) {
            e.put("terms", "signupTermsRequired");
        }
        return e;
    }

    private static String raw(Map<String, List<String>> form, String key) {
        List<String> v = form.get(key);
        return v == null || v.isEmpty() || v.get(0) == null ? "" : v.get(0);
    }

    private static String text(Map<String, List<String>> form, String key) {
        return raw(form, key).strip();
    }
}
