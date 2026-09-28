export type AdminConfig = { apiUrl: string; oidcAuthority: string; oidcClientId: string };

declare global {
  interface Window {
    __ADMIN_CONFIG__?: AdminConfig;
  }
}

/** Runtime config injected by /config.js (see server.mjs). Missing config is a deployment error. */
export const config: AdminConfig = (() => {
  const c = window.__ADMIN_CONFIG__;
  if (!c) throw new Error("Missing /config.js (window.__ADMIN_CONFIG__)");
  return c;
})();
