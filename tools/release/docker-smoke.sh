#!/usr/bin/env bash
# Starts the image with a token and proves /healthz and an authenticated initialize + tools/list.
#   docker build -t passwerk:smoke . && tools/release/docker-smoke.sh passwerk:smoke
set -euo pipefail
IMAGE="${1:-passwerk:smoke}"
TOKEN="smoke-$(date +%s)"
ID=$(docker run -d --rm -e PASSWERK_AUTH_TOKEN="$TOKEN" -p 127.0.0.1:3777:3777 "$IMAGE")
trap 'docker rm -f "$ID" >/dev/null 2>&1 || true' EXIT
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
echo "ok: authenticated tools/list"
UNAUTH=$(curl -sS -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:3777/mcp -H "Content-Type: application/json" -d '{}')
[ "$UNAUTH" = "401" ] || { echo "expected 401 without token, got $UNAUTH"; exit 1; }
echo "ok: 401 without token"
echo "docker smoke: OK"
