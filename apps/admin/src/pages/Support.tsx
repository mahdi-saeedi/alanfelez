import { useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useGetLocale, useTranslate } from "@refinedev/core";
import type { Schemas } from "@alanfelez/api-client";
import { formatDate, type Locale } from "@alanfelez/ui/format";
import { api, canAnswerSupport, currentRoles, errorText, unwrap } from "../api";
import { Badge, Button, Card, Input, Notice, Page, Select, Td, Textarea, Th } from "./ui";

type ContactStatus = Schemas["ContactStatus"];
type TicketStatus = Schemas["TicketStatus"];

const statusTone = (s: TicketStatus) => (s === "open" ? "gold" : s === "answered" ? "green" : "gray");

/** Contact form messages (SCOPE §12). Support marks them handled (with a note) or spam. */
export function ContactMessagesPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const qc = useQueryClient();
  const [status, setStatus] = useState<ContactStatus | "">("new");
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const list = useQuery({
    queryKey: ["admin", "contact", status],
    queryFn: async () => unwrap(await api.GET("/v1/admin/contact-messages", { params: { query: status ? { status } : {} } })).items,
  });
  const writable = canAnswerSupport(roles.data ?? []);
  return (
    <Page title={t("contact.title")} hint={t("contact.hint")}>
      <div className="flex gap-1">
        {(["new", "handled", "spam", ""] as const).map((s) => (
          <Button key={s || "all"} tone={s === status ? "dark" : "ghost"} onClick={() => setStatus(s)}>{t(s ? `contact.status.${s}` : "contact.all")}</Button>
        ))}
      </div>
      {list.data?.length === 0 && <Notice tone="ok">{t("table.empty")}</Notice>}
      <div className="space-y-3">
        {list.data?.map((m) => (
          <Card key={m.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-bold">{m.name}</span>
              <a href={`tel:${m.phone}`} dir="ltr" className="text-text-2 hover:text-gold-dark">{m.phone}</a>
              {m.email && <a href={`mailto:${m.email}`} dir="ltr" className="text-text-2 hover:text-gold-dark">{m.email}</a>}
              <Badge>{t(`contact.subject.${m.subject}`)}</Badge>
              {m.userId && <Badge tone="gold">{t("contact.member")}</Badge>}
              <span className="ms-auto text-xs text-text-3">{formatDate(m.createdAt, locale, true)}</span>
            </div>
            <p className="whitespace-pre-line text-sm leading-7">{m.body}</p>
            {m.note && <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-text-2">{t("contact.note")}: {m.note}</p>}
            {writable && (
              <Handle
                message={m}
                onDone={() => {
                  qc.invalidateQueries({ queryKey: ["admin", "contact"] });
                  qc.invalidateQueries({ queryKey: ["admin", "support-summary"] });
                }}
              />
            )}
          </Card>
        ))}
      </div>
    </Page>
  );
}

function Handle({ message, onDone }: { message: Schemas["AdminContactMessage"]; onDone: () => void }) {
  const t = useTranslate();
  const [note, setNote] = useState(message.note ?? "");
  const update = useMutation({
    mutationFn: async (status: ContactStatus) =>
      unwrap(await api.PUT("/v1/admin/contact-messages/{id}", { params: { path: { id: message.id } }, body: { status, ...(note ? { note } : {}) } })),
    onSuccess: onDone,
  });
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("contact.notePlaceholder")} className="min-w-64 flex-1" />
      {message.status !== "handled" && <Button tone="gold" disabled={update.isPending} onClick={() => update.mutate("handled")}>{t("contact.markHandled")}</Button>}
      {message.status !== "spam" && <Button tone="danger" disabled={update.isPending} onClick={() => update.mutate("spam")}>{t("contact.markSpam")}</Button>}
      {message.status !== "new" && <Button tone="ghost" disabled={update.isPending} onClick={() => update.mutate("new")}>{t("contact.reopen")}</Button>}
      {update.isError && <Notice tone="error">{errorText(update.error, t)}</Notice>}
    </div>
  );
}

/** The ticket queue: open tickets first, high priority (Gold) first, oldest waiting first. */
export function TicketsPage() {
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const [status, setStatus] = useState<TicketStatus | "">("open");
  const list = useQuery({
    queryKey: ["admin", "tickets", status],
    queryFn: async () => unwrap(await api.GET("/v1/admin/tickets", { params: { query: status ? { status } : {} } })).items,
  });
  return (
    <Page title={t("tickets.title")} hint={t("tickets.hint")}>
      <div className="flex gap-1">
        {(["open", "answered", "closed", ""] as const).map((s) => (
          <Button key={s || "all"} tone={s === status ? "dark" : "ghost"} onClick={() => setStatus(s)}>{t(s ? `tickets.status.${s}` : "contact.all")}</Button>
        ))}
      </div>
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-surface-2">
            <tr><Th>#</Th><Th>{t("tickets.subject")}</Th><Th>{t("orders.user")}</Th><Th>{t("sources.status")}</Th><Th>{t("tickets.lastActivity")}</Th></tr>
          </thead>
          <tbody>
            {list.data?.length === 0 && <tr><Td className="text-text-2">{t("table.empty")}</Td></tr>}
            {list.data?.map((k) => (
              <tr key={k.id} className="border-t border-border">
                <Td className="tabular-nums text-text-3">{k.number}</Td>
                <Td>
                  <Link to={`/support/tickets/${k.id}`} className="font-bold hover:text-gold-dark">{k.subject}</Link>
                  {k.priority === "high" && <span className="ms-2"><Badge tone="gold">{t("tickets.high")}</Badge></span>}
                </Td>
                <Td>{k.userName ?? ""} <span dir="ltr" className="text-xs text-text-3">{k.username}</span></Td>
                <Td><Badge tone={statusTone(k.status)}>{t(`tickets.status.${k.status}`)}</Badge></Td>
                <Td className="text-xs">{formatDate(k.lastMessageAt, locale, true)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Page>
  );
}

export function TicketPage() {
  const { id } = useParams();
  const t = useTranslate();
  const locale = useGetLocale()() as Locale;
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const roles = useQuery({ queryKey: ["roles"], queryFn: currentRoles });
  const thread = useQuery({ queryKey: ["admin", "ticket", id], queryFn: async () => unwrap(await api.GET("/v1/admin/tickets/{id}", { params: { path: { id: id! } } })) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "ticket", id] });
    qc.invalidateQueries({ queryKey: ["admin", "tickets"] });
    qc.invalidateQueries({ queryKey: ["admin", "support-summary"] });
  };
  const send = useMutation({
    mutationFn: async () => unwrap(await api.POST("/v1/admin/tickets/{id}/messages", { params: { path: { id: id! } }, body: { body: reply } })),
    onSuccess: () => {
      setReply("");
      refresh();
    },
  });
  const setStatus = useMutation({
    mutationFn: async (status: TicketStatus) => unwrap(await api.PUT("/v1/admin/tickets/{id}/status", { params: { path: { id: id! } }, body: { status } })),
    onSuccess: refresh,
  });
  const writable = canAnswerSupport(roles.data ?? []);
  if (!thread.data) return <p className="text-text-2">{thread.isError ? errorText(thread.error, t) : "…"}</p>;
  const { ticket, messages } = thread.data;

  return (
    <Page title={ticket.subject} hint={`#${ticket.number} · ${ticket.userName ?? ""} ${ticket.username}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/support/tickets" className="text-sm text-text-2 hover:text-gold-dark">{t("common.back")}</Link>
        <Badge tone={statusTone(ticket.status)}>{t(`tickets.status.${ticket.status}`)}</Badge>
        {ticket.priority === "high" && <Badge tone="gold">{t("tickets.high")}</Badge>}
        <Link to={`/orders?user=${ticket.userId}`} className="text-xs text-info hover:underline">{t("tickets.userOrders")}</Link>
        {writable && (
          <Select className="ms-auto" value={ticket.status} disabled={setStatus.isPending} onChange={(e) => setStatus.mutate(e.target.value as TicketStatus)}>
            {(["open", "answered", "closed"] as const).map((s) => <option key={s} value={s}>{t(`tickets.status.${s}`)}</option>)}
          </Select>
        )}
      </div>
      <ol className="max-w-3xl space-y-3">
        {messages.map((m) => (
          <li key={m.id} className={`rounded-card border p-4 ${m.staff ? "border-gold/40 bg-gold/5" : "border-border bg-surface"}`}>
            <div className="mb-2 flex justify-between gap-2 text-xs text-text-3">
              <span className="font-bold text-text-2">{m.staff ? `${t("tickets.staff")} · ${m.author ?? ""}` : m.author ?? t("tickets.customer")}</span>
              <span>{formatDate(m.createdAt, locale, true)}</span>
            </div>
            <p className="whitespace-pre-line text-sm leading-7">{m.body}</p>
          </li>
        ))}
      </ol>
      {writable ? (
        <form
          className="max-w-3xl space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <Textarea required maxLength={5000} rows={5} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t("tickets.replyPlaceholder")} />
          {send.isError && <Notice tone="error">{errorText(send.error, t)}</Notice>}
          <Button tone="gold" type="submit" disabled={send.isPending || !reply.trim()}>{t("tickets.send")}</Button>
        </form>
      ) : (
        roles.isSuccess && <Notice tone="warn">{t("tickets.supportOnly")}</Notice>
      )}
    </Page>
  );
}
