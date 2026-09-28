# syntax=docker/dockerfile:1.7
# Public website (Next.js standalone). Build context = repository root:
#   docker build -f apps/web/Dockerfile -t alanfelez/web .
# BUILD_STAGE=prebuilt packages a `next build` made on the host (task build:local), for slow networks.

ARG NODE_IMAGE=node:24-alpine
ARG BUILD_STAGE=build

FROM ${NODE_IMAGE} AS build
RUN corepack enable pnpm
WORKDIR /src
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --filter @alanfelez/web...
RUN pnpm --filter @alanfelez/web build \
    && mkdir -p /out/apps/web/.next \
    && cp -r apps/web/.next/standalone/. /out/ \
    && cp -r apps/web/.next/static /out/apps/web/.next/static \
    && cp -r apps/web/public /out/apps/web/public

FROM scratch AS prebuilt
COPY apps/web/.next/standalone/ /out/
COPY apps/web/.next/static /out/apps/web/.next/static
COPY apps/web/public /out/apps/web/public

FROM ${BUILD_STAGE} AS artifact

FROM ${NODE_IMAGE}
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=artifact --chown=node:node /out/ ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=4s --start-period=15s --retries=3 CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
