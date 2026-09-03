# CI-only image (ADR D-013): dependencies are installed with the network on, then CI runs the
# container with `--network none` so the whole test suite is proven to make zero network calls.
FROM node:22-bookworm-slim
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
CMD ["pnpm", "test"]
