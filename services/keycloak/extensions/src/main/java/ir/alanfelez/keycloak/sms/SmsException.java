package ir.alanfelez.keycloak.sms;

/** Raised when an SMS provider rejects or fails to accept a message. */
public class SmsException extends Exception {

    public SmsException(String message) {
        super(message);
    }

    public SmsException(String message, Throwable cause) {
        super(message, cause);
    }
}
