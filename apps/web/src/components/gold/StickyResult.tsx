"use client";

import { useEffect, useState } from "react";

/**
 * On phones the result sits below a long form; while it's off screen this bar shows the value above the bottom tabs,
 * and a tap scrolls to the full result (client, 2026-10-31). Hidden from md up and while the result is in view.
 */
export function StickyResult({ target, label, value }: { target: string; label: string; value: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = document.getElementById(target);
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [target]);
  if (visible) return null;
  return (
    <button
      type="button"
      onClick={() => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" })}
      className="fixed inset-x-3 bottom-20 z-30 flex items-center justify-between gap-3 rounded-card bg-graphite px-4 py-3 text-white shadow-card md:hidden"
    >
      <span className="text-xs text-silver-light">{label}</span>
      <span className="font-extrabold tabular-nums">{value}</span>
    </button>
  );
}
