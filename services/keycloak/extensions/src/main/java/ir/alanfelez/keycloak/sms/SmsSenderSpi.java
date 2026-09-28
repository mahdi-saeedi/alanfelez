package ir.alanfelez.keycloak.sms;

import org.keycloak.provider.Provider;
import org.keycloak.provider.ProviderFactory;
import org.keycloak.provider.Spi;

/**
 * Declares the custom "sms-sender" SPI. Provider-level options are set with Keycloak's standard SPI config,
 * e.g. {@code KC_SPI_SMS_SENDER__CONSOLE__ALLOWED=false}.
 */
public class SmsSenderSpi implements Spi {

    public static final String NAME = "sms-sender";

    @Override
    public boolean isInternal() {
        return false;
    }

    @Override
    public String getName() {
        return NAME;
    }

    @Override
    public Class<? extends Provider> getProviderClass() {
        return SmsSender.class;
    }

    @Override
    @SuppressWarnings("rawtypes")
    public Class<? extends ProviderFactory> getProviderFactoryClass() {
        return SmsSenderFactory.class;
    }
}
