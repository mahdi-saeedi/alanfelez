import NextAuth, { customFetch } from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import { cookies } from "next/headers";
import { CUSTOMER_USERNAME, internalKeycloakUrl, keycloak, STAFF_ID_TOKEN_COOKIE } from "@/lib/keycloak";
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
  // Our own Persian/English page instead of Auth.js's English ones (src/app/[locale]/auth-error): its "Server error"
  // page, and its sign-in page, which it shows for errors like an expired form (we always sign in with Keycloak).
  pages: { error: "/auth-error", signIn: "/auth-error" },
  providers: [
    Keycloak({
      issuer: keycloak.issuer,
      clientId: keycloak.clientId,
      clientSecret: keycloak.clientSecret,
      ...(keycloak.internalUrl ? { [customFetch]: rewritingFetch } : {}),
    }),
  ],
  callbacks: {
    // The website is for customers, whose username is their mobile number. Staff accounts (admin panel) share the
    // Keycloak session, so «ورود» used to sign a staff account into the website silently, and it then bought plans and
    // SMS that can't reach any phone (client, 2026-11-17). Such a sign-in is refused with an explanation instead.
    async signIn({ profile, account }) {
      const username = typeof profile?.preferred_username === "string" ? profile.preferred_username : "";
      if (CUSTOMER_USERNAME.test(username)) return true;
      if (account?.id_token) {
        (await cookies()).set(STAFF_ID_TOKEN_COOKIE, account.id_token, {
          httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600,
        });
      }
      return "/auth-error?error=StaffAccount";
    },
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
