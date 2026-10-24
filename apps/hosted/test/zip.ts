import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export interface FetchedZip {
  status: number;
  bytes: number;
  sha256: string;
  /** Entry path to the SHA-256 of its bytes, in the zip's own order. */
  entries: [string, string][];
}

/** GETs a run's download link and reads the zip back. */
export async function fetchZip(url: string): Promise<FetchedZip> {
  const res = await fetch(url);
  const body = new Uint8Array(await res.arrayBuffer());
  const entries =
    res.status === 200
      ? Object.entries(unzipSync(body)).map(([path, b]): [string, string] => [path, sha256(b)])
      : [];
  return { status: res.status, bytes: body.byteLength, sha256: sha256(body), entries };
}

/** The entries a run's outcomes promise: `<modelId>/<file>` and the digest the result reports. */
export function expectedEntries(
  models: { modelId: string; artefacts: { file: string; sha256: string }[] }[],
): [string, string][] {
  return models.flatMap((m) =>
    m.artefacts.map((a): [string, string] => [`${m.modelId}/${a.file}`, a.sha256]),
  );
}
