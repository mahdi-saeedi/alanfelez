import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslate } from "@refinedev/core";
import type { Schemas } from "@alanfelez/api-client";
import { api, canEditSettings, currentRoles, errorText, unwrap } from "../api";
import { Button, Card, Field, Input, Notice, Page } from "./ui";

type Settings = Schemas["AdminSettings"];

const NETWORKS: (keyof Settings["social"])[] = ["telegram", "instagram", "linkedin", "bale", "eitaa"];

/** Contact details and social links shown on the site (empty = hidden; client answer #30). Admin only. */
export function SettingsPage() {
  const t = useTranslate();
  const loaded = useQuery({ queryKey: ["admin", "settings"], queryFn: async () => unwrap(await api.GET("/v1/admin/settings", {})) });
  if (!loaded.data) return <p className="text-text-2">{loaded.isError ? errorText(loaded.error, t) : "…"}</p>;
  return <SettingsForm initial={loaded.data} />;
}

function SettingsForm({ initial }: { initial: Settings }) {
  const t = useTranslate();
  const qc = useQueryClient();
  const [v, setV] = useState<Settings>(initial);
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const writable = canEditSettings(roles.data ?? []);
  const save = useMutation({
    mutationFn: async () => unwrap(await api.PUT("/v1/admin/settings", { body: v })),
    onSuccess: (s) => qc.setQueryData(["admin", "settings"], s),
  });
  const contact = (k: keyof Settings["contact"], ltr = false) => (
    <Field label={t(`settings.contact.${k}`)}>
      <Input dir={ltr ? "ltr" : undefined} disabled={!writable} value={v.contact[k]} onChange={(e) => setV({ ...v, contact: { ...v.contact, [k]: e.target.value } })} className="w-full" />
    </Field>
  );
  return (
    <Page title={t("settings.title")} hint={t("settings.hint")}>
      <form
        className="max-w-3xl space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Card className="space-y-4 p-4">
          <h2 className="font-bold">{t("settings.contactTitle")}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {contact("phone", true)}
            {contact("email", true)}
            {contact("addressFa")}
            {contact("addressEn", true)}
            {contact("hoursFa")}
            {contact("hoursEn", true)}
          </div>
        </Card>
        <Card className="space-y-4 p-4">
          <h2 className="font-bold">{t("settings.socialTitle")}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {NETWORKS.map((k) => (
              <Field key={k} label={t(`settings.social.${k}`)}>
                <Input dir="ltr" disabled={!writable} placeholder="https://" value={v.social[k]} onChange={(e) => setV({ ...v, social: { ...v.social, [k]: e.target.value } })} className="w-full" />
              </Field>
            ))}
          </div>
        </Card>
        {save.isError && <Notice tone="error">{errorText(save.error, t)}</Notice>}
        {save.isSuccess && <Notice tone="ok">{t("common.saved")}</Notice>}
        {writable ? (
          <Button tone="gold" type="submit" disabled={save.isPending}>{save.isPending ? t("common.saving") : t("common.save")}</Button>
        ) : (
          roles.isSuccess && <Notice tone="warn">{t("settings.adminOnly")}</Notice>
        )}
      </form>
    </Page>
  );
}
