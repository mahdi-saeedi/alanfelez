"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Schemas } from "@alanfelez/api-client";

type Row = Schemas["PriceRow"];
type Event = Schemas["PriceEvent"];

export type Live = {
  price: Schemas["Price"];
  change?: Schemas["PriceChange"];
  observedAt: string;
  /** Direction of the last live move, for a short highlight. */
  flash?: "up" | "down";
  /** Increments on every live update of this series (restarts the highlight animation). */
  tick: number;
};

type State = { live: Record<string, Live>; connected: boolean };
const Ctx = createContext<State>({ live: {}, connected: false });

function fromRows(rows: Row[]): Record<string, Live> {
  const out: Record<string, Live> = {};
  for (const r of rows) {
    if (r.price && r.observedAt) out[r.series.slug] = { price: r.price, change: r.change, observedAt: r.observedAt, tick: 0 };
  }
  return out;
}

/**
 * Live prices for the whole page. Starts from the server-rendered rows and applies SSE events from
 * /api/prices/stream (which only carries series the user may see). EventSource reconnects by itself; every
 * (re)connect starts with a snapshot, so nothing is missed. Bursts are applied once per animation frame.
 */
export function LivePricesProvider({ initial, children }: { initial: Row[]; children: ReactNode }) {
  const [state, setState] = useState<State>(() => ({ live: fromRows(initial), connected: false }));
  const pending = useRef<Event[]>([]);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/prices/stream");
    const flush = () => {
      frame.current = null;
      const batch = pending.current;
      pending.current = [];
      setState((s) => {
        const live = { ...s.live };
        for (const ev of batch) {
          const prev = live[ev.series];
          if (prev && prev.observedAt > ev.observedAt) continue; // out of order
          const moved = prev ? BigInt(ev.price.amount) - BigInt(prev.price.amount) : 0n;
          live[ev.series] = {
            price: ev.price,
            change: ev.change,
            observedAt: ev.observedAt,
            flash: moved > 0n ? "up" : moved < 0n ? "down" : prev?.flash,
            tick: (prev?.tick ?? 0) + (moved !== 0n ? 1 : 0),
          };
        }
        return { live, connected: true };
      });
    };
    es.addEventListener("price", (e) => {
      pending.current.push(JSON.parse((e as MessageEvent<string>).data) as Event);
      frame.current ??= requestAnimationFrame(flush);
    });
    es.onopen = () => setState((s) => ({ ...s, connected: true }));
    es.onerror = () => setState((s) => ({ ...s, connected: false }));
    return () => {
      es.close();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

/** The live value of a series (or its server-rendered value until the stream connects). */
export function useLive(slug: string): Live | undefined {
  return useContext(Ctx).live[slug];
}

export function useLiveConnected(): boolean {
  return useContext(Ctx).connected;
}
