import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, Outlet } from "react-router";
import { Refine, Authenticated } from "@refinedev/core";
import routerProvider, { NavigateToResource } from "@refinedev/react-router";
import { authProvider } from "./providers/authProvider";
import { dataProvider } from "./providers/dataProvider";
import { i18nProvider, applyDocumentLang } from "./i18n";
import { Layout } from "./pages/Layout";
import { Dashboard } from "./pages/Dashboard";
import { MetalsList, MarketsList, PlansList } from "./pages/Resources";
import { LoginPage, CallbackPage, DeniedPage } from "./pages/AuthPages";
import "./index.css";

applyDocumentLang();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Refine
        routerProvider={routerProvider}
        authProvider={authProvider}
        dataProvider={dataProvider}
        i18nProvider={i18nProvider}
        resources={[
          { name: "metals", list: "/metals" },
          { name: "markets", list: "/markets" },
          { name: "plans", list: "/plans" },
        ]}
        options={{ disableTelemetry: true, syncWithLocation: true }}
      >
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/callback" element={<CallbackPage />} />
          <Route path="/denied" element={<DeniedPage />} />
          <Route
            element={
              <Authenticated key="app">
                <Layout />
              </Authenticated>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="/metals" element={<MetalsList />} />
            <Route path="/markets" element={<MarketsList />} />
            <Route path="/plans" element={<PlansList />} />
            <Route path="*" element={<NavigateToResource resource="metals" />} />
          </Route>
          <Route element={<Outlet />} />
        </Routes>
      </Refine>
    </BrowserRouter>
  </StrictMode>,
);
