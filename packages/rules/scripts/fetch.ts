/**
 * Dev-only artefact fetcher for @passwerk/rules.
 *
 * Reads artefacts/manifest.json, downloads every pinned artefact from its immutable URL,
 * verifies its sha256 against the manifest and writes bundled files under artefacts/.
 *
 *   pnpm artefacts            fetch + verify (fails on any checksum mismatch)
 *   pnpm artefacts:write      fetch + (re)pin checksums and sizes into the manifest
 *   pnpm artefacts:verify     offline: hash the bundled files and compare to the manifest
 *
 * This script is never executed at runtime. The runtime packages import the bundled
 * files directly and make no network calls (see docs/DECISIONS.md D-002 and the
 * sovereignty test).
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface Artefact {
  id: string;
  source: string;
  title: string;
  version: string;
  url: string;
  /** Path relative to artefacts/, or null when only the checksum is recorded. */
  path: string | null;
  sha256: string;
  bytes: number;
}

interface Manifest {
  $comment: string;
  retrievedAt: string;
  sources: Record<string, Record<string, string>>;
  artefacts: Artefact[];
}

const here = dirname(fileURLToPath(import.meta.url));
const artefactsDir = resolve(here, '../artefacts');
const manifestPath = resolve(artefactsDir, 'manifest.json');

const writeMode = process.argv.includes('--write');
const verifyOnly = process.argv.includes('--verify');

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'passwerk-artefact-fetcher (dev only)' },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${url}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function readLocal(relativePath: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(resolve(artefactsDir, relativePath)));
  } catch {
    return null;
  }
}

type Outcome = 'ok' | 'pinned' | 'written' | 'CHANGED' | 'MISSING' | 'MISMATCH' | 'ERROR';

async function processArtefact(artefact: Artefact): Promise<Outcome> {
  if (verifyOnly) {
    if (artefact.path === null) return 'ok';
    const local = await readLocal(artefact.path);
    if (local === null) return 'MISSING';
    return sha256(local) === artefact.sha256 ? 'ok' : 'MISMATCH';
  }

  const remote = await download(artefact.url);
  const digest = sha256(remote);

  if (writeMode) {
    const outcome: Outcome =
      artefact.sha256 === '' ? 'pinned' : artefact.sha256 === digest ? 'ok' : 'CHANGED';
    artefact.sha256 = digest;
    artefact.bytes = remote.byteLength;
    if (artefact.path !== null) {
      const target = resolve(artefactsDir, artefact.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, remote);
    }
    return outcome;
  }

  if (artefact.sha256 !== digest) return 'MISMATCH';
  if (artefact.path !== null) {
    const local = await readLocal(artefact.path);
    if (local === null || sha256(local) !== digest) {
      const target = resolve(artefactsDir, artefact.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, remote);
      return 'written';
    }
  }
  return 'ok';
}

async function main(): Promise<void> {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
  let failures = 0;

  for (const artefact of manifest.artefacts) {
    let outcome: Outcome;
    try {
      outcome = await processArtefact(artefact);
    } catch (error) {
      outcome = 'ERROR';
      console.error(`  ${artefact.id}: ${(error as Error).message}`);
    }
    if (
      outcome === 'CHANGED' ||
      outcome === 'MISSING' ||
      outcome === 'MISMATCH' ||
      outcome === 'ERROR'
    ) {
      failures += 1;
    }
    console.log(
      `${outcome.padEnd(8)} ${artefact.id}  ${artefact.sha256.slice(0, 12)}  ${artefact.bytes} B`,
    );
  }

  if (writeMode) {
    manifest.retrievedAt = new Date().toISOString().slice(0, 10);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(
      `\nmanifest updated (${manifest.artefacts.length} artefacts, retrievedAt ${manifest.retrievedAt})`,
    );
  }

  if (failures > 0) {
    console.error(
      `\n${failures} artefact(s) failed. A CHANGED upstream file means the pinned URL is not immutable or the publisher replaced the artefact; investigate before re-pinning.`,
    );
    process.exit(1);
  }
  console.log(
    `\nall ${manifest.artefacts.length} artefacts ${verifyOnly ? 'verified offline' : 'fetched and verified'}`,
  );
}

await main();
