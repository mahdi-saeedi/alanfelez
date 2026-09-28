import type { ReactNode } from "react";

/** Small building blocks shared by the admin pages. */
export function Page({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">{title}</h1>
        {hint && <p className="mt-1 max-w-3xl text-sm text-text-2">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`overflow-x-auto rounded-card border border-border bg-surface ${className}`}>{children}</div>;
}

export function Th({ children }: { children?: ReactNode }) {
  return <th className="px-3 py-2.5 text-start text-xs font-semibold text-text-2">{children}</th>;
}

export function Td({ children, className = "", dir }: { children?: ReactNode; className?: string; dir?: "ltr" | "rtl" }) {
  return <td dir={dir} className={`px-3 py-2.5 align-middle ${className}`}>{children}</td>;
}

export function Button({ children, tone = "dark", ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "dark" | "gold" | "ghost" | "danger" }) {
  const tones = {
    dark: "bg-graphite text-white hover:bg-graphite-2",
    gold: "bg-gold text-graphite font-bold hover:bg-gold-light",
    ghost: "border border-border hover:border-gold",
    danger: "border border-down/40 text-down hover:bg-down-bg",
  };
  return (
    <button {...rest} className={`rounded-lg px-3 py-1.5 text-sm disabled:opacity-50 ${tones[tone]} ${rest.className ?? ""}`}>
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm ${props.className ?? ""}`} />;
}

export function Notice({ tone, children }: { tone: "ok" | "error" | "warn"; children: ReactNode }) {
  const tones = { ok: "bg-up-bg text-up", error: "bg-down-bg text-down", warn: "bg-gold/10 text-gold-dark" };
  return <div className={`rounded-lg px-3 py-2 text-sm ${tones[tone]}`}>{children}</div>;
}

export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: "gray" | "green" | "red" | "gold" }) {
  const tones = { gray: "bg-surface-2 text-text-2", green: "bg-up-bg text-up", red: "bg-down-bg text-down", gold: "bg-gold/15 text-gold-dark" };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}
