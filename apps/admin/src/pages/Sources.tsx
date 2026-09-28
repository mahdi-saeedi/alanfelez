import { useQuery } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import { formatDate, type Locale } from "@alanfelez/ui/format";
import { api, unwrap } from "../api";
import { Badge, Card, Page, Td, Th } from "./ui";

/** Source health (SCOPE §13): a stale source means staff should enter prices manually. */
export function SourcesPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const list = useQuery({ queryKey: ["admin", "sources"], queryFn: async () => unwrap(await api.GET("/v1/admin/sources")).items, refetchInterval: 15_000 });
  const when = (v?: string) => (v ? formatDate(v, locale, true) : "—");
  return (
    <Page title={t("sources.title")}>
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr><Th>{t("prices.source")}</Th><Th>{t("sources.provider")}</Th><Th>{t("sources.status")}</Th><Th>{t("sources.lastRun")}</Th><Th>{t("sources.lastSuccess")}</Th><Th>{t("sources.lastPoint")}</Th></tr>
          </thead>
          <tbody>
            {list.data?.map((s) => (
              <tr key={s.slug} className="border-t border-border">
                <Td>
                  <div className="font-bold">{s.name}</div>
                  <code className="text-xs text-text-3" dir="ltr">{s.slug}</code>
                </Td>
                <Td>
                  <code dir="ltr">{s.provider}</code>
                  {s.provider !== "manual" && s.fetchIntervalSeconds && (
                    <div className="text-xs text-text-3">{t("sources.every", { seconds: s.fetchIntervalSeconds })}</div>
                  )}
                </Td>
                <Td>
                  {!s.active ? <Badge>{t("prices.inactive")}</Badge> : s.stale ? <Badge tone="red">{t("sources.stale")}</Badge> : <Badge tone="green">{t("sources.fresh")}</Badge>}
                  {s.lastRunStatus === "error" && s.lastError && <div className="mt-1 max-w-xs truncate text-xs text-down" dir="ltr" title={s.lastError}>{s.lastError}</div>}
                </Td>
                <Td className="text-xs text-text-2">{when(s.lastRunAt)}</Td>
                <Td className="text-xs text-text-2">{when(s.lastSuccessAt)}</Td>
                <Td className="text-xs text-text-2">{when(s.lastPointAt)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Page>
  );
}
