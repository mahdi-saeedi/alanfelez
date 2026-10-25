# syntax=docker/dockerfile:1.7
# Custom Keycloak image (ADR-0022):
#   - extensions: phone-OTP authenticator + pluggable SMS sender SPI   (services/keycloak/extensions, Java)
#   - theme:      "alanfelez" login theme built with Keycloakify        (apps/keycloak-theme, React + Tailwind)
# Build context = repository root:
#   docker build -f services/keycloak/Dockerfile -t alanfelez/keycloak .
#
# *_STAGE=…-prebuilt use jars built on the host (task build:local) instead of building in Docker. Useful on slow
# networks. CI always uses the default, reproducible *-build stages.

ARG KEYCLOAK_VERSION=26.8.1
ARG EXTENSIONS_STAGE=extensions-build
ARG THEME_STAGE=theme-build

# --- extensions (Maven) -----------------------------------------------------------------------------
FROM maven:3.9-eclipse-temurin-21 AS extensions-build
ARG KEYCLOAK_VERSION
WORKDIR /src
COPY services/keycloak/extensions/pom.xml .
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -Dkeycloak.version=${KEYCLOAK_VERSION} dependency:go-offline
COPY services/keycloak/extensions/src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -Dkeycloak.version=${KEYCLOAK_VERSION} package \
    && mkdir -p /out && cp target/alanfelez-keycloak-extensions.jar /out/

FROM scratch AS extensions-prebuilt
COPY services/keycloak/extensions/target/alanfelez-keycloak-extensions.jar /out/

# --- theme (Keycloakify needs Node + Maven) -----------------------------------------------------------
FROM node:24-bookworm-slim AS node

FROM maven:3.9-eclipse-temurin-21 AS theme-build
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/corepack/dist/corepack.js /usr/local/bin/corepack \
    && ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && corepack enable pnpm
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/ui packages/ui
COPY apps/keycloak-theme apps/keycloak-theme
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --filter @alanfelez/keycloak-theme...
RUN --mount=type=cache,target=/root/.m2 cd apps/keycloak-theme && pnpm build-keycloak-theme \
    && mkdir -p /out && cp dist_keycloak/alanfelez-keycloak-theme.jar /out/

# --- user profile (for the profile-sync job: Keycloak imports the realm file only once) ---------------------
FROM node AS user-profile
COPY services/keycloak/realm/alanfelez-realm.json /src/realm.json
RUN mkdir -p /out && node -e 'const r = require("/src/realm.json"); process.stdout.write(r.components["org.keycloak.userprofile.UserProfileProvider"][0].config["kc.user.profile.config"][0])' > /out/user-profile.json

FROM scratch AS theme-prebuilt
COPY apps/keycloak-theme/dist_keycloak/alanfelez-keycloak-theme.jar /out/

# --- Keycloak -----------------------------------------------------------------------------------------
FROM ${EXTENSIONS_STAGE} AS extensions
FROM ${THEME_STAGE} AS theme

FROM quay.io/keycloak/keycloak:${KEYCLOAK_VERSION} AS builder
ENV KC_DB=postgres KC_HEALTH_ENABLED=true KC_METRICS_ENABLED=true
COPY --from=extensions /out/ /opt/keycloak/providers/
COPY --from=theme /out/ /opt/keycloak/providers/
RUN /opt/keycloak/bin/kc.sh build

FROM quay.io/keycloak/keycloak:${KEYCLOAK_VERSION}
COPY --from=builder /opt/keycloak/ /opt/keycloak/
# Production-safe realm (no users). Imported with --import-realm only if the realm doesn't exist yet.
COPY services/keycloak/realm/alanfelez-realm.json /opt/keycloak/data/import/alanfelez-realm.json
# The realm's user profile on its own, applied to existing realms by the keycloak-profile job (Helm).
COPY --from=user-profile /out/user-profile.json /opt/keycloak/data/user-profile.json
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized"]
