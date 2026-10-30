"use client";

import { deleteAnalysisAction } from "@/app/[locale]/analysis/actions";

/** The author's «حذف» on their own analysis, after a confirmation. */
export function DeletePostButton({ id, label, confirm }: { id: string; label: string; confirm: string }) {
  return (
    <form action={deleteAnalysisAction} onSubmit={(e) => !window.confirm(confirm) && e.preventDefault()}>
      <input type="hidden" name="id" value={id} />
      <button className="min-h-8 rounded-lg px-2 text-xs font-bold text-down hover:bg-down-bg">{label}</button>
    </form>
  );
}
