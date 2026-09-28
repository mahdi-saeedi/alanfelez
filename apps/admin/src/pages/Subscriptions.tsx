import { useState } from "react";
import { useSearchParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import { formatDate, type Locale } from "@alanfelez/ui/format";
import { api, canGrant, currentRoles, errorText, unwrap } from "../api";
import { Badge, Button, Card, Input, Notice, Page, Td, Th } from "./ui";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Manual subscription grants (admin only) until checkout exists, plus the latest subscriptions. */
export function SubscriptionsPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const preset = params.get("user") ?? ""; // from the Users page
  const [filter, setFilter] = useState(preset);
  const [form, setForm] = useState({ userId: preset, plan: "gold" as "silver" | "gold", days: "30", note: "" });
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const admin = canGrant(roles.data ?? []);
  const userFilter = UUID.test(filter.trim()) ? filter.trim() : undefined;
  const list = useQuery({
    queryKey: ["admin", "subscriptions", userFilter],
    queryFn: async () => unwrap(await api.GET("/v1/admin/subscriptions", { params: { query: { userId: userFilter } } })).items,
  });
  const grant = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST("/v1/admin/subscriptions", {
          body: { userId: form.userId.trim(), plan: form.plan, days: Number(form.days), ...(form.note ? { note: form.note } : {}) },
        }),
      ),
    onSuccess: () => {
      setForm((f) => ({ ...f, userId: "", note: "" }));
      void qc.invalidateQueries({ queryKey: ["admin", "subscriptions"] });
    },
  });
  const valid = UUID.test(form.userId.trim()) && Number(form.days) >= 1 && Number(form.days) <= 1095;

  return (
    <Page title={t("subs.title")} hint={t("subs.hint")}>
      {admin ? (
        <form
          className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4"
          onSubmit={(e) => {
            e.preventDefault();
            grant.mutate();
          }}
        >
          <Field label={t("subs.userId")}>
            <Input value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} dir="ltr" className="w-80 font-mono" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
          </Field>
          <Field label={t("subs.plan")}>
            <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value as "silver" | "gold" })} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm">
              <option value="silver">{t("plan.silver")}</option>
              <option value="gold">{t("plan.gold")}</option>
            </select>
          </Field>
          <Field label={t("subs.days")}>
            <Input type="number" min={1} max={1095} value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })} className="w-24" />
          </Field>
          <Field label={t("subs.note")}>
            <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-56" maxLength={500} />
          </Field>
          <Button tone="gold" type="submit" disabled={!valid || grant.isPending}>{t("subs.grant")}</Button>
          {grant.isSuccess && <Notice tone="ok">{t("subs.granted")}</Notice>}
          {grant.isError && <Notice tone="error">{errorText(grant.error, t)}</Notice>}
        </form>
      ) : (
        roles.isSuccess && <Notice tone="warn">{t("common.readOnly")}</Notice>
      )}

      <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t("subs.filter")} dir="ltr" className="w-80 font-mono" />
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr><Th>{t("subs.userId")}</Th><Th>{t("subs.plan")}</Th><Th>{t("subs.starts")}</Th><Th>{t("subs.ends")}</Th><Th>{t("sources.status")}</Th><Th>{t("subs.origin")}</Th><Th>{t("subs.note")}</Th></tr>
          </thead>
          <tbody>
            {list.data?.length === 0 && <tr><Td className="text-text-2">{t("table.empty")}</Td></tr>}
            {list.data?.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <Td><code dir="ltr" className="text-xs">{s.userId}</code></Td>
                <Td><Badge tone={s.plan === "gold" ? "gold" : "gray"}>{t(`plan.${s.plan}`)}</Badge></Td>
                <Td className="text-xs">{formatDate(s.startsAt, locale)}</Td>
                <Td className="text-xs">{formatDate(s.endsAt, locale)}</Td>
                <Td><Badge tone={s.status === "active" ? "green" : "gray"}>{t(`subs.status.${s.status}`)}</Badge></Td>
                <Td>{t(`subs.origin.${s.origin}`)}</Td>
                <Td className="text-xs text-text-2">{s.note}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Page>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-text-2">
      {label}
      {children}
    </label>
  );
}
