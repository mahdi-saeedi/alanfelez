package ir.alanfelez.keycloak.sms.smsir;

import ir.alanfelez.keycloak.sms.SmsSender;
import ir.alanfelez.keycloak.sms.SmsSenderFactory;
import java.net.http.HttpClient;
import java.time.Duration;
import org.jboss.logging.Logger;
import org.keycloak.Config;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;

/**
 * Registers the "smsir" SMS sender (select it with OTP_SMS_PROVIDER=smsir). Options, as environment variables:
 * <ul>
 *   <li>{@code KC_SPI_SMS_SENDER__SMSIR__API_KEY}: the sms.ir API key (a secret, from the alanfelez-sms Secret)</li>
 *   <li>{@code KC_SPI_SMS_SENDER__SMSIR__TEMPLATE_ID}: the approved verify template's id</li>
 *   <li>{@code KC_SPI_SMS_SENDER__SMSIR__PARAMETER}: the template's parameter name, default {@code CODE}</li>
 *   <li>{@code KC_SPI_SMS_SENDER__SMSIR__BASE_URL}: default {@code https://api.sms.ir/v1}</li>
 * </ul>
 */
public class SmsIrSenderFactory implements SmsSenderFactory {

    public static final String ID = "smsir";
    private static final Logger LOG = Logger.getLogger(SmsIrSenderFactory.class);

    private HttpClient http;
    private String baseUrl;
    private String apiKey;
    private long templateId;
    private String parameter;

    @Override
    public SmsSender create(KeycloakSession session) {
        return new SmsIrSender(http, baseUrl, apiKey, templateId, parameter);
    }

    @Override
    public void init(Config.Scope config) {
        http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();
        baseUrl = config.get("base-url", "https://api.sms.ir/v1").replaceAll("/+$", "");
        apiKey = config.get("api-key", "");
        parameter = config.get("parameter", "CODE");
        if (!parameter.matches("[A-Za-z0-9_]{1,30}")) {
            LOG.errorf("sms.ir parameter name '%s' is invalid; using CODE", parameter);
            parameter = "CODE";
        }
        String t = config.get("template-id", "");
        try {
            templateId = t.isBlank() ? 0 : Long.parseLong(t.trim());
        } catch (NumberFormatException e) {
            LOG.errorf("sms.ir template-id '%s' is not a number", t);
            templateId = 0;
        }
        if (apiKey.isBlank() || templateId <= 0) {
            LOG.info("sms.ir sender installed but not configured (api-key / template-id); it refuses to send");
        }
    }

    @Override
    public void postInit(KeycloakSessionFactory factory) {
        // no-op
    }

    @Override
    public void close() {
        // no-op
    }

    @Override
    public String getId() {
        return ID;
    }
}
