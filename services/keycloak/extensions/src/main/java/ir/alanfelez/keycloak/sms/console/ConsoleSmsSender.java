package ir.alanfelez.keycloak.sms.console;

import ir.alanfelez.keycloak.sms.SmsException;
import ir.alanfelez.keycloak.sms.SmsSender;
import org.jboss.logging.Logger;

/**
 * Development SMS sender: writes the message to the Keycloak log instead of sending it.
 * Disabled in staging/production with {@code KC_SPI_SMS_SENDER__CONSOLE__ALLOWED=false}.
 */
public class ConsoleSmsSender implements SmsSender {

    private static final Logger LOG = Logger.getLogger(ConsoleSmsSender.class);

    private final boolean enabled;

    public ConsoleSmsSender(boolean enabled) {
        this.enabled = enabled;
    }

    @Override
    public void send(String phoneE164, String message) throws SmsException {
        if (!enabled) {
            throw new SmsException("console SMS sender is disabled in this environment; configure a real provider");
        }
        LOG.warnf("[DEV SMS — not sent] to=%s message=%s", phoneE164, message);
    }

    @Override
    public void close() {
        // nothing to release
    }
}
