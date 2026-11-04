"use client";

import { useState } from "react";

/**
 * An article's Aparat video (client, 2026-11-04): its picture with a play button first; a click puts Aparat's player
 * in its place (nothing loads from Aparat until then). Only Aparat links reach here (the API checks them).
 */
export function VideoPoster({ videoUrl, coverUrl, title, play }: { videoUrl: string; coverUrl?: string; title: string; play: string }) {
  const [open, setOpen] = useState(false);
  const hash = /^https:\/\/www\.aparat\.com\/v\/([A-Za-z0-9]+)$/.exec(videoUrl)?.[1];
  if (!hash) return null;
  return (
    <div className="relative mt-6 aspect-video w-full overflow-hidden rounded-card bg-graphite">
      {open ? (
        <iframe
          src={`https://www.aparat.com/video/video/embed/videohash/${hash}/vt/frame?autoplay=true`}
          title={title}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <button type="button" onClick={() => setOpen(true)} aria-label={play} className="group absolute inset-0 h-full w-full">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span aria-hidden className="block h-full w-full bg-gradient-to-br from-graphite to-graphite-2" />
          )}
          <span aria-hidden className="absolute inset-0 bg-black/25 transition group-hover:bg-black/10" />
          <span aria-hidden className="absolute inset-0 m-auto grid h-16 w-16 place-items-center rounded-full bg-gold text-graphite shadow-lg transition group-hover:scale-110">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor"><path d="M9 5v14l11-7z" /></svg>
          </span>
        </button>
      )}
    </div>
  );
}
