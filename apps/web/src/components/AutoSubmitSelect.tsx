"use client";

import type { ReactNode } from "react";

/**
 * A <select> that submits its GET form on change (the form still works without JS via its submit button).
 * `hideLabel` keeps the label for screen readers only, when the first option already says what to pick.
 */
export function AutoSubmitSelect({ name, value, label, hideLabel = false, children }: { name: string; value: string; label: string; hideLabel?: boolean; children: ReactNode }) {
  return (
    // max-w-full: a select is as wide as its longest option, which must not widen the page on phones.
    <label className="flex min-w-0 max-w-full flex-col gap-1 text-xs text-text-2">
      <span className={hideLabel ? "sr-only" : undefined}>{label}</span>
      <select
        name={name}
        defaultValue={value}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="max-w-full truncate rounded-control border border-border bg-surface px-3 py-2 text-sm text-text"
      >
        {children}
      </select>
    </label>
  );
}
