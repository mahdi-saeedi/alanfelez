import { useList, useTranslate } from "@refinedev/core";
import type { ReactNode } from "react";

type Column<T> = { key: string; label: string; render: (row: T) => ReactNode };

/** Read-only table for a list resource (Refine useList). */
export function ResourceTable<T extends { slug?: string; code?: string }>({ resource, title, columns }: { resource: string; title: string; columns: Column<T>[] }) {
  const t = useTranslate();
  const { query, result } = useList<T>({ resource, pagination: { mode: "off" } });

  return (
    <section>
      <h1 className="mb-4 text-2xl font-extrabold">{title}</h1>
      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full text-start text-sm">
          <thead className="bg-surface-2 text-text-2">
            <tr>{columns.map((c) => <th key={c.key} className="px-4 py-3 text-start font-semibold">{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {query.isLoading && <tr><td className="px-4 py-3" colSpan={columns.length}>{t("table.loading")}</td></tr>}
            {query.isError && <tr><td className="px-4 py-3 text-down" colSpan={columns.length}>{t("table.error")}</td></tr>}
            {result.data.length === 0 && !query.isLoading && !query.isError && (
              <tr><td className="px-4 py-3" colSpan={columns.length}>{t("table.empty")}</td></tr>
            )}
            {result.data.map((row, i) => (
              <tr key={row.slug ?? row.code ?? i} className="border-t border-border">
                {columns.map((c) => <td key={c.key} className="px-4 py-3">{c.render(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
