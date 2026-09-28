"use client";

import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

export function LocaleSwitch({ label, ariaLabel }: { label: string; ariaLabel: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  return (
    <Link
      href={pathname}
      locale={locale === "fa" ? "en" : "fa"}
      aria-label={ariaLabel}
      className="rounded-lg border border-graphite-3 px-3 py-1.5 text-sm text-silver-light hover:text-white"
    >
      {label}
    </Link>
  );
}
