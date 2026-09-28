import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { keycloakify } from "keycloakify/vite-plugin";

// Builds the "alanfelez" login theme as a jar (dist_keycloak/) that the Keycloak image loads from /opt/keycloak/providers.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    keycloakify({
      themeName: "alanfelez",
      accountThemeImplementation: "none",
      keycloakVersionTargets: {
        "22-to-25": false,
        "all-other-versions": "alanfelez-keycloak-theme.jar",
      },
    }),
  ],
});
