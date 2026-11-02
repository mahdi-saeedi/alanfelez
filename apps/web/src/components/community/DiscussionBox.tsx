"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatDate, formatNumber, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { commentAction, loadDiscussionAction, rateAction } from "@/app/[locale]/analysis/actions";
import type { Comment, Discussion, RatingSummary } from "@/lib/community";

/**
 * Stars and comments under a member's analysis or a team article (client, 2026-11-02). Closed by default on cards
 * (the line shows the average and the counts); opening loads the comments. Readers of the item rate and comment;
 * a member's comment waits for staff review and its writer sees it marked so. `open` starts it opened (article page).
 */
export function DiscussionBox({ kind, id, rating, comments, open: startOpen = false }: { kind: "post" | "article"; id: string; rating?: { avg: number; count: number }; comments?: number; open?: boolean }) {
  const t = useTranslations("discussion");
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(startOpen);
  const [data, setData] = useState<Discussion | null>(null);
  const [loading, startLoad] = useTransition();
  const [sending, startSend] = useTransition();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const [hover, setHover] = useState(0);

  const load = () => startLoad(async () => setData(await loadDiscussionAction(kind, id)));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load once when it starts opened
  useEffect(() => { if (startOpen) load(); }, []);
  const summary: RatingSummary | undefined = data?.rating ?? (rating ? { ...rating, mine: 0 } : undefined);
  const count = data ? data.comments.filter((c) => !c.pending).length : (comments ?? 0);

  const rate = (stars: number) =>
    startSend(async () => {
      const r = await rateAction(kind, id, stars);
      if (r && data) setData({ ...data, rating: r });
      setMsg(r ? { ok: true, text: t("rated") } : { ok: false, text: t("failed") });
    });
  const send = () =>
    startSend(async () => {
      const r = await commentAction(kind, id, text);
      if (r.status === "sent") {
        setText("");
        if (data) setData({ ...data, comments: [...data.comments, r.comment] });
        setMsg({ ok: true, text: r.comment.pending ? t("pendingSent") : t("sent") });
      } else setMsg({ ok: false, text: t(r.status) });
    });

  return (
    <div className="border-t border-border pt-2 text-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => { setOpen(!open); if (!open && !data) load(); }}
        className="flex w-full items-center gap-3 rounded-lg py-1 text-start hover:text-gold-dark"
      >
        <Stars value={summary?.avg ?? 0} />
        <span className="text-xs text-text-2">
          {summary?.count ? t("ratingLine", { avg: formatNumber(Math.round(summary.avg * 10) / 10, locale), n: formatNumber(summary.count, locale) }) : t("noRating")}
        </span>
        <span className="ms-auto text-xs font-bold text-gold-dark">💬 {t("comments", { n: formatNumber(count, locale) })}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {loading && !data && <p className="text-xs text-text-3">{t("loading")}</p>}
          {data?.locked && (
            <p className="rounded-lg bg-gold/10 p-3 text-xs">
              {t("locked")} <Link href="/plans" className="font-bold text-gold-dark underline">{t("plans")}</Link>
            </p>
          )}
          {data && !data.locked && (
            <>
              {data.canRate && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-text-2">{t("yourRating")}</span>
                  <span className="flex" onMouseLeave={() => setHover(0)}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={sending}
                        aria-label={t("starsLabel", { n })}
                        onMouseEnter={() => setHover(n)}
                        onClick={() => rate(n)}
                        className={`px-0.5 text-xl leading-none ${n <= (hover || data.rating.mine) ? "text-gold" : "text-border-strong"}`}
                      >
                        ★
                      </button>
                    ))}
                  </span>
                </div>
              )}
              {data.comments.length === 0 && <p className="text-xs text-text-3">{t("none")}</p>}
              <ul className="space-y-2">
                {data.comments.map((c: Comment) => (
                  <li key={c.id} className={`rounded-lg p-2.5 ${c.staff ? "border border-gold/40 bg-gold/5" : "bg-surface-2"}`}>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <b className={c.staff ? "text-gold-dark" : ""}>{c.authorName}</b>
                      {c.staff && <span className="rounded-full bg-gold/20 px-2 text-[10px] font-bold text-gold-dark">{t("team")}</span>}
                      {c.pending && <span className="rounded-full bg-info-bg px-2 text-[10px] font-bold text-info">{t("pending")}</span>}
                      <time className="text-text-3" dateTime={c.createdAt}>{formatDate(c.createdAt, locale, true)}</time>
                    </div>
                    <p className="mt-1 whitespace-pre-line leading-7">{c.body}</p>
                  </li>
                ))}
              </ul>
              {data.canComment ? (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (text.trim().length >= 2) send();
                  }}
                >
                  <label className="sr-only" htmlFor={`c-${id}`}>{t("write")}</label>
                  <textarea
                    id={`c-${id}`}
                    value={text}
                    maxLength={1000}
                    rows={2}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={t("write")}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 outline-none focus:border-gold"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-text-3">{t("reviewNote")}</span>
                    <button type="submit" disabled={sending || text.trim().length < 2} className="rounded-lg bg-graphite px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                      {sending ? t("sending") : t("send")}
                    </button>
                  </div>
                </form>
              ) : (
                <p className="text-xs text-text-3">{t("signIn")}</p>
              )}
            </>
          )}
          {msg && <p role="status" className={`text-xs ${msg.ok ? "text-up" : "text-down"}`}>{msg.text}</p>}
        </div>
      )}
    </div>
  );
}

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="flex text-base leading-none" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= full ? "text-gold" : "text-border-strong"}>★</span>)}
    </span>
  );
}
