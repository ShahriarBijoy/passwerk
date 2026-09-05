import { XMLParser } from 'fast-xml-parser';
import { unzipSync } from 'fflate';
import { IngestFailure, type IngestLimits, resolveLimits } from './types.js';

const isXmlPart = (name: string) => name.endsWith('.xml') || name.endsWith('.rels');

/**
 * Unzip an OOXML package into { path: xmlText }, within `limits` (issue #15). The input size is
 * checked before anything is read; the zip directory is walked through fflate's `filter`, which
 * runs before each entry is inflated, so entry count and the declared inflated size of the XML
 * parts are bounded before allocation and non-XML parts (media, embeddings) are never inflated.
 * The actual inflated size is checked again afterwards in case a directory entry lied.
 */
export function unzipOoxml(
  bytes: Uint8Array,
  limits: Partial<IngestLimits> = {},
): Record<string, string> {
  const lim = resolveLimits(limits);
  if (bytes.length > lim.maxInputBytes) {
    throw new IngestFailure(
      'limit_exceeded',
      `package is ${bytes.length} bytes, above the limit of ${lim.maxInputBytes} bytes`,
    );
  }
  let entries: Record<string, Uint8Array>;
  let count = 0;
  let declared = 0;
  try {
    entries = unzipSync(bytes, {
      filter: (f) => {
        count += 1;
        if (count > lim.maxArchiveEntries) {
          throw new IngestFailure(
            'limit_exceeded',
            `archive lists more than the limit of ${lim.maxArchiveEntries} entries`,
          );
        }
        if (!isXmlPart(f.name)) return false;
        declared += f.originalSize;
        if (declared > lim.maxExpandedBytes) {
          throw new IngestFailure(
            'limit_exceeded',
            `inflated XML parts exceed the limit of ${lim.maxExpandedBytes} bytes`,
          );
        }
        return true;
      },
    });
  } catch (e) {
    if (e instanceof IngestFailure) throw e;
    throw new IngestFailure('corrupt', `not a readable zip package: ${String(e)}`);
  }
  let actual = 0;
  const out: Record<string, string> = {};
  const decoder = new TextDecoder('utf-8');
  for (const [path, data] of Object.entries(entries)) {
    actual += data.length;
    if (actual > lim.maxExpandedBytes) {
      throw new IngestFailure(
        'limit_exceeded',
        `inflated XML parts exceed the limit of ${lim.maxExpandedBytes} bytes`,
      );
    }
    out[path] = decoder.decode(data);
  }
  return out;
}

const ALWAYS_ARRAY = new Set(['sheet', 'si', 'row', 'c', 'r', 'xf', 'numFmt', 'Relationship', 't']);

/** Attribute-preserving parser; tag values stay strings. */
export function xmlParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    isArray: (name) => ALWAYS_ARRAY.has(name),
  });
}

/** Concatenate every text node under a node (handles rich-text runs). */
export function textOf(node: unknown): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (typeof o['#text'] === 'string') return o['#text'];
    return Object.entries(o)
      .filter(([k]) => !k.startsWith('@_'))
      .map(([, v]) => textOf(v))
      .join('');
  }
  return '';
}
