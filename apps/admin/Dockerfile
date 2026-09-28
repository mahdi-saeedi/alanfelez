# syntax=docker/dockerfile:1.7
# Admin SPA (Refine). Build context = repository root:  docker build -f apps/admin/Dockerfile -t alanfelez/admin .
# BUILD_STAGE=prebuilt packages a `vite build` made on the host (task build:local).
ARG NODE_IMAGE=node:24-alpine
ARG BUILD_STAGE=build

FROM ${NODE_IMAGE} AS build
RUN corepack enable pnpm
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/admin ./apps/admin
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --filter @alanfelez/admin...
RUN pnpm --filter @alanfelez/admin build && mkdir -p /out && cp -r apps/admin/dist apps/admin/server.mjs /out/

FROM scratch AS prebuilt
COPY apps/admin/dist /out/dist
COPY apps/admin/server.mjs /out/server.mjs

FROM ${BUILD_STAGE} AS artifact

FROM ${NODE_IMAGE}
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=artifact --chown=node:node /out/ ./
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
CMD ["node", "server.mjs"]
