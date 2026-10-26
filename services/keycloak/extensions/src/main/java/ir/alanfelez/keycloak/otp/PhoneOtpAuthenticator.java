package ir.alanfelez.keycloak.otp;

import ir.alanfelez.keycloak.sms.SmsException;
import ir.alanfelez.keycloak.sms.SmsSender;
import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
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
import org.keycloak.models.RoleModel;
import org.keycloak.models.UserCredentialModel;
import org.keycloak.models.credential.PasswordCredentialModel;
import org.keycloak.policy.PasswordPolicyManagerProvider;
import org.keycloak.policy.PolicyError;
import org.keycloak.models.SingleUseObjectProvider;
import org.keycloak.models.UserModel;
import org.keycloak.models.credential.PasswordCredentialModel;
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
    static final String FORM_SIGNUP = "login-complete-signup.ftl";

    // Authentication-session notes (server side, never sent to the browser).
    static final String NOTE_PHONE = "alanfelez.otp.phone";
    static final String NOTE_HASH = "alanfelez.otp.hash";
    static final String NOTE_SALT = "alanfelez.otp.salt";
    static final String NOTE_EXPIRES = "alanfelez.otp.expires";
    static final String NOTE_ATTEMPTS = "alanfelez.otp.attempts";
    static final String NOTE_SENT_AT = "alanfelez.otp.sentAt";
    /** "Forgot password" mode: only existing accounts, and a new password is asked right after the code. */
    static final String NOTE_RESET = "alanfelez.otp.reset";
    /**
     * Set by the theme's «رمز عبور را فراموش کرده‌اید؟» link (login.ftl) just before it restarts the login, so this step
     * starts in reset mode. Keycloak's own e-mail reset can't work (no SMTP), so the link never goes there.
     */
    static final String RESET_COOKIE = "alanfelez_reset";
    /** Set once the code is right but the account still needs the sign-up form (id of that user). */
    static final String NOTE_SIGNUP_USER = "alanfelez.signup.user";

    static final String ATTR_PHONE = "phoneNumber";
    static final String ATTR_PHONE_VERIFIED = "phoneNumberVerified";
    // Sign-up form (SignupForm). Declared in the realm's user profile so admins see them.
    static final String ATTR_ACTIVITY = "activity";
    static final String ATTR_METALS = "metals";
    static final String ATTR_PROVINCE = "province";
    static final String ATTR_CITY = "city";
    static final String ATTR_ADDRESS = "address";
    static final String ATTR_TERMS_ACCEPTED_AT = "termsAcceptedAt";

    private static final String RATE_KEY_PREFIX = "alanfelez-otp-rate:";

    /** How long the request waits for the SMS provider before showing the code page anyway. */
    static final Duration SEND_WAIT = Duration.ofMillis(2500);
    /** SMS calls are network waits: one virtual thread each. */
    private static final ExecutorService SENDERS = Executors.newVirtualThreadPerTaskExecutor();

    @Override
    public void authenticate(AuthenticationFlowContext ctx) {
        AuthenticationSessionModel as = ctx.getAuthenticationSession();
        UserModel pending = signupUser(ctx);
        if (pending != null) {
            ctx.challenge(signupForm(ctx, pending, null, Map.of()));
            return;
        }
        if (resetRequested(ctx)) {
            as.setAuthNote(NOTE_RESET, "1");
        }
        if (as.getAuthNote(NOTE_PHONE) != null && as.getAuthNote(NOTE_HASH) != null) {
            ctx.challenge(codeForm(ctx, null));
        } else {
            warmUp(ctx);
            ctx.challenge(phoneForm(ctx, null, null));
        }
    }

    /** Lets the SMS provider open its connection while the user types the number (see {@link SmsSender#warmUp}). */
    private void warmUp(AuthenticationFlowContext ctx) {
        try {
            SmsSender sender = ctx.getSession().getProvider(SmsSender.class, OtpSettings.from(ctx.getAuthenticatorConfig()).smsProvider());
            if (sender != null) {
                sender.warmUp();
            }
        } catch (RuntimeException e) {
            LOG.debugf(e, "SMS warm-up failed");
        }
    }

    @Override
    public void action(AuthenticationFlowContext ctx) {
        MultivaluedMap<String, String> form = ctx.getHttpRequest().getDecodedFormParameters();
        String op = Optional.ofNullable(form.getFirst("formAction")).orElse("send");
        switch (op) {
            case "verify" -> verify(ctx, form.getFirst("code"));
            case "resend" -> resend(ctx);
            case "complete" -> complete(ctx, form);
            case "change" -> {
                clearCode(ctx.getAuthenticationSession());
                ctx.getAuthenticationSession().removeAuthNote(NOTE_SIGNUP_USER);
                ctx.getAuthenticationSession().removeAuthNote(NOTE_PHONE);
                warmUp(ctx);
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
        if (isReset(ctx) && ctx.getSession().users().getUserByUsername(ctx.getRealm(), PhoneNumbers.toUsername(phone.get())) == null) {
            // Resetting never creates an account (the normal sign-in does that).
            ctx.failureChallenge(AuthenticationFlowError.INVALID_USER, phoneForm(ctx, "resetNoAccount", rawPhone));
            return;
        }
        ctx.getAuthenticationSession().setAuthNote(NOTE_PHONE, phone.get());
        issueCode(ctx, phone.get(), true);
    }

    private static boolean resetRequested(AuthenticationFlowContext ctx) {
        var cookie = ctx.getHttpRequest().getHttpHeaders().getCookies().get(RESET_COOKIE);
        return cookie != null && "1".equals(cookie.getValue());
    }

    private static boolean isReset(AuthenticationFlowContext ctx) {
        return "1".equals(ctx.getAuthenticationSession().getAuthNote(NOTE_RESET));
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
        // The code page shouldn't wait on a slow SMS link: send in the background and wait at most SEND_WAIT. A provider
        // that refuses quickly (bad key, no credit) still shows the error; one still busy after that finishes on its
        // own, and if it then fails the user can ask for a new code.
        String masked = PhoneNumbers.mask(phone);
        CompletableFuture<Void> sending = CompletableFuture.runAsync(() -> {
            try {
                sender.sendCode(phone, code, s.message(code));
            } catch (SmsException e) {
                throw new CompletionException(e);
            }
        }, SENDERS);
        try {
            sending.get(SEND_WAIT.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            sending.whenComplete((ok, err) -> {
                if (err != null) {
                    LOG.errorf(err, "SMS sending failed (in the background) for %s via %s", masked, s.smsProvider());
                }
            });
        } catch (ExecutionException e) {
            LOG.errorf(e.getCause(), "SMS sending failed for %s via %s", masked, s.smsProvider());
            ctx.failureChallenge(AuthenticationFlowError.INTERNAL_ERROR, phoneForm(ctx, "smsSendFailed", null));
            return;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
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
        if (needsSignup(ctx.getRealm(), user)) {
            // The code proved the phone; the account is finished (and usable) only after the sign-up form.
            ctx.getAuthenticationSession().setAuthNote(NOTE_SIGNUP_USER, user.getId());
            ctx.challenge(signupForm(ctx, user, null, Map.of()));
            return;
        }
        if (isReset(ctx) && user.credentialManager().isConfiguredFor(PasswordCredentialModel.TYPE)) {
            // The code proved the phone: Keycloak asks for the new password (login-update-password.ftl) next.
            user.addRequiredAction(UserModel.RequiredAction.UPDATE_PASSWORD);
            LOG.infof("Password reset by SMS code: %s", PhoneNumbers.mask(phone));
        }
        ctx.setUser(user);
        ctx.success();
    }

    /**
     * New accounts, and older ones the first time after this form existed, fill it once: when the name, the activity or
     * the terms acceptance is missing, or there is no password yet. Staff accounts are made by an admin and skip it.
     */
    static boolean needsSignup(RealmModel realm, UserModel user) {
        RoleModel staff = realm.getRole("staff");
        if (staff != null && user.hasRole(staff)) {
            return false;
        }
        return blank(user.getFirstName()) || blank(user.getFirstAttribute(ATTR_ACTIVITY))
                || blank(user.getFirstAttribute(ATTR_TERMS_ACCEPTED_AT)) || !hasPassword(user);
    }

    private static boolean hasPassword(UserModel user) {
        return user.credentialManager().isConfiguredFor(PasswordCredentialModel.TYPE);
    }

    private static boolean blank(String v) {
        return v == null || v.isBlank();
    }

    private UserModel signupUser(AuthenticationFlowContext ctx) {
        String id = ctx.getAuthenticationSession().getAuthNote(NOTE_SIGNUP_USER);
        return id == null ? null : ctx.getSession().users().getUserById(ctx.getRealm(), id);
    }

    private void complete(AuthenticationFlowContext ctx, MultivaluedMap<String, String> form) {
        UserModel user = signupUser(ctx);
        if (user == null) {
            ctx.challenge(phoneForm(ctx, null, null));
            return;
        }
        boolean needPassword = !hasPassword(user);
        SignupForm f = SignupForm.from(form);
        Map<String, String> errors = new LinkedHashMap<>(f.errors(needPassword));
        if (needPassword && !errors.containsKey("password") && !errors.containsKey("passwordConfirm")) {
            PolicyError pe = ctx.getSession().getProvider(PasswordPolicyManagerProvider.class).validate(ctx.getRealm(), user, f.password());
            if (pe != null) {
                errors.put("password", pe.getMessage().contains("MinLength") ? "signupPasswordTooShort" : "signupPasswordNotAllowed");
            }
        }
        if (!errors.isEmpty()) {
            ctx.challenge(signupForm(ctx, user, f, errors));
            return;
        }
        user.setFirstName(f.fullName());
        user.setSingleAttribute(ATTR_ACTIVITY, f.activity());
        setOrRemove(user, ATTR_METALS, f.metals());
        setOrRemove(user, ATTR_PROVINCE, f.province().isEmpty() ? List.of() : List.of(f.province()));
        setOrRemove(user, ATTR_CITY, f.city().isEmpty() ? List.of() : List.of(f.city()));
        setOrRemove(user, ATTR_ADDRESS, f.address().isEmpty() ? List.of() : List.of(f.address()));
        user.setSingleAttribute(ATTR_TERMS_ACCEPTED_AT, Instant.now().toString());
        if (needPassword) {
            user.credentialManager().updateCredential(UserCredentialModel.password(f.password(), false));
        }
        ctx.getAuthenticationSession().removeAuthNote(NOTE_SIGNUP_USER);
        LOG.infof("Sign-up form completed: %s", PhoneNumbers.mask(user.getFirstAttribute(ATTR_PHONE)));
        ctx.setUser(user);
        ctx.success();
    }

    private static void setOrRemove(UserModel user, String name, List<String> values) {
        if (values.isEmpty()) {
            user.removeAttribute(name);
        } else {
            user.setAttribute(name, values);
        }
    }

    /** The form, filled from what was posted (never the passwords) or from the account, with errors per field. */
    private Response signupForm(AuthenticationFlowContext ctx, UserModel user, SignupForm posted, Map<String, String> errors) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("fullName", posted != null ? posted.fullName() : Optional.ofNullable(user.getFirstName()).orElse(""));
        values.put("activity", posted != null ? posted.activity() : Optional.ofNullable(user.getFirstAttribute(ATTR_ACTIVITY)).orElse(""));
        values.put("metals", posted != null ? posted.metals() : user.getAttributeStream(ATTR_METALS).toList());
        values.put("province", posted != null ? posted.province() : Optional.ofNullable(user.getFirstAttribute(ATTR_PROVINCE)).orElse(""));
        values.put("city", posted != null ? posted.city() : Optional.ofNullable(user.getFirstAttribute(ATTR_CITY)).orElse(""));
        values.put("address", posted != null ? posted.address() : Optional.ofNullable(user.getFirstAttribute(ATTR_ADDRESS)).orElse(""));
        String site = Optional.ofNullable(System.getenv("WEB_URL")).filter(v -> !v.isBlank()).orElse("https://alanfelez.ir").replaceAll("/+$", "");
        String lang = ctx.getSession().getContext().resolveLocale(user).getLanguage();
        String prefix = "en".equals(lang) ? site + "/en" : site;
        return ctx.form()
                .setAttribute("phoneNational", user.getUsername())
                .setAttribute("needPassword", !hasPassword(user))
                .setAttribute("values", values)
                .setAttribute("fieldErrors", errors)
                .setAttribute("activities", SignupForm.ACTIVITIES)
                .setAttribute("metalOptions", SignupForm.METALS)
                .setAttribute("provinces", SignupForm.PROVINCES)
                .setAttribute("termsUrl", prefix + "/terms")
                .setAttribute("privacyUrl", prefix + "/privacy")
                .createForm(FORM_SIGNUP);
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

    /** Per-phone hourly send limit (one hour from the first code), shared across sessions and cluster nodes. */
    private static boolean allowSend(KeycloakSession session, String phone, OtpSettings s) {
        SingleUseObjectProvider store = session.singleUseObjects();
        String key = RATE_KEY_PREFIX + phone;
        long now = Time.currentTime();
        SendWindow window = SendWindow.next(store.get(key), now, s.maxSendsPerPhonePerHour());
        if (window == null) {
            return false;
        }
        // Always put with the window's remaining lifespan: replace() drops the expiry, and the counter then never reset.
        store.remove(key);
        store.put(key, window.secondsLeft(now), window.toNotes());
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
        LoginFormsProvider f = ctx.form().setAttribute("resetMode", isReset(ctx));
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
