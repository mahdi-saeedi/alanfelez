import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import { formatDate, type Locale } from "@alanfelez/ui/format";
import { api, errorText, unwrap } from "../api";
import { Badge, Card, Notice, Page, Td, Th } from "./ui";

type Status = "sent" | "failed";

/** SMS log (client, 2026-10-27): the latest SMS sent or tried and why one failed, so an SMS can be checked here. */
export function SmsLogPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const [status, setStatus] = useState<Status>();
  const log = useQuery({
    queryKey: ["admin", "sms", status ?? "all"],
    queryFn: async () => unwrap(await api.GET("/v1/admin/notifications", { params: { query: status ? { status } : {} } })),
    refetchInterval: 60_000,
  });
  const kind = (k: string) => {
    const label = t(`sms.kind.${k}`);
    return label === `sms.kind.${k}` ? k : label;
  };
  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-sm ${on ? "border-graphite bg-graphite font-bold text-white" : "border-border bg-surface"}`;

  return (
    <Page title={t("sms.title")} hint={t("sms.hint")}>
      <div className="flex flex-wrap gap-2">
        {([undefined, "sent", "failed"] as const).map((s) => (
          <button key={s ?? "all"} type="button" className={chip(status === s)} onClick={() => setStatus(s)}>{t(s ? `sms.${s}` : "sms.all")}</button>
        ))}
      </div>
      {log.isError && <Notice tone="error">{errorText(log.error, t)}</Notice>}
      {log.data && (
        <Card className="overflow-x-auto">
          {log.data.items.length === 0 ? (
            <p className="p-4 text-sm text-text-3">{t("sms.none")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-2">
                <tr><Th>{t("sms.when")}</Th><Th>{t("sms.user")}</Th><Th>{t("sms.to")}</Th><Th>{t("sms.kind")}</Th><Th>{t("sms.status")}</Th><Th>{t("sms.provider")}</Th><Th>{t("sms.error")}</Th></tr>
              </thead>
              <tbody>
                {log.data.items.map((n) => (
                  <tr key={n.id} className="border-t border-border align-top">
                    <Td className="whitespace-nowrap">{formatDate(n.createdAt, locale, true)}</Td>
                    <Td>{n.user ?? "—"}</Td>
                    <Td dir="ltr" className="tabular-nums">{n.recipient}</Td>
                    <Td>{kind(n.template)}</Td>
                    <Td><Badge tone={n.status === "sent" ? "green" : "red"}>{t(`sms.${n.status}`)}</Badge></Td>
                    <Td dir="ltr">{n.provider}</Td>
                    <Td className="max-w-xs break-words text-xs text-text-2">{n.error ?? ""}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </Page>
  );
}
