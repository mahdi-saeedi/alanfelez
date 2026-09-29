import { headers } from "next/headers";

/**
 * Structured data (NFR SEO-3). Escaped so data can't close the script tag, and carries this request's CSP nonce.
 * Only describe what the page really shows (FAQ: visible questions; locked articles: no body).
 */
export async function JsonLd({ data }: { data: object }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return <script type="application/ld+json" nonce={nonce} dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
