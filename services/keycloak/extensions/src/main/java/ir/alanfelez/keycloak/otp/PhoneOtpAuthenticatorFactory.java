package ir.alanfelez.keycloak.otp;

import java.util.List;
import org.keycloak.Config;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.models.AuthenticationExecutionModel.Requirement;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;
import org.keycloak.provider.ProviderConfigurationBuilder;

/** Registers the phone OTP authenticator ("alanfelez-phone-otp") and its admin-console settings. */
public class PhoneOtpAuthenticatorFactory implements AuthenticatorFactory {

    public static final String ID = "alanfelez-phone-otp";
    private static final PhoneOtpAuthenticator SINGLETON = new PhoneOtpAuthenticator();

    @Override
    public String getId() {
        return ID;
    }

    @Override
    public String getDisplayType() {
        return "Phone number + SMS code (Alan Felez)";
    }

    @Override
    public String getHelpText() {
        return "Sign-up and login with an Iranian mobile number and a one-time SMS code.";
    }

    @Override
    public String getReferenceCategory() {
        return "otp";
    }

    @Override
    public boolean isConfigurable() {
        return true;
    }

    @Override
    public Requirement[] getRequirementChoices() {
        return new Requirement[] {Requirement.REQUIRED, Requirement.ALTERNATIVE, Requirement.DISABLED};
    }

    @Override
    public boolean isUserSetupAllowed() {
        return false;
    }

    @Override
    public List<ProviderConfigProperty> getConfigProperties() {
        OtpSettings d = OtpSettings.DEFAULTS;
        return ProviderConfigurationBuilder.create()
                .property().name(OtpSettings.SMS_PROVIDER).label("SMS provider")
                .helpText("Id of the SmsSender provider: 'console' logs codes (development only).")
                .type(ProviderConfigProperty.STRING_TYPE).defaultValue(d.smsProvider()).add()
                .property().name(OtpSettings.MESSAGE_TEMPLATE).label("Message template")
                .helpText("SMS text; {code} is replaced by the one-time code.")
                .type(ProviderConfigProperty.STRING_TYPE).defaultValue(d.messageTemplate()).add()
                .property().name(OtpSettings.CODE_LENGTH).label("Code length")
                .type(ProviderConfigProperty.STRING_TYPE).defaultValue(Integer.toString(d.codeLength())).add()
                .property().name(OtpSettings.TTL_SECONDS).label("Code lifetime (seconds)")
                .type(ProviderConfigProperty.STRING_TYPE).defaultValue(Integer.toString(d.ttlSeconds())).add()
                .property().name(OtpSettings.MAX_ATTEMPTS).label("Max attempts per code")
                .type(ProviderConfigProperty.STRING_TYPE).defaultValue(Integer.toString(d.maxAttempts())).add()
                .property().name(OtpSettings.RESEND_COOLDOWN_SECONDS).label("Resend cooldown (seconds)")
                .type(ProviderConfigProperty.STRING_TYPE).defaultValue(Integer.toString(d.resendCooldownSeconds())).add()
                .property().name(OtpSettings.MAX_SENDS_PER_PHONE_PER_HOUR).label("Max codes per phone per hour")
                .type(ProviderConfigProperty.STRING_TYPE).defaultValue(Integer.toString(d.maxSendsPerPhonePerHour())).add()
                .build();
    }

    @Override
    public Authenticator create(KeycloakSession session) {
        return SINGLETON;
    }

    @Override
    public void init(Config.Scope config) {
        // no global config
    }

    @Override
    public void postInit(KeycloakSessionFactory factory) {
        // no-op
    }

    @Override
    public void close() {
        // no-op
    }
}
