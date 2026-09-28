import type { DataProvider } from "@refinedev/core";
import { config } from "../config";
import { userManager } from "./authProvider";

/**
 * Refine data provider for the Go API (API_GUIDELINES.md): lists are `{ items: [...] }`, errors are RFC 9457.
 * Read-only for now; admin write endpoints (/v1/admin/...) arrive with M2.
 */
async function request<T>(path: string): Promise<T> {
  const user = await userManager.getUser();
  const res = await fetch(`${config.apiUrl}${path}`, {
    headers: {
      "Accept-Language": document.documentElement.lang || "fa",
      ...(user ? { Authorization: `Bearer ${user.access_token}` } : {}),
    },
  });
  if (!res.ok) {
    const problem = (await res.json().catch(() => ({}))) as { title?: string };
    throw { status: res.status, message: problem.title ?? res.statusText };
  }
  return (await res.json()) as T;
}

const unsupported = () => Promise.reject(new Error("Not supported yet"));

export const dataProvider: DataProvider = {
  getApiUrl: () => config.apiUrl,
  getList: async ({ resource }) => {
    const { items } = await request<{ items: unknown[] }>(`/v1/${resource}`);
    return { data: items as never[], total: items.length };
  },
  getOne: unsupported,
  create: unsupported,
  update: unsupported,
  deleteOne: unsupported,
};
