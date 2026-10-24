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
}
