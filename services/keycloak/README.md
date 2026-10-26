# Keycloak

- `realm/alanfelez-realm.json` is the **production-safe** realm: clients, roles, security policies, and **no users**.
  `${VAR:default}` placeholders are resolved from the Keycloak container's environment at import time.
- `local/alanfelez-users-0.json` contains **local-only** test users. Docker Compose mounts it. It's never used in staging or production.

| Local user | Password | Role |
|---|---|---|
| `local-admin` | `local-admin-pass` | admin |
| `local-editor` | `local-editor-pass` | editor |
| `09120000001` | `local-user-pass` | (normal user) |

Keycloak admin console (local): http://localhost:8081/admin, user `admin` / `admin` (bootstrap admin, local only).

Import only happens when the realm **doesn't exist yet**. After changing the realm file locally, run `task reset` (it wipes volumes)
or edit the realm in the console and export it. In Kubernetes the realm is applied by the Keycloak Operator (`KeycloakRealmImport`).

## Sign-up
Sign-up and sign-in are the same flow: mobile number → SMS code (`PhoneOtpAuthenticator` creates the account for a new number).
Then, once, the **sign-up form** (client, 2026-10-25; `SignupForm.java`, page `login-complete-signup.ftl`,
`apps/keycloak-theme/src/login/pages/LoginCompleteSignup.tsx`): name or company (→ `firstName`), the verified phone
shown as the username (read-only; customers sign in with it and the password), password + repeat, field of activity, the terms checkbox (required); specialty metals, province, city,
address (optional). Stored as user attributes `activity`, `metals`, `province`, `city`, `address`, `termsAcceptedAt`
(slugs; labels are in the theme). Older accounts see it once with what they have (no password fields if they have one);
staff accounts never do. `lastName` is no longer asked.

**The user profile of an existing realm isn't re-imported**, so it is applied on every deploy: the image carries the
realm's profile as `/opt/keycloak/data/user-profile.json`, and the Helm PreSync job `keycloak-profile`
(`templates/keycloak-profile-job.yaml`) PUTs it to the running Keycloak **before** the new pods start (the new profile
also works with the old code). It never blocks a deploy: on a first install or an error it logs and exits 0; then run
`realm/apply-user-profile.sh` by hand. Without the profile, a new user is sent to Keycloak's own "update profile" page
asking for a last name. The job logs in with the bootstrap admin (`alanfelez-keycloak-admin`); when that admin is
disabled before launch, give the job a service account instead.

## SMS for sign-in codes
`OTP_SMS_PROVIDER` picks the `SmsSender` (it wins over the realm's stored `smsProvider`, which the one-time realm import
froze): `console` (writes codes to the log, local/staging only) or `smsir`
(`extensions/.../sms/smsir`): sms.ir "verify" with an approved template whose parameter `CODE` receives the code, so the
realm's `messageTemplate` isn't used for it. Options: `KC_SPI_SMS_SENDER__SMSIR__API_KEY` (Secret `alanfelez-sms`),
`__TEMPLATE_ID`, `__PARAMETER` (default `CODE`), `__BASE_URL` (default `https://api.sms.ir/v1`). Helm: `keycloak.otp.smsir`.
Speed: when the phone form is shown, the sender opens its connection to sms.ir in the background (`warmUp`, no key, at
most every 15 s), and the send runs off the request thread: the code page waits at most 2.5 s for it, so a quick refusal
still shows «ارسال پیامک ممکن نشد» while a slow link no longer holds the page. The SMS delivery itself (sms.ir → operator,
30–60 s reported on 2026-10-24) is on sms.ir's side.
Code lifetime: 5 minutes (`OTP_TTL_SECONDS`, Helm `keycloak.otp.ttlSeconds`; wins over the realm's stored `ttlSeconds`,
like `OTP_SMS_PROVIDER`). A new code can still be asked for after 120 s (`resendCooldownSeconds`); it replaces the old one.
Each accepted code is logged as `sms.ir accepted a code for 0912***4567 in 412 ms (messageId 88412)`: if codes arrive
late, compare that time with the phone, and give sms.ir support the messageId.

## «ورود» opens the password page (client, 2026-10-26)
The site's «ورود» buttons (header, account, checkout) add `login=password` to the sign-in request (`PASSWORD_FIRST` in
`apps/web/src/lib/keycloak.ts`); «ثبت‌نام» doesn't. Keycloak keeps the parameter as the client note
`client_request_param_login`; `PhoneOtpAuthenticator` then sends the phone page once with `passwordFirst`, and the theme
(`LoginPhone.tsx`) picks «ورود با رمز عبور» for the user, as «امتحان روش‌های دیگر» would. So the password page keeps
«امتحان روش‌های دیگر» (back to the SMS code) and «رمز عبور را فراموش کرده‌اید؟». The username is the mobile number
(09…); the theme turns Persian digits, spaces and +98 into that form before sending. No realm change.
Customers who never set a password (older accounts) use the SMS code or «فراموشی رمز».

## Forgot password (by SMS code)
The password page's «رمز عبور را فراموش کرده‌اید؟» doesn't go to Keycloak's e-mail reset (no SMTP). The theme
(`src/login/forgot-password.ts`) sets the short-lived cookie `alanfelez_reset=1` and restarts the login; the phone OTP
step then runs in reset mode: title «بازیابی رمز عبور», only existing accounts (no account is created, «حسابی با این
شماره پیدا نشد»), the same send limits (5 codes per phone per hour), and after the code Keycloak's UPDATE_PASSWORD page
asks for the new password: our page (`LoginUpdatePassword.tsx`) shows the username read-only, then the new password
and its repeat. No realm change needed.
