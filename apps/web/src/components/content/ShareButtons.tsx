"use client";

import { useState } from "react";

/**
 * Share an article (client, 2026-10-30): Telegram and WhatsApp links, the phone's own share sheet where there is one
 * (it covers Bale, Eitaa and the rest), and «کپی لینک». Plain links, so nothing loads from those services until tapped.
 */
export function ShareButtons({ url, title, labels }: { url: string; title: string; labels: { share: string; copy: string; copied: string; more: string } }) {
  const [copied, setCopied] = useState(false);
  const [native] = useState(() => typeof navigator !== "undefined" && "share" in navigator);
  const text = encodeURIComponent(title);
  const link = encodeURIComponent(url);
  const btn = "inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm hover:border-gold";
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={labels.share} role="group">
      <span className="text-sm font-bold text-text-2">{labels.share}</span>
      <a className={btn} href={`https://t.me/share/url?url=${link}&text=${text}`} target="_blank" rel="noopener noreferrer">Telegram</a>
      <a className={btn} href={`https://wa.me/?text=${text}%20${link}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
      {native && (
        <button type="button" className={btn} onClick={() => navigator.share({ title, url }).catch(() => {})}>
          {labels.more}
        </button>
      )}
      <button
        type="button"
        className={btn}
        onClick={() => {
          navigator.clipboard?.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
      >
        {copied ? labels.copied : labels.copy}
      </button>
    </div>
  );
}
