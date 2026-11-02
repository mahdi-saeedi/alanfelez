"use server";

import { revalidatePath } from "next/cache";
import {
  commentDiscussion, createCommunityPost, deleteCommunityPost, getDiscussion, rateDiscussion, reportCommunityPost,
  type Comment, type Discussion, type DiscussionKind, type RatingSummary,
} from "@/lib/community";

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

/** «گزارش» on someone else's analysis: true when it's recorded (or was already). */
export async function reportAnalysisAction(id: string): Promise<boolean> {
  return (await reportCommunityPost(id)) === 204;
}

export async function deleteAnalysisAction(form: FormData) {
  await deleteCommunityPost(String(form.get("id") ?? ""));
  revalidatePath("/[locale]/analysis", "page");
}

const isKind = (k: string): k is DiscussionKind => k === "post" || k === "article";
const isId = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

/** Loads a discussion when its card or article opens it (client, 2026-11-02). */
export async function loadDiscussionAction(kind: string, id: string): Promise<Discussion | null> {
  if (!isKind(kind) || !isId(id)) return null;
  return getDiscussion(kind, id);
}

export async function rateAction(kind: string, id: string, stars: number): Promise<RatingSummary | null> {
  if (!isKind(kind) || !isId(id) || !Number.isInteger(stars) || stars < 1 || stars > 5) return null;
  const res = await rateDiscussion(kind, id, stars);
  return res.status === 200 && res.rating ? res.rating : null;
}

export type CommentResult = { status: "sent"; comment: Comment } | { status: "invalid" | "claim" | "limited" | "locked" | "failed" };

export async function commentAction(kind: string, id: string, body: string): Promise<CommentResult> {
  const text = body.trim().slice(0, 1000);
  if (!isKind(kind) || !isId(id) || text.length < 2) return { status: "invalid" };
  const res = await commentDiscussion(kind, id, text);
  if (res.status === 201 && res.comment) return { status: "sent", comment: res.comment };
  if (res.status === 429) return { status: "limited" };
  if (res.status === 401 || res.status === 403) return { status: "locked" };
  if (res.status === 400) return { status: res.problem?.detail?.includes("promise") ? "claim" : "invalid" };
  return { status: "failed" };
}
