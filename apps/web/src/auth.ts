import NextAuth, { customFetch } from "next-auth";
import Keycloak from "next-auth/providers/keycloak";

/**
 * Login through Keycloak (ADR-0005). The Next.js server keeps the session (encrypted JWT cookie) and never
 * exposes tokens to browser JavaScript.
 *
 * AUTH_KEYCLOAK_ISSUER is the PUBLIC issuer (what browsers see and what the `iss` claim contains).
 * When the server can't reach that URL (Docker: "localhost" is the container itself), set
 * AUTH_KEYCLOAK_INTERNAL_URL (e.g. http://keycloak:8081) and server-side calls are rewritten to it.
 */
const issuer = process.env.AUTH_KEYCLOAK_ISSUER ?? "http://localhost:8081/realms/alanfelez";
const internal = process.env.AUTH_KEYCLOAK_INTERNAL_URL;
const publicOrigin = new URL(issuer).origin;

const rewritingFetch: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return fetch(internal && url.startsWith(publicOrigin) ? internal + url.slice(publicOrigin.length) : url, init);
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    Keycloak({
      issuer,
      clientId: process.env.AUTH_KEYCLOAK_ID ?? "alanfelez-web",
      clientSecret: process.env.AUTH_KEYCLOAK_SECRET ?? "local-web-secret-change-me",
      ...(internal ? { [customFetch]: rewritingFetch } : {}),
    }),
  ],
  callbacks: {
    jwt({ token, profile }) {
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
