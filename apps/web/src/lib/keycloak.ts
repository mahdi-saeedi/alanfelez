/**
 * Keycloak settings shared by Auth.js (src/auth.ts) and the token refresh in the proxy (src/lib/session-refresh.ts).
 *
 * AUTH_KEYCLOAK_ISSUER is the PUBLIC issuer (what browsers see and what the `iss` claim contains).
 * When the server can't reach that URL (Docker: "localhost" is the container itself), set
 * AUTH_KEYCLOAK_INTERNAL_URL (e.g. http://keycloak:8081) and server-side calls are rewritten to it.
 */
export const keycloak = {
  issuer: process.env.AUTH_KEYCLOAK_ISSUER ?? "http://localhost:8081/realms/alanfelez",
  internalUrl: process.env.AUTH_KEYCLOAK_INTERNAL_URL,
  clientId: process.env.AUTH_KEYCLOAK_ID ?? "alanfelez-web",
  clientSecret: process.env.AUTH_KEYCLOAK_SECRET ?? "local-web-secret-change-me",
};

const publicOrigin = new URL(keycloak.issuer).origin;

/** Rewrites a public Keycloak URL to the internal address for server-side calls. */
export function internalKeycloakUrl(url: string): string {
  return keycloak.internalUrl && url.startsWith(publicOrigin) ? keycloak.internalUrl + url.slice(publicOrigin.length) : url;
}

export const tokenEndpoint = internalKeycloakUrl(`${keycloak.issuer}/protocol/openid-connect/token`);

/**
 * «ورود»: the username + password page first (`login=password`, read by PhoneOtpAuthenticator); «امتحان روش‌های
 * دیگر» there offers the SMS code. «ثبت‌نام» (no parameter) starts with the mobile number and SMS code.
 */
export const PASSWORD_FIRST = { login: "password" } as const;
