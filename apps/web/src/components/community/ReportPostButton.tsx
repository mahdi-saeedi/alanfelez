"use client";

import { useState, useTransition } from "react";
import { reportAnalysisAction } from "@/app/[locale]/analysis/actions";

/**
 * «گزارش» on someone else's analysis (client, 2026-10-30): posts go live at once, so members flag unsuitable ones and
 * staff see them first in the admin. One report per member; after it the button says so.
 */
export function ReportPostButton({ id, done, labels }: { id: string; done: boolean; labels: { report: string; confirm: string; reported: string } }) {
  const [reported, setReported] = useState(done);
  const [pending, start] = useTransition();
  if (reported) return <span className="text-xs text-text-3">{labels.reported}</span>;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => window.confirm(labels.confirm) && start(async () => setReported(await reportAnalysisAction(id)))}
      className="min-h-8 rounded-lg px-2 text-xs text-text-3 hover:bg-surface-2 hover:text-down disabled:opacity-50"
    >
      {labels.report}
    </button>
  );
}
