import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import type { Schemas } from "@alanfelez/api-client";
import { formatDate, type Locale } from "@alanfelez/ui/format";
import { api, canEditSettings, currentRoles, errorText, unwrap } from "../api";
import { Badge, Button, Card, Notice, Page } from "./ui";

type Flag = Schemas["AdminFlag"];

/**
 * Feature switches (ADR-0016): online payments, the English site, the licences page. Admin only, audited; live at
 * once. Payments can't be switched on while the test gateway is in use (the API refuses, `locked`).
 */
export function FlagsPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const qc = useQueryClient();
  const flags = useQuery({ queryKey: ["admin", "flags"], queryFn: async () => unwrap(await api.GET("/v1/admin/flags", {})) });
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const writable = canEditSettings(roles.data ?? []);
  const set = useMutation({
    mutationFn: async (f: Flag) => unwrap(await api.PUT("/v1/admin/flags/{key}", { params: { path: { key: f.key } }, body: { enabled: !f.enabled } })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "flags"] }),
  });

  return (
    <Page title={t("flags.title")} hint={t("flags.hint")}>
      {flags.isError && <Notice tone="error">{errorText(flags.error, t)}</Notice>}
      {set.isError && <Notice tone="error">{errorText(set.error, t)}</Notice>}
      {roles.isSuccess && !writable && <Notice tone="warn">{t("settings.adminOnly")}</Notice>}
      <div className="space-y-3">
        {flags.data?.items.map((f) => (
          <Card key={f.key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold">{t(`flags.${f.key}.name`)}</h2>
                <Badge tone={f.enabled ? "green" : "gray"}>{t(f.enabled ? "flags.on" : "flags.off")}</Badge>
              </div>
              <p className="mt-1 text-sm text-text-2">{t(`flags.${f.key}.desc`)}</p>
              {f.locked && <p className="mt-1 text-sm text-down">{t("flags.paymentsLocked")}</p>}
              {f.updatedAt && <p className="mt-1 text-xs text-text-3">{t("flags.changed", { date: formatDate(f.updatedAt, locale, true) })}</p>}
            </div>
            {writable && (
              <Button tone={f.enabled ? "danger" : "gold"} disabled={f.locked || set.isPending} onClick={() => {
                if (window.confirm(t(f.enabled ? "flags.confirmOff" : "flags.confirmOn", { name: t(`flags.${f.key}.name`) }))) set.mutate(f);
              }}>
                {t(f.enabled ? "flags.turnOff" : "flags.turnOn")}
              </Button>
            )}
          </Card>
        ))}
      </div>
    </Page>
  );
}
