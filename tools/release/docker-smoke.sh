#!/usr/bin/env bash
# Starts the image with a token and proves /healthz and an authenticated initialize + tools/list.
#   docker build -t passwerk:smoke . && tools/release/docker-smoke.sh passwerk:smoke
set -euo pipefail
IMAGE="${1:-passwerk:smoke}"
TOKEN="smoke-$(date +%s)"
OUTDIR=$(mktemp -d)
DOCS=$(mktemp -d)
cp "$(dirname "$0")/../../packages/core/test/fixtures/musterwerk/"*.{pdf,xlsx,docx,csv} "$DOCS/"
# mktemp creates mode 700; the non-root container needs to traverse and read this mount.
chmod 755 "$DOCS"
chmod 644 "$DOCS/"*
# MSYS_NO_PATHCONV scoped to these commands: Git Bash on Windows otherwise rewrites the
# POSIX-looking `-v host:/data/output` argument before handing it to native docker.exe (MSYS
# path conversion), mangling both sides of the bind mount. No-op on Linux/macOS. Left unset
# for every other command in this script (curl.exe on Windows needs the rewriting).
# The image's mktemp directory is owned by the host user, not the container's nonroot UID
# (65532); a throwaway container (reusing the already-pulled build-stage base, no extra pull)
# opens it up so the passwerk container below can write into it. True on Linux CI too, not
# just this Windows Docker Desktop bind-mount quirk.
# Even with MSYS_NO_PATHCONV=1 (which stops the container-side path from being rewritten),
# Docker Desktop on Windows still needs a real Windows path for the host side of a bind mount;
# an MSYS-style `/tmp/...` path silently mounts an empty/throwaway directory instead. `cygpath
# -w` converts it; on Linux/macOS cygpath does not exist, so fall back to the POSIX path as-is.
winpath() { command -v cygpath >/dev/null 2>&1 && cygpath -w "$1" || printf '%s' "$1"; }
MSYS_NO_PATHCONV=1 docker run --rm -v "$(winpath "$OUTDIR"):/data/output" node:22-bookworm-slim chmod 777 /data/output
# Mirrors docker-compose.yml exactly: read-only root filesystem, documents mounted read-only,
# output mounted read-write, so this proves the compose mount layout, not just the image.
ID=$(MSYS_NO_PATHCONV=1 docker run -d --rm --read-only -e PASSWERK_AUTH_TOKEN="$TOKEN" -p 127.0.0.1:3777:3777 -v "$(winpath "$DOCS"):/data/documents:ro" -v "$(winpath "$OUTDIR"):/data/output" "$IMAGE")
cleanup() {
  docker rm -f "$ID" >/dev/null 2>&1 || true
  # $OUTDIR is chmod 777 so the host user can delete it directly; if it still fails (e.g. a
  # Linux host where files the container wrote as UID 65532 block the removal), fall back to
  # emptying it from inside a container first.
  rm -rf "$OUTDIR" 2>/dev/null || {
    MSYS_NO_PATHCONV=1 docker run --rm -v "$(winpath "$OUTDIR"):/data/output" node:22-bookworm-slim rm -rf /data/output/* >/dev/null 2>&1 || true
    rm -rf "$OUTDIR" 2>/dev/null || true
  }
  rm -rf "$DOCS" 2>/dev/null || true
  rm -f "${HEADERS:-}" 2>/dev/null || true
}
trap cleanup EXIT
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3777/healthz >/dev/null 2>&1; then break; fi
  sleep 1
  if [ "$i" = 30 ]; then echo "healthz never answered"; docker logs "$ID"; exit 1; fi
done
echo "ok: /healthz"
HEADERS=$(mktemp)
curl -sS -D "$HEADERS" -o /dev/null -X POST http://127.0.0.1:3777/mcp \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
SESSION=$(grep -i '^mcp-session-id:' "$HEADERS" | tr -d '\r' | awk '{print $2}')
[ -n "$SESSION" ] || { echo "no Mcp-Session-Id"; cat "$HEADERS"; exit 1; }
curl -sS -o /dev/null -X POST http://127.0.0.1:3777/mcp \
  -H "Authorization: Bearer $TOKEN" -H "Mcp-Session-Id: $SESSION" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'
LIST=$(curl -sS -X POST http://127.0.0.1:3777/mcp \
  -H "Authorization: Bearer $TOKEN" -H "Mcp-Session-Id: $SESSION" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}')
echo "$LIST" | grep -q '"generate_carrier"' || { echo "tools/list lacks generate_carrier: $LIST"; exit 1; }
# Phase 7b (ADR D-037): the image carries the MCP App workbench the review_passport tool points at.
echo "$LIST" | grep -q '"resourceUri":"ui://passwerk/workbench.html"' || { echo "review_passport lacks its ui resourceUri: $LIST"; exit 1; }
echo "ok: authenticated tools/list"
INGEST=$(curl -sS -X POST http://127.0.0.1:3777/mcp \
  -H "Authorization: Bearer $TOKEN" -H "Mcp-Session-Id: $SESSION" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"ingest_documents","arguments":{"paths":["documents"]}}}')
echo "$INGEST" | grep -q 'stueckliste\.xlsx' || { echo "ingest_documents lacks stueckliste.xlsx: $INGEST"; exit 1; }
echo "ok: ingest_documents reads the read-only /data/documents mount"
CARRIER=$(curl -sS -X POST http://127.0.0.1:3777/mcp \
  -H "Authorization: Bearer $TOKEN" -H "Mcp-Session-Id: $SESSION" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"generate_carrier","arguments":{"uid":"https://passport.example/b/1","outDir":"output"}}}')
echo "$CARRIER" | grep -q '"path"' || { echo "generate_carrier lacks path: $CARRIER"; exit 1; }
echo "ok: generate_carrier writes to /data/output"
UNAUTH=$(curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:3777/mcp -H "Content-Type: application/json" -d '{}')
[ "$UNAUTH" = "401" ] || { echo "expected 401 without token, got $UNAUTH"; exit 1; }
echo "ok: 401 without token"
echo "docker smoke: OK"
