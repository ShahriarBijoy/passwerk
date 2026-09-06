#!/usr/bin/env sh
# Phase 6 definition of done (ADR D-031), run from the repository root after `pnpm build`.
# Steps 1 to 5 need no key and no network. Step 6 (`chat`) needs ANTHROPIC_API_KEY and is
# skipped without one; its scripted equivalent runs in CI (packages/cli/test/chat.test.ts).
set -u
PASSWERK="node packages/cli/dist/bin.js"
DOCS="packages/core/test/fixtures/musterwerk"
SAMPLES="packages/core/src/samples"
OUT="${PASSWERK_DEMO_OUT:-out/demo}"
mkdir -p "$OUT"

step() { printf '\n== %s\n' "$1"; }
show() { printf -- '-- exit %s\n' "$?"; }

step "1. Is a passport required? (EV, manufacturer, placed on the market 2027-06-01)"
$PASSWERK obligations --type EV --role manufacturer --placed-on-market 2027-06-01; show

step "2. Extract facts and propose mappings from the Musterwerk documents"
$PASSWERK extract "$DOCS" --category EV --out "$OUT/musterwerk.facts.json"; show

step "3. Audit the golden drafts (valid -> 0, warnings -> 1, invalid -> 2)"
for s in ev-valid lmt-valid industrial-valid ev-document-without-classification lmt-missing-state-of-charge; do
  printf '%s: ' "$s"; $PASSWERK audit "$SAMPLES/$s.json" >/dev/null; show
done

step "4. Gap report of a broken draft, grouped by data owner"
$PASSWERK gaps "$SAMPLES/lmt-missing-state-of-charge.json"; show

step "5. Emit the valid EV passport (AAS JSON, AASX, draft JSON) and re-validate"
$PASSWERK emit "$SAMPLES/ev-valid.json" --out "$OUT"; show

step "5b. Write the QR data carrier of the passport identifier"
$PASSWERK carrier "$SAMPLES/ev-valid.json" --out "$OUT/passport.qr.svg"; show

step "6. Chat demo (needs ANTHROPIC_API_KEY)"
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  $PASSWERK chat --lang de --root . -m "Erstelle einen Batteriepass aus $DOCS und gib mir die Lückenliste."; show
else
  echo "skipped: ANTHROPIC_API_KEY is not set"
fi
