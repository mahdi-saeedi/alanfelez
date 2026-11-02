import { getTranslations } from "next-intl/server";

type Lane = { key: string; color: string; soft: string; ink: string; chains: string[][]; icon: React.ReactNode };

// The perspectives of the client's strategy map (2026-11-02, drawn 1404/06/26), top to bottom, each with its colour.
// Every chain reads from its main goal (first, filled) to what drives it; the texts are in messages (strategy.*).
const LANES: Lane[] = [
  { key: "finance", color: "#ea580c", soft: "#fdba74", ink: "#9a3412", chains: [["finance.1", "finance.2", "finance.3", "finance.4", "finance.5"]], icon: <path d="M12 3v18M16 7.5c0-1.9-1.8-3-4-3s-4 1.1-4 3 1.8 2.6 4 3 4 1.1 4 3-1.8 3-4 3-4-1.1-4-3" /> },
  { key: "customer", color: "#2563eb", soft: "#93c5fd", ink: "#1e40af", chains: [["customer.1", "customer.2", "customer.3", "customer.4"]], icon: <path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c0-3.3 2.7-5 6-5s6 1.7 6 5m0-5c3.3 0 8 1.7 8 5" /> },
  { key: "process", color: "#16a34a", soft: "#86efac", ink: "#166534", chains: [["process.1", "process.2", "process.3"], ["process.4", "process.5", "process.6"]], icon: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z" /> },
  { key: "learning", color: "#be123c", soft: "#fda4af", ink: "#9f1239", chains: [["learning.1", "learning.2"], ["learning.3", "learning.4"]], icon: <path d="M12 21V10m0 0c0-3.5 2.5-6 7-6 0 4.5-2.5 7-7 6Zm0 3c0-3-2-5-6-5 0 4 2 5.5 6 5" /> },
];
const VALUES = ["1", "2", "3", "4", "5", "6", "7"] as const;

/**
 * «نقشه‌ی راهبردی الان‌فلز» on the About page (client, 2026-11-02): vision and mission, the finance, customer,
 * internal-process and learning goals as chains, and the seven core values whose first letters spell «الان‌فلز».
 * Rows on wide screens, stacked with ↓ on phones. Wording edited with the client: Alan Felez informs and, later,
 * introduces buyers and sellers, but is never a party to a trade.
 */
export async function StrategyMap() {
  const t = await getTranslations("strategy");
  return (
    <section className="mx-auto max-w-6xl px-4 pb-10" aria-labelledby="strategy-title">
      <div className="overflow-hidden rounded-card border border-border bg-surface shadow-card">
        <header className="bg-[radial-gradient(circle_at_20%_0,var(--color-graphite-2),var(--color-graphite)_70%)] px-5 py-8 text-center text-white">
          <span className="inline-block rounded-full border border-gold/60 px-4 py-1 text-xs text-gold-light">◆ {t("badge")}</span>
          <h2 id="strategy-title" className="mt-3 text-2xl font-extrabold sm:text-3xl">{t.rich("title", { gold: (c) => <span className="text-gold-light">{c}</span> })}</h2>
          <p className="mt-2 text-sm text-silver-light">{t("horizon")}</p>
        </header>

        <Row title={t("lanes.vision")} color="#7c3aed" icon={<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />}>
          <div className="grid gap-3 md:grid-cols-2">
            {(["vision", "mission"] as const).map((k) => (
              <div key={k} className="rounded-xl border border-[#7c3aed33] bg-[#faf7ff] p-4 text-center leading-8">
                <div className="mb-1 text-xs font-extrabold text-[#7c3aed]">{t(`${k}.label`)}</div>
                {t(`${k}.text`)}
              </div>
            ))}
          </div>
        </Row>

        {LANES.map((lane) => (
          <Row key={lane.key} title={t(`lanes.${lane.key}`)} color={lane.color} icon={lane.icon}>
            <div className="space-y-3">
              {lane.chains.map((chain, ci) => (
                <ol key={ci} className="flex flex-col items-stretch gap-1.5 lg:flex-row lg:items-center lg:gap-2">
                  {chain.map((k, i) => (
                    <li key={k} className="contents">
                      {i > 0 && <span aria-hidden className="self-center font-extrabold" style={{ color: lane.color }}><span className="lg:hidden">↓</span><span className="hidden lg:inline">⟵</span></span>}
                      <span
                        className="flex-1 rounded-xl border-[1.5px] px-3 py-2.5 text-center text-sm font-bold"
                        style={i === 0 && ci === 0 ? { backgroundColor: lane.color, borderColor: lane.color, color: "#fff" } : { borderColor: lane.soft, color: lane.ink }}
                      >
                        {t(`goals.${k}`)}
                      </span>
                    </li>
                  ))}
                </ol>
              ))}
            </div>
          </Row>
        ))}

        <Row title={t("lanes.values")} color="#9333ea" icon={<path d="M6 3h12l3 6-9 12L3 9l3-6Zm-3 6h18M12 21 8 9l4-6 4 6-4 12" />}>
          <ul className="grid grid-cols-4 gap-3 text-center sm:grid-cols-7">
            {VALUES.map((v) => (
              <li key={v}>
                <span className="mx-auto mb-1.5 grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#a855f7] text-xl font-extrabold text-white shadow-soft">{t(`values.${v}.letter`)}</span>
                <span className="text-xs font-bold leading-5">{t(`values.${v}.name`)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-center text-xs font-extrabold text-[#7c3aed]">{t("valuesWord")}</p>
        </Row>

        <footer className="flex flex-wrap justify-between gap-2 border-t border-border px-5 py-3 text-xs text-text-3">
          <span>{t("date")}</span>
          <span>{t("version")}</span>
        </footer>
      </div>
    </section>
  );
}

function Row({ title, color, icon, children }: { title: string; color: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid border-t border-border md:grid-cols-[150px_1fr]">
      <div className="flex items-center justify-center gap-2 px-4 py-3 text-center font-extrabold text-white md:flex-col md:py-5" style={{ background: `linear-gradient(160deg, ${color}, ${color}dd)` }}>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-white/20" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
        </span>
        {title}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
