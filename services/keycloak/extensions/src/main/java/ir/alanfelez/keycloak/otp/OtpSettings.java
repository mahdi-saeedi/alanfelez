package ir.alanfelez.keycloak.otp;

import java.util.Map;
import org.keycloak.models.AuthenticatorConfigModel;

/**
 * Authenticator settings, editable per realm in the admin console (Authentication → flow → ⚙) or in the realm file.
 * Defaults follow SECURITY.md §4.
 */
public record OtpSettings(
        int codeLength,
        int ttlSeconds,
        int maxAttempts,
        int resendCooldownSeconds,
        int maxSendsPerPhonePerHour,
        String smsProvider,
        String messageTemplate) {

    public static final String CODE_LENGTH = "codeLength";
    public static final String TTL_SECONDS = "ttlSeconds";
    public static final String MAX_ATTEMPTS = "maxAttempts";
    public static final String RESEND_COOLDOWN_SECONDS = "resendCooldownSeconds";
    public static final String MAX_SENDS_PER_PHONE_PER_HOUR = "maxSendsPerPhonePerHour";
    public static final String SMS_PROVIDER = "smsProvider";
    public static final String MESSAGE_TEMPLATE = "messageTemplate";

    public static final OtpSettings DEFAULTS =
            new OtpSettings(6, 120, 5, 120, 5, "console", "کد ورود الان‌فلز: {code}");

    /** Environment variable that picks the SMS sender; set by the deployment (keycloak.otp.smsProvider in Helm values). */
    public static final String SMS_PROVIDER_ENV = "OTP_SMS_PROVIDER";

    /** Reads settings from the authenticator config, falling back to defaults for missing or invalid values. */
    public static OtpSettings from(AuthenticatorConfigModel model) {
        return from(model, System.getenv(SMS_PROVIDER_ENV));
    }

    /**
     * Like {@link #from(AuthenticatorConfigModel)}, with the deployment's SMS provider. When set it wins over the realm
     * config: the realm file is imported only once, so a realm created with "console" would otherwise keep it forever.
     */
    static OtpSettings from(AuthenticatorConfigModel model, String providerFromEnv) {
        Map<String, String> c = model == null || model.getConfig() == null ? Map.of() : model.getConfig();
        return new OtpSettings(
                intOr(c.get(CODE_LENGTH), DEFAULTS.codeLength(), 4, 10),
                intOr(c.get(TTL_SECONDS), DEFAULTS.ttlSeconds(), 30, 900),
                intOr(c.get(MAX_ATTEMPTS), DEFAULTS.maxAttempts(), 1, 10),
                intOr(c.get(RESEND_COOLDOWN_SECONDS), DEFAULTS.resendCooldownSeconds(), 10, 900),
                intOr(c.get(MAX_SENDS_PER_PHONE_PER_HOUR), DEFAULTS.maxSendsPerPhonePerHour(), 1, 50),
                strOr(providerFromEnv, strOr(c.get(SMS_PROVIDER), DEFAULTS.smsProvider())),
                strOr(c.get(MESSAGE_TEMPLATE), DEFAULTS.messageTemplate()));
    }

    /** Renders the SMS text for a code. */
    public String message(String code) {
        return messageTemplate.replace("{code}", code);
    }

    static int intOr(String v, int def, int min, int max) {
        if (v == null || v.isBlank()) {
            return def;
        }
        try {
            int n = Integer.parseInt(v.strip());
            return n < min || n > max ? def : n;
        } catch (NumberFormatException e) {
            return def;
        }
    }

    private static String strOr(String v, String def) {
        return v == null || v.isBlank() ? def : v;
    }
}
