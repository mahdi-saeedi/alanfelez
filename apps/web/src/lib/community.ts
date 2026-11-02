import "server-only";
import { cache } from "react";
import type { Schemas } from "@alanfelez/api-client";
import { callerApi } from "./api";
import type { Locale } from "./prices";

export type CommunityPost = Schemas["CommunityPost"];
export type CommunityPostList = Schemas["CommunityPostList"];
export type CommunityPostInput = Schemas["CommunityPostInput"];

/**
 * Members' analyses («تحلیل کاربران», client 2026-10-30). Silver and Gold get the posts; others get `locked` and the
 * count only (the API never sends them). Personal (mine, posts left today), so never cached.
 */
export const getCommunityPosts = cache(async (locale: Locale, query: { metal?: string; page?: number; limit?: number } = {}) => {
  const { client } = await callerApi();
  const res = await client.GET("/v1/community/posts", { params: { header: { "Accept-Language": locale }, query }, cache: "no-store" });
  return res.data ?? null;
});

/** Publishes a post; `problem` is the API's refusal (400 detail, 403 locked, 429 three a day). */
export async function createCommunityPost(locale: Locale, body: CommunityPostInput) {
  const { client, personal } = await callerApi();
  if (!personal) return { status: 401 } as const;
  const res = await client.POST("/v1/community/posts", { params: { header: { "Accept-Language": locale } }, body, cache: "no-store" });
  return { status: res.response.status, post: res.data, problem: res.error } as const;
}

export async function reportCommunityPost(id: string) {
  const { client, personal } = await callerApi();
  if (!personal) return 401;
  const res = await client.POST("/v1/community/posts/{id}/report", { params: { path: { id } }, cache: "no-store" });
  return res.response.status;
}

export async function deleteCommunityPost(id: string) {
  const { client, personal } = await callerApi();
  if (!personal) return 401;
  const res = await client.DELETE("/v1/community/posts/{id}", { params: { path: { id } }, cache: "no-store" });
  return res.response.status;
}

export type Discussion = Schemas["Discussion"];
export type DiscussionKind = Schemas["DiscussionKind"];
export type RatingSummary = Schemas["RatingSummary"];
export type Comment = Schemas["Comment"];

/** Rating and comments of a member's analysis or a team article (client, 2026-11-02); personal, never cached. */
export async function getDiscussion(kind: DiscussionKind, id: string) {
  const { client } = await callerApi();
  const res = await client.GET("/v1/discussions/{kind}/{id}", { params: { path: { kind, id } }, cache: "no-store" });
  return res.data ?? null;
}

export async function rateDiscussion(kind: DiscussionKind, id: string, stars: number) {
  const { client, personal } = await callerApi();
  if (!personal) return { status: 401 } as const;
  const res = await client.PUT("/v1/discussions/{kind}/{id}/rating", { params: { path: { kind, id } }, body: { stars }, cache: "no-store" });
  return { status: res.response.status, rating: res.data } as const;
}

export async function commentDiscussion(kind: DiscussionKind, id: string, body: string) {
  const { client, personal } = await callerApi();
  if (!personal) return { status: 401 } as const;
  const res = await client.POST("/v1/discussions/{kind}/{id}/comments", { params: { path: { kind, id } }, body: { body }, cache: "no-store" });
  return { status: res.response.status, comment: res.data, problem: res.error } as const;
}
