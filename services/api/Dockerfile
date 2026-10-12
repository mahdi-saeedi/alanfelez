# syntax=docker/dockerfile:1.7
# Backend image: one static binary, several roles (serve | migrate | seed | bootstrap).
# Build context = repository root (the image also carries config/seed).
#   docker build -f services/api/Dockerfile -t alanfelez/api .

ARG GO_VERSION=1.27.2
# Runtime base is overridable, e.g. to pull through a registry mirror reachable from Iran.
ARG RUNTIME_IMAGE=gcr.io/distroless/static-debian12:nonroot
# BUILD_STAGE=prebuilt packages a binary built on the host (task build:local) instead of compiling in Docker.
# Useful on slow networks; CI always uses the default reproducible "build" stage.
ARG BUILD_STAGE=build

FROM golang:${GO_VERSION}-alpine AS build
WORKDIR /src/services/api
ENV CGO_ENABLED=0 GOFLAGS=-trimpath
COPY services/api/go.mod services/api/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY services/api/ ./
ARG VERSION=dev
ARG COMMIT=none
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    go build -ldflags "-s -w -X main.version=${VERSION} -X main.commit=${COMMIT}" -o /out/alanfelez ./cmd/alanfelez

FROM scratch AS prebuilt
COPY services/api/bin/alanfelez /out/alanfelez

FROM ${BUILD_STAGE} AS binary

FROM ${RUNTIME_IMAGE}
LABEL org.opencontainers.image.title="alanfelez-api" \
      org.opencontainers.image.source="https://github.com/alanfelez/alanfelez"
WORKDIR /app
COPY --from=binary /out/alanfelez /app/alanfelez
COPY config/seed /app/config/seed
ENV SEED_DIR=/app/config/seed HTTP_ADDR=:8080
USER 65532:65532
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=4s --start-period=20s --retries=3 CMD ["/app/alanfelez", "healthcheck"]
ENTRYPOINT ["/app/alanfelez"]
CMD ["serve"]
