"use client";

import type { ReactNode } from "react";

/** A <select> that submits its GET form on change (the form still works without JS via its submit button). */
export function AutoSubmitSelect({ name, value, label, children }: { name: string; value: string; label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-text-2">
      {label}
      <select
        name={name}
        defaultValue={value}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-control border border-border bg-surface px-3 py-2 text-sm text-text"
      >
        {children}
      </select>
    </label>
  );
}
