"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * The eNamad trust seal. The page never waits for it: the image loads on its own, and the badge stays hidden
 * (taking no space) until it has actually loaded. If trustseal.enamad.ir is slow, down or blocked, users see nothing
 * missing and no layout moves. Only eNamad's link and image are used, never its scripts. eNamad checks the
 * referrer's origin, hence referrerPolicy="origin".
 */
export function EnamadBadge({ id, code, className = "" }: { id: string; code: string; className?: string }) {
  const t = useTranslations("footer");
  const img = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  const q = `id=${encodeURIComponent(id)}&Code=${encodeURIComponent(code)}`;

  // The image may finish before React hydrates (cached), in which case onLoad already fired unseen.
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth > 0) setLoaded(true);
  }, []);

  return (
    <div hidden={!loaded} className={className}>
      <a href={`https://trustseal.enamad.ir/?${q}`} target="_blank" rel="noopener" referrerPolicy="origin" aria-label={t("enamad")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- eNamad serves the seal itself; next/image would proxy it */}
        <img
          ref={img}
          src={`https://trustseal.enamad.ir/logo.aspx?${q}`}
          alt={t("enamad")}
          referrerPolicy="origin"
          decoding="async"
          fetchPriority="low"
          width={85}
          height={92}
          className="h-[92px] w-auto rounded-md bg-white p-1"
          onLoad={(e) => setLoaded(e.currentTarget.naturalWidth > 0)}
          onError={() => setLoaded(false)}
        />
      </a>
    </div>
  );
}
