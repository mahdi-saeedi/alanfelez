package ir.alanfelez.keycloak.otp;

import ir.alanfelez.keycloak.sms.SmsException;
import ir.alanfelez.keycloak.sms.SmsSender;
import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;
import java.util.Map;
import java.util.Optional;
import org.jboss.logging.Logger;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.AuthenticationFlowError;
import org.keycloak.authentication.Authenticator;
import org.keycloak.common.util.Time;
import org.keycloak.events.Details;
import org.keycloak.events.EventType;
import org.keycloak.forms.login.LoginFormsProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.SingleUseObjectProvider;
import org.keycloak.models.UserModel;
import org.keycloak.sessions.AuthenticationSessionModel;

/**
 * Sign-up and login with a mobile number and an SMS one-time code.
 *
 * <ol>
 *   <li>The user enters a mobile number ({@code login-phone.ftl}).</li>
 *   <li>A code is generated, only its salted hash is kept in the authentication session, and it is sent through the
 *       configured {@link SmsSender} ({@code smsProvider} setting, "console" by default).</li>
 *   <li>The user enters the code ({@code login-phone-otp.ftl}). On success the existing account is used, or a new
 *       account is created (username = 09xxxxxxxxx, attribute phoneNumber = +989xxxxxxxxx).</li>
 * </ol>
 *
 * Abuse controls (SECURITY.md §4): code expiry, attempt limit, resend cooldown and a per-phone hourly send limit shared
 * across all sessions and cluster nodes (single-use object store).
 */
public class PhoneOtpAuthenticator implements Authenticator {

    private static final Logger LOG = Logger.getLogger(PhoneOtpAuthenticator.class);

    static final String FORM_PHONE = "login-phone.ftl";
    static final String FORM_CODE = "login-phone-otp.ftl";

    // Authentication-session notes (server side, never sent to the browser).
    static final String NOTE_PHONE = "alanfelez.otp.phone";
    static final String NOTE_HASH = "alanfelez.otp.hash";
    static final String NOTE_SALT = "alanfelez.otp.salt";
    static final String NOTE_EXPIRES = "alanfelez.otp.expires";
    static final String NOTE_ATTEMPTS = "alanfelez.otp.attempts";
    static final String NOTE_SENT_AT = "alanfelez.otp.sentAt";

    static final String ATTR_PHONE = "phoneNumber";
    static final String ATTR_PHONE_VERIFIED = "phoneNumberVerified";

    private static final String RATE_KEY_PREFIX = "alanfelez-otp-rate:";

    @Override
    public void authenticate(AuthenticationFlowContext ctx) {
        AuthenticationSessionModel as = ctx.getAuthenticationSession();
        if (as.getAuthNote(NOTE_PHONE) != null && as.getAuthNote(NOTE_HASH) != null) {
            ctx.challenge(codeForm(ctx, null));
        } else {
            ctx.challenge(phoneForm(ctx, null, null));
        }
    }

    @Override
    public void action(AuthenticationFlowContext ctx) {
        MultivaluedMap<String, String> form = ctx.getHttpRequest().getDecodedFormParameters();
        String op = Optional.ofNullable(form.getFirst("formAction")).orElse("send");
        switch (op) {
            case "verify" -> verify(ctx, form.getFirst("code"));
            case "resend" -> resend(ctx);
            case "change" -> {
                clearCode(ctx.getAuthenticationSession());
                ctx.getAuthenticationSession().removeAuthNote(NOTE_PHONE);
                ctx.challenge(phoneForm(ctx, null, null));
            }
            default -> send(ctx, form.getFirst("phone"));
        }
    }

    private void send(AuthenticationFlowContext ctx, String rawPhone) {
        Optional<String> phone = PhoneNumbers.normalize(rawPhone);
        if (phone.isEmpty()) {
            ctx.failureChallenge(AuthenticationFlowError.INVALID_CREDENTIALS, phoneForm(ctx, "invalidPhone", rawPhone));
            return;
        }
        ctx.getAuthenticationSession().setAuthNote(NOTE_PHONE, phone.get());
        issueCode(ctx, phone.get(), true);
    }

    private void resend(AuthenticationFlowContext ctx) {
        AuthenticationSessionModel as = ctx.getAuthenticationSession();
        String phone = as.getAuthNote(NOTE_PHONE);
        if (phone == null) {
            ctx.challenge(phoneForm(ctx, null, null));
            return;
        }
        OtpSettings s = OtpSettings.from(ctx.getAuthenticatorConfig());
        long wait = secondsUntilResend(as, s);
        if (wait > 0) {
            ctx.challenge(codeForm(ctx, "otpResendTooSoon"));
            return;
        }
        issueCode(ctx, phone, false);
    }

    private void issueCode(AuthenticationFlowContext ctx, String phone, boolean fromPhoneForm) {
        OtpSettings s = OtpSettings.from(ctx.getAuthenticatorConfig());
        if (!allowSend(ctx.getSession(), phone, s)) {
            LOG.warnf("OTP send limit reached for %s", PhoneNumbers.mask(phone));
            ctx.getEvent().detail(Details.USERNAME, PhoneNumbers.mask(phone)).error("otp_rate_limited");
            Response r = fromPhoneForm ? phoneForm(ctx, "otpRateLimited", null) : codeForm(ctx, "otpRateLimited");
            ctx.failureChallenge(AuthenticationFlowError.ACCESS_DENIED, r);
            return;
        }

        String code = OtpCodes.generate(s.codeLength());
        String salt = OtpCodes.newSalt();
        SmsSender sender = ctx.getSession().getProvider(SmsSender.class, s.smsProvider());
        if (sender == null) {
            LOG.errorf("SMS provider '%s' is not installed", s.smsProvider());
            ctx.failureChallenge(AuthenticationFlowError.INTERNAL_ERROR, phoneForm(ctx, "smsSendFailed", null));
            return;
        }
        try {
            sender.sendCode(phone, code, s.message(code));
        } catch (SmsException e) {
            LOG.errorf(e, "SMS sending failed for %s via %s", PhoneNumbers.mask(phone), s.smsProvider());
            ctx.failureChallenge(AuthenticationFlowError.INTERNAL_ERROR, phoneForm(ctx, "smsSendFailed", null));
            return;
        }

        AuthenticationSessionModel as = ctx.getAuthenticationSession();
        int now = Time.currentTime();
        as.setAuthNote(NOTE_HASH, OtpCodes.hash(code, salt));
        as.setAuthNote(NOTE_SALT, salt);
        as.setAuthNote(NOTE_EXPIRES, Integer.toString(now + s.ttlSeconds()));
        as.setAuthNote(NOTE_ATTEMPTS, "0");
        as.setAuthNote(NOTE_SENT_AT, Integer.toString(now));
        ctx.challenge(codeForm(ctx, null));
    }

    private void verify(AuthenticationFlowContext ctx, String entered) {
        AuthenticationSessionModel as = ctx.getAuthenticationSession();
        String phone = as.getAuthNote(NOTE_PHONE);
        String hash = as.getAuthNote(NOTE_HASH);
        if (phone == null || hash == null) {
            ctx.challenge(phoneForm(ctx, null, null));
            return;
        }
        OtpSettings s = OtpSettings.from(ctx.getAuthenticatorConfig());
        if (Time.currentTime() > parseInt(as.getAuthNote(NOTE_EXPIRES))) {
            clearCode(as);
            ctx.failureChallenge(AuthenticationFlowError.EXPIRED_CODE, codeForm(ctx, "otpExpired"));
            return;
        }
        int attempts = parseInt(as.getAuthNote(NOTE_ATTEMPTS));
        if (attempts >= s.maxAttempts()) {
            clearCode(as);
            ctx.failureChallenge(AuthenticationFlowError.INVALID_CREDENTIALS, codeForm(ctx, "otpTooManyAttempts"));
            return;
        }
        if (!OtpCodes.matches(entered, as.getAuthNote(NOTE_SALT), hash)) {
            as.setAuthNote(NOTE_ATTEMPTS, Integer.toString(attempts + 1));
            ctx.getEvent().detail(Details.USERNAME, PhoneNumbers.mask(phone)).error("invalid_otp");
            ctx.failureChallenge(AuthenticationFlowError.INVALID_CREDENTIALS, codeForm(ctx, "invalidOtp"));
            return;
        }

        clearCode(as);
        UserModel user = findOrCreateUser(ctx, phone);
        if (!user.isEnabled()) {
            ctx.getEvent().user(user).error("user_disabled");
            ctx.failureChallenge(AuthenticationFlowError.USER_DISABLED, phoneForm(ctx, "accountDisabledMessage", null));
            return;
        }
        ctx.setUser(user);
        ctx.success();
    }

    private UserModel findOrCreateUser(AuthenticationFlowContext ctx, String phone) {
        KeycloakSession session = ctx.getSession();
        RealmModel realm = ctx.getRealm();
        String username = PhoneNumbers.toUsername(phone);
        UserModel user = session.users().getUserByUsername(realm, username);
        if (user == null) {
            user = session.users().addUser(realm, username);
            user.setEnabled(true);
            user.setSingleAttribute(ATTR_PHONE, phone);
            user.setSingleAttribute(ATTR_PHONE_VERIFIED, "true");
            ctx.getEvent().clone().event(EventType.REGISTER).user(user)
                    .detail(Details.USERNAME, username).detail(Details.REGISTER_METHOD, "phone-otp").success();
            LOG.infof("New account created by phone OTP: %s", PhoneNumbers.mask(phone));
        } else if (!"true".equals(user.getFirstAttribute(ATTR_PHONE_VERIFIED))) {
            user.setSingleAttribute(ATTR_PHONE, phone);
            user.setSingleAttribute(ATTR_PHONE_VERIFIED, "true");
        }
        return user;
    }

    /** Per-phone hourly send limit, shared across sessions and cluster nodes. */
    private static boolean allowSend(KeycloakSession session, String phone, OtpSettings s) {
        SingleUseObjectProvider store = session.singleUseObjects();
        String key = RATE_KEY_PREFIX + phone;
        Map<String, String> entry = store.get(key);
        if (entry == null) {
            store.put(key, 3600, Map.of("count", "1"));
            return true;
        }
        int count = parseInt(entry.get("count"));
        if (count >= s.maxSendsPerPhonePerHour()) {
            return false;
        }
        store.replace(key, Map.of("count", Integer.toString(count + 1)));
        return true;
    }

    private static long secondsUntilResend(AuthenticationSessionModel as, OtpSettings s) {
        int sentAt = parseInt(as.getAuthNote(NOTE_SENT_AT));
        return Math.max(0, sentAt + s.resendCooldownSeconds() - Time.currentTime());
    }

    private static void clearCode(AuthenticationSessionModel as) {
        as.removeAuthNote(NOTE_HASH);
        as.removeAuthNote(NOTE_SALT);
        as.removeAuthNote(NOTE_EXPIRES);
        as.removeAuthNote(NOTE_ATTEMPTS);
    }

    private Response phoneForm(AuthenticationFlowContext ctx, String error, String enteredPhone) {
        LoginFormsProvider f = ctx.form();
        if (enteredPhone != null) {
            f.setAttribute("phone", enteredPhone);
        }
        if (error != null) {
            f.setError(error);
        }
        return f.createForm(FORM_PHONE);
    }

    private Response codeForm(AuthenticationFlowContext ctx, String error) {
        AuthenticationSessionModel as = ctx.getAuthenticationSession();
        OtpSettings s = OtpSettings.from(ctx.getAuthenticatorConfig());
        String phone = as.getAuthNote(NOTE_PHONE);
        LoginFormsProvider f = ctx.form()
                .setAttribute("phoneMasked", phone == null ? "" : PhoneNumbers.mask(phone))
                .setAttribute("phoneNational", phone == null ? "" : PhoneNumbers.toUsername(phone))
                .setAttribute("codeLength", s.codeLength())
                .setAttribute("resendIn", secondsUntilResend(as, s));
        if (error != null) {
            f.setError(error);
        }
        return f.createForm(FORM_CODE);
    }

    private static int parseInt(String v) {
        try {
            return v == null ? 0 : Integer.parseInt(v);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    @Override
    public boolean requiresUser() {
        return false;
    }

    @Override
    public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) {
        return true;
    }

    @Override
    public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) {
        // no required actions
    }

    @Override
    public void close() {
        // stateless
    }
}
