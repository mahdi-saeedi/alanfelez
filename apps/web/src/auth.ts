import NextAuth, { customFetch } from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import { internalKeycloakUrl, keycloak } from "@/lib/keycloak";
import { SESSION_MAX_AGE } from "@/lib/session-refresh";

/**
 * Login through Keycloak (ADR-0005). The Next.js server keeps the session in an encrypted, httpOnly JWT cookie.
 * The Keycloak access/refresh tokens live in that cookie only. The session object (which browsers can read at
 * /api/auth/session) never contains them. Server code gets the token with accessToken() from src/lib/api.ts, and
 * the proxy refreshes it (src/lib/session-refresh.ts).
 */
const rewritingFetch: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return fetch(internalKeycloakUrl(url), init);
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  providers: [
    Keycloak({
      issuer: keycloak.issuer,
      clientId: keycloak.clientId,
      clientSecret: keycloak.clientSecret,
      ...(keycloak.internalUrl ? { [customFetch]: rewritingFetch } : {}),
    }),
  ],
  callbacks: {
    jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        token.idToken = account.id_token; // id_token_hint for Keycloak logout (src/components/Header.tsx)
        token.error = undefined;
      }
      if (profile) {
        token.username = profile.preferred_username as string | undefined;
      }
      return token;
    },
    session({ session, token }) {
      session.user.name = session.user.name || (token.username as string | undefined) || null;
      return session;
    },
  },
});
