# syntax=docker/dockerfile:1
# passwerk MCP server, Streamable HTTP mode (ADR D-034). Multi-stage: build with pnpm, run on
# distroless Node 22 as non-root. Needs PASSWERK_AUTH_TOKEN; mounts documents at /data.
FROM node:22-bookworm-slim AS build
RUN corepack enable
WORKDIR /src
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build && pnpm build:mcp-app
RUN pnpm --filter @passwerk/server --prod deploy --legacy /out && mkdir -p /data/documents /data/output

FROM gcr.io/distroless/nodejs22-debian12:nonroot
LABEL org.opencontainers.image.title="passwerk" \
      org.opencontainers.image.description="Offline EU Digital Battery Passport toolkit: MCP server in Streamable HTTP mode" \
      org.opencontainers.image.source="https://github.com/ShahriarBijoy/passwerk" \
      org.opencontainers.image.licenses="Apache-2.0" \
      io.modelcontextprotocol.server.name="io.github.ShahriarBijoy/passwerk"
WORKDIR /app
COPY --from=build --chown=nonroot:nonroot /out /app
COPY --from=build --chown=nonroot:nonroot /data /data
ENV NODE_ENV=production PASSWERK_ROOT=/data
EXPOSE 3777
CMD ["dist/bin.js", "--http", "3777", "--host", "0.0.0.0"]
