import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { formatDate, formatNumber, type Locale } from "@alanfelez/ui/format";
import { Link } from "@/i18n/navigation";
import { getMe, getMyTicket } from "@/lib/account";
import { signInTo } from "@/lib/actions";
import { TicketStatus } from "@/components/TicketStatus";
import { closeTicketAction, replyTicketAction } from "../../actions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ locale: Locale; id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "tickets" });
  return { title: t("title"), robots: { index: false } };
}

/** One ticket: the thread (plain text, rendered escaped), a reply box and "close". */
export default async function TicketPage({ params }: Params) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  if (!(await getMe())) {
    const here = `${locale === "en" ? "/en" : ""}/account/tickets/${id}`;
    return (
      <section className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold">{t("account.loginTitle")}</h1>
        <form action={signInTo.bind(null, here, locale)} className="mt-6">
          <button className="rounded-lg bg-gold px-6 py-2.5 font-bold text-graphite hover:bg-gold-light">{t("auth.login")}</button>
        </form>
      </section>
    );
  }
  const thread = /^[0-9a-f-]{36}$/.test(id) ? await getMyTicket(id) : null;
  if (!thread) notFound();
  const { ticket, messages } = thread;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-10">
      <Link href="/account#tickets" className="text-sm text-text-2 hover:text-gold-dark">{t("tickets.back")}</Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-text-3">{t("tickets.number", { n: formatNumber(ticket.number, locale) })}</p>
          <h1 className="mt-1 text-xl font-extrabold sm:text-2xl">{ticket.subject}</h1>
        </div>
        <TicketStatus status={ticket.status} label={t(`tickets.status.${ticket.status}`)} />
      </header>

      <ol className="space-y-3">
        {messages.map((m) => (
          <li key={m.id} className={`rounded-card border p-4 shadow-soft ${m.staff ? "border-gold/40 bg-gold/5" : "border-border bg-surface"}`}>
            <div className="mb-2 flex flex-wrap justify-between gap-2 text-xs text-text-3">
              <span className="font-bold text-text-2">{m.staff ? t("tickets.support") : t("tickets.you")}</span>
              <time dateTime={m.createdAt}>{formatDate(m.createdAt, locale, true)}</time>
            </div>
            <p className="whitespace-pre-line text-sm leading-7">{m.body}</p>
          </li>
        ))}
      </ol>

      {ticket.status === "closed" && <p className="text-sm text-text-2">{t("tickets.closedHint")}</p>}
      <form action={replyTicketAction} className="space-y-3 rounded-card border border-border bg-surface p-4 shadow-soft">
        <input type="hidden" name="id" value={ticket.id} />
        <label className="block text-sm font-bold" htmlFor="reply">{t("tickets.reply")}</label>
        <textarea id="reply" name="body" required maxLength={5000} rows={4} className="w-full rounded-control border border-border px-3 py-2 text-sm outline-none focus:border-gold" />
        <div className="flex flex-wrap justify-between gap-2">
          <button className="rounded-lg bg-graphite px-5 py-2 text-sm font-bold text-white hover:bg-graphite-2">{t("tickets.send")}</button>
          {ticket.status !== "closed" && (
            <button formAction={closeTicketAction} formNoValidate className="rounded-lg border border-border px-4 py-2 text-sm hover:border-down hover:text-down">
              {t("tickets.close")}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
