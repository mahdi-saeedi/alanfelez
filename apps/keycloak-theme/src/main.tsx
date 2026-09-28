import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { KcPage } from "./kc.gen";

// In Keycloak, window.kcContext is injected by the generated .ftl page.
// In `pnpm dev`, a mock context is used so pages can be developed without Keycloak: ?page=login-phone-otp.ftl&lang=en
async function main() {
  const kcContext = window.kcContext ?? (await import("./login/mocks")).getDevKcContext();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <KcPage kcContext={kcContext} />
    </StrictMode>,
  );
}
void main();
