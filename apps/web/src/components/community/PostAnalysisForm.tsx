"use client";

import { useRef, useState, useTransition } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { postAnalysisAction, type PostResult } from "@/app/[locale]/analysis/actions";

const MAX_IMAGE = 5 * 1024 * 1024;

type Labels = Record<
  "open" | "title" | "titlePh" | "body" | "bodyPh" | "metal" | "noMetal" | "outlook" | "noOutlook" | "up" | "down" | "neutral" | "image" | "imageHint"
    | "submit" | "sending" | "cancel" | "left" | "none" | "disclaimer" | "posted" | "imageFailed" | "imageTooBig" | "invalid" | "claim" | "limited" | "locked" | "failed",
  string
>;

/**
 * «ثبت تحلیل» for Silver and Gold members (client, 2026-10-30): title, text, metal, view and one chart image. The text
 * goes through a server action; the image is then uploaded to /api/community/{id}/image (too big for an action).
 */
export function PostAnalysisForm({ metals, left, labels }: { metals: { slug: string; name: string }[]; left: number; labels: Labels }) {
  const locale = useLocale();
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [chars, setChars] = useState(0);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setOpen(true)} disabled={left === 0}
          className="min-h-11 rounded-lg bg-info px-5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
          {labels.open}
        </button>
        <span className="text-xs text-text-3">{left > 0 ? labels.left.replace("{n}", left.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")) : labels.none}</span>
        {msg && <span role="status" className={`text-sm ${msg.tone === "ok" ? "text-up" : "text-down"}`}>{msg.text}</span>}
      </div>
    );
  }

  function submit(fd: FormData) {
    const file = fd.get("image");
    const image = file instanceof File && file.size > 0 ? file : null;
    if (image && image.size > MAX_IMAGE) return setMsg({ tone: "bad", text: labels.imageTooBig });
    fd.delete("image");
    fd.set("locale", locale);
    start(async () => {
      const res: PostResult = await postAnalysisAction(fd);
      if (res.status !== "posted") return setMsg({ tone: "bad", text: labels[res.status] });
      let note = labels.posted;
      if (image) {
        const up = await fetch(`/api/community/${res.id}/image`, { method: "PUT", body: image }).catch(() => null);
        if (!up || up.status !== 204) note = labels.imageFailed;
      }
      form.current?.reset();
      setChars(0);
      setOpen(false);
      setMsg({ tone: note === labels.posted ? "ok" : "bad", text: note });
      router.refresh();
    });
  }

  const field = "w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm";
  return (
    <form ref={form} action={submit} className="space-y-3 rounded-card border border-info/40 bg-surface p-4 shadow-soft">
      <label className="block text-sm">
        <span className="mb-1 block font-bold">{labels.title}</span>
        <input name="title" required minLength={3} maxLength={150} placeholder={labels.titlePh} className={field} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-bold">{labels.metal}</span>
          <select name="metal" className={field} defaultValue="">
            <option value="">{labels.noMetal}</option>
            {metals.map((m) => <option key={m.slug} value={m.slug}>{m.name}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-bold">{labels.outlook}</span>
          <select name="outlook" className={field} defaultValue="">
            <option value="">{labels.noOutlook}</option>
            <option value="up">{labels.up}</option>
            <option value="down">{labels.down}</option>
            <option value="neutral">{labels.neutral}</option>
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 flex justify-between font-bold">{labels.body}<span className="font-normal text-text-3 tabular-nums">{chars.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}/{(3000).toLocaleString(locale === "fa" ? "fa-IR" : "en-US")}</span></span>
        <textarea name="body" required minLength={10} maxLength={3000} rows={6} placeholder={labels.bodyPh} onChange={(e) => setChars(e.target.value.length)} className={field} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-bold">{labels.image}</span>
        <input name="image" type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="block w-full text-sm file:me-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm" />
        <span className="mt-1 block text-xs text-text-3">{labels.imageHint}</span>
      </label>
      <p className="rounded-lg bg-surface-2 p-3 text-xs leading-6 text-text-2">{labels.disclaimer}</p>
      {msg && <p role="status" className={`text-sm ${msg.tone === "ok" ? "text-up" : "text-down"}`}>{msg.text}</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={pending} className="min-h-11 rounded-lg bg-info px-5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60">
          {pending ? labels.sending : labels.submit}
        </button>
        <button type="button" onClick={() => { setOpen(false); setMsg(null); }} className="min-h-11 rounded-lg border border-border px-4 text-sm">
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}
