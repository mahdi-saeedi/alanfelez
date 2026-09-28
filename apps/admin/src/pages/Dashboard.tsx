import { useGetIdentity, useTranslate } from "@refinedev/core";

export function Dashboard() {
  const t = useTranslate();
  const { data } = useGetIdentity<{ name?: string; roles?: string[] }>();
  return (
    <section className="max-w-2xl rounded-card border border-border bg-surface p-6">
      <h1 className="text-2xl font-extrabold">
        {t("dashboard.welcome")} <span dir="ltr">{data?.name}</span>
      </h1>
      <p className="mt-4 text-text-2">
        {t("dashboard.roles")}: <span dir="ltr" className="font-bold">{data?.roles?.filter((r) => !r.startsWith("default-") && r !== "offline_access" && r !== "uma_authorization").join(", ")}</span>
      </p>
      <p className="mt-4 text-text-2">{t("dashboard.next")}</p>
    </section>
  );
}
