import { useTranslate } from "@refinedev/core";
import { ResourceTable } from "./ResourceTable";

type Metal = { slug: string; name: string };
type Market = { slug: string; name: string; scope: string };
type Plan = { code: string; name: string; rank: number; prices: { period: string; price: { amount: string } }[] };

export function MetalsList() {
  const t = useTranslate();
  return (
    <ResourceTable<Metal>
      resource="metals"
      title={t("nav.metals")}
      columns={[
        { key: "slug", label: t("table.slug"), render: (r) => <code dir="ltr">{r.slug}</code> },
        { key: "name", label: t("table.name"), render: (r) => r.name },
      ]}
    />
  );
}

export function MarketsList() {
  const t = useTranslate();
  return (
    <ResourceTable<Market>
      resource="markets"
      title={t("nav.markets")}
      columns={[
        { key: "slug", label: t("table.slug"), render: (r) => <code dir="ltr">{r.slug}</code> },
        { key: "name", label: t("table.name"), render: (r) => r.name },
        { key: "scope", label: t("table.scope"), render: (r) => r.scope },
      ]}
    />
  );
}

export function PlansList() {
  const t = useTranslate();
  return (
    <ResourceTable<Plan>
      resource="plans"
      title={t("nav.plans")}
      columns={[
        { key: "code", label: t("table.slug"), render: (r) => <code dir="ltr">{r.code}</code> },
        { key: "name", label: t("table.name"), render: (r) => r.name },
        { key: "rank", label: t("table.rank"), render: (r) => r.rank },
        { key: "prices", label: t("table.prices"), render: (r) => r.prices.map((p) => `${p.period}: ${Number(p.price.amount).toLocaleString()}`).join(" · ") || "—" },
      ]}
    />
  );
}
