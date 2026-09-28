// Development defaults (vite dev). In containers server.mjs serves this file from environment variables.
window.__ADMIN_CONFIG__ = {
  apiUrl: "http://localhost:8080",
  oidcAuthority: "http://localhost:8081/realms/alanfelez",
  oidcClientId: "alanfelez-admin",
};
