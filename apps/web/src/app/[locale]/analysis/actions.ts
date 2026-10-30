"use server";

import { revalidatePath } from "next/cache";
import { createCommunityPost, deleteCommunityPost } from "@/lib/community";

export type PostResult = { status: "posted"; id: string } | { status: "invalid" | "claim" | "limited" | "locked" | "failed" };

/**
 * Publishes a member's analysis (text). The form then uploads the image itself to /api/community/{id}/image.
 * The status tells the form which message to show.
 */
export async function postAnalysisAction(form: FormData): Promise<PostResult> {
  const locale = form.get("locale") === "en" ? "en" : "fa";
  const str = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const outlook = str("outlook", 10);
  const res = await createCommunityPost(locale, {
    title: str("title", 150),
    body: str("body", 3000),
    metal: str("metal", 60) || undefined,
    outlook: outlook === "up" || outlook === "down" || outlook === "neutral" ? outlook : undefined,
  });
  if (res.status === 201 && res.post) {
    revalidatePath("/[locale]/analysis", "page");
    return { status: "posted", id: res.post.id };
  }
  if (res.status === 429) return { status: "limited" };
  if (res.status === 401 || res.status === 403) return { status: "locked" };
  if (res.status === 400) return { status: res.problem?.detail?.includes("promise") ? "claim" : "invalid" };
  return { status: "failed" };
}

export async function deleteAnalysisAction(form: FormData) {
  await deleteCommunityPost(String(form.get("id") ?? ""));
  revalidatePath("/[locale]/analysis", "page");
}
