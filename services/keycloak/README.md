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
Phone + SMS OTP sign-up (SPI + theme) comes in M3 (RISKS R-02).
