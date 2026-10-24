package ir.alanfelez.keycloak.otp;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.keycloak.models.AuthenticatorConfigModel;

class OtpSettingsTest {

    private static AuthenticatorConfigModel config(Map<String, String> values) {
        AuthenticatorConfigModel m = new AuthenticatorConfigModel();
        m.setConfig(values);
        return m;
    }

    @Test
    void deploymentProviderWinsOverTheRealmConfig() {
        // A realm imported while staging used "console" keeps that value; the deployment switches it to sms.ir.
        assertEquals("smsir", OtpSettings.from(config(Map.of("smsProvider", "console")), "smsir").smsProvider());
    }

    @Test
    void realmConfigIsUsedWithoutTheEnvironmentVariable() {
        assertEquals("smsir", OtpSettings.from(config(Map.of("smsProvider", "smsir")), null).smsProvider());
        assertEquals("smsir", OtpSettings.from(config(Map.of("smsProvider", "smsir")), " ").smsProvider());
    }

    @Test
    void defaultsToConsoleWhenNothingIsSet() {
        assertEquals("console", OtpSettings.from(null, null).smsProvider());
    }

    @Test
    void deploymentTtlWinsAndBadValuesFallBack() {
        // Existing realms keep ttlSeconds 120 from their first import; the deployment sets 300 (client, 2026-10-24).
        assertEquals(300, OtpSettings.from(config(Map.of("ttlSeconds", "120")), null, "300").ttlSeconds());
        assertEquals(120, OtpSettings.from(config(Map.of("ttlSeconds", "120")), null, null).ttlSeconds());
        assertEquals(300, OtpSettings.from(config(Map.of("ttlSeconds", "120")), null, "5000").ttlSeconds()); // out of range → default
        assertEquals(120, OtpSettings.from(config(Map.of("ttlSeconds", "120")), null, "300").resendCooldownSeconds());
    }
}
