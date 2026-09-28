package ir.alanfelez.keycloak.sms;

import org.keycloak.provider.ProviderFactory;

/** Factory for {@link SmsSender} implementations; each implementation has a unique id (e.g. "console", "kavenegar"). */
public interface SmsSenderFactory extends ProviderFactory<SmsSender> {
}
