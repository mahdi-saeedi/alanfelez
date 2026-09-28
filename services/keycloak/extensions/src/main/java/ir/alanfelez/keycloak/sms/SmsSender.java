package ir.alanfelez.keycloak.sms;

import org.keycloak.provider.Provider;

/**
 * Sends a text message to a phone number.
 *
 * <p>To add a real provider (Kavenegar, Ghasedak, …): implement this interface and {@link SmsSenderFactory},
 * register the factory in {@code META-INF/services/ir.alanfelez.keycloak.sms.SmsSenderFactory}, and select it with the
 * authenticator config property {@code smsProvider} (realm file) — no change to the authenticator is needed.
 */
public interface SmsSender extends Provider {

    /**
     * Sends {@code message} to {@code phoneE164} (e.g. {@code +989121234567}).
     *
     * @throws SmsException if the message could not be accepted by the provider
     */
    void send(String phoneE164, String message) throws SmsException;
}
