package ir.alanfelez.keycloak.sms.console;

import ir.alanfelez.keycloak.sms.SmsSender;
import ir.alanfelez.keycloak.sms.SmsSenderFactory;
import org.jboss.logging.Logger;
import org.keycloak.Config;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;

/** Registers the "console" SMS sender. */
public class ConsoleSmsSenderFactory implements SmsSenderFactory {

    public static final String ID = "console";
    private static final Logger LOG = Logger.getLogger(ConsoleSmsSenderFactory.class);

    private boolean allowed = true;

    @Override
    public SmsSender create(KeycloakSession session) {
        return new ConsoleSmsSender(allowed);
    }

    /**
     * Option "allowed" (KC_SPI_SMS_SENDER__CONSOLE__ALLOWED). Not "enabled": that name is Keycloak's own build-time
     * provider switch and can't change at runtime with --optimized.
     */
    @Override
    public void init(Config.Scope config) {
        allowed = config.getBoolean("allowed", true);
        if (allowed) {
            LOG.warn("Console SMS sender is ENABLED: OTP codes are written to the log. Never use this in production.");
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
