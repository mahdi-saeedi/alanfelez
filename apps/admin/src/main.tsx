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
import { MarketsList, PlansList } from "./pages/Resources";
import { CatalogPage } from "./pages/Catalog";
import { PricesPage } from "./pages/Prices";
import { BulkPage } from "./pages/Bulk";
import { QuarantinePage } from "./pages/Quarantine";
import { SourcesPage } from "./pages/Sources";
import { SubscriptionsPage } from "./pages/Subscriptions";
import { OrdersPage } from "./pages/Orders";
import { UsersPage } from "./pages/Users";
import { VisitsPage } from "./pages/Visits";
import { ArticlesPage, ArticleEditPage } from "./pages/Articles";
import { ArticleCategoriesPage } from "./pages/Categories";
import { FaqPage } from "./pages/Faq";
import { PagesPage, PageEditPage } from "./pages/Pages";
import { SettingsPage } from "./pages/Settings";
import { FlagsPage } from "./pages/Flags";
import { AuctionsPage } from "./pages/Auctions";
import { ContactMessagesPage, TicketsPage, TicketPage } from "./pages/Support";
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
            <Route path="/prices" element={<PricesPage />} />
            <Route path="/prices/bulk" element={<BulkPage />} />
            <Route path="/prices/quarantine" element={<QuarantinePage />} />
            <Route path="/sources" element={<SourcesPage />} />
            <Route path="/subscriptions" element={<SubscriptionsPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/visits" element={<VisitsPage />} />
            <Route path="/content/articles" element={<ArticlesPage />} />
            <Route path="/content/articles/:id" element={<ArticleEditPage />} />
            <Route path="/content/categories" element={<ArticleCategoriesPage />} />
            <Route path="/content/faq" element={<FaqPage />} />
            <Route path="/content/pages" element={<PagesPage />} />
            <Route path="/content/pages/:slug" element={<PageEditPage />} />
            <Route path="/support/tickets" element={<TicketsPage />} />
            <Route path="/support/tickets/:id" element={<TicketPage />} />
            <Route path="/support/messages" element={<ContactMessagesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/flags" element={<FlagsPage />} />
            <Route path="/auctions" element={<AuctionsPage />} />
            <Route path="/metals" element={<CatalogPage />} />
            <Route path="/catalog" element={<CatalogPage />} />
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
