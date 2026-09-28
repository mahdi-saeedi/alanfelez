import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const config: NextConfig = {
  output: "standalone", // small production image (Dockerfile)
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."), // monorepo root
  transpilePackages: ["@alanfelez/ui", "@alanfelez/api-client"],
  poweredByHeader: false,
};

export default withNextIntl(config);
