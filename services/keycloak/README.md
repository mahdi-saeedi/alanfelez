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
Sign-up and sign-in are the same flow: mobile number → SMS code (`PhoneOtpAuthenticator` creates the account for a new number),
then the user profile makes **first and last name required** (email optional), so Keycloak's built-in `VERIFY_PROFILE`
required action shows the themed «تکمیل ثبت‌نام» page (`apps/keycloak-theme/src/login/pages/LoginUpdateProfile.tsx`).
Accounts without a name are asked once, at their next sign-in. The rules live in the realm file (component
`declarative-user-profile`). **A realm that already exists doesn't re-import it:** there, set it once in the console
(Realm settings → User profile → firstName / lastName → Required for users) or `PUT /admin/realms/alanfelez/users/profile`.

## SMS for sign-in codes
`OTP_SMS_PROVIDER` picks the `SmsSender` (it wins over the realm's stored `smsProvider`, which the one-time realm import
froze): `console` (writes codes to the log, local/staging only) or `smsir`
(`extensions/.../sms/smsir`): sms.ir "verify" with an approved template whose parameter `CODE` receives the code, so the
realm's `messageTemplate` isn't used for it. Options: `KC_SPI_SMS_SENDER__SMSIR__API_KEY` (Secret `alanfelez-sms`),
`__TEMPLATE_ID`, `__PARAMETER` (default `CODE`), `__BASE_URL` (default `https://api.sms.ir/v1`). Helm: `keycloak.otp.smsir`.
