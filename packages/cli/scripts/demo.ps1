# Phase 6 definition of done (ADR D-031), run from the repository root after `pnpm build`.
# Steps 1 to 5 need no key and no network. Step 6 (`chat`) needs ANTHROPIC_API_KEY and is
# skipped without one; its scripted equivalent runs in CI (packages/cli/test/chat.test.ts).
$Passwerk = 'packages/cli/dist/bin.js'
$Docs = 'packages/core/test/fixtures/musterwerk'
$Samples = 'packages/core/src/samples'
$Out = if ($env:PASSWERK_DEMO_OUT) { $env:PASSWERK_DEMO_OUT } else { 'out/demo' }
New-Item -ItemType Directory -Force $Out | Out-Null

function Step($title) { Write-Host "`n== $title" }
function Show() { Write-Host "-- exit $LASTEXITCODE" }

Step '1. Is a passport required? (EV, manufacturer, placed on the market 2027-06-01)'
node $Passwerk obligations --type EV --role manufacturer --placed-on-market 2027-06-01; Show

Step '2. Extract facts and propose mappings from the Musterwerk documents'
node $Passwerk extract $Docs --category EV --out "$Out/musterwerk.facts.json"; Show

Step '3. Audit the golden drafts (valid -> 0, warnings -> 1, invalid -> 2)'
foreach ($s in 'ev-valid', 'lmt-valid', 'industrial-valid', 'ev-document-without-classification', 'lmt-missing-state-of-charge') {
  Write-Host -NoNewline "${s}: "; node $Passwerk audit "$Samples/$s.json" | Out-Null; Show
}

Step '4. Gap report of a broken draft, grouped by data owner'
node $Passwerk gaps "$Samples/lmt-missing-state-of-charge.json"; Show

Step '5. Emit the valid EV passport (AAS JSON, AASX, draft JSON) and re-validate'
node $Passwerk emit "$Samples/ev-valid.json" --out $Out; Show

Step '5b. Write the QR data carrier of the passport identifier'
node $Passwerk carrier "$Samples/ev-valid.json" --out "$Out/passport.qr.svg"; Show

Step '6. Chat demo (needs ANTHROPIC_API_KEY)'
if ($env:ANTHROPIC_API_KEY) {
  node $Passwerk chat --lang de --root . -m "Erstelle einen Batteriepass aus $Docs und gib mir die Lückenliste."; Show
} else {
  Write-Host 'skipped: ANTHROPIC_API_KEY is not set'
}
