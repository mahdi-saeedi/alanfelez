// Where an article lives on the site: the educational «مقالات» under /articles, news and analyses under /analysis
// (client, 2026-11-04). A plain module: used by server pages, the sitemap and search.

/** The section an article type belongs to. */
export const articleBase = (type: string): "/articles" | "/analysis" => (type === "article" ? "/articles" : "/analysis");

/** The page of one article. */
export const articleHref = (a: { type: string; slug: string }) => `${articleBase(a.type)}/${a.slug}`;
