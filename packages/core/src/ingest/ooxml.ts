import { XMLParser } from 'fast-xml-parser';
import { unzipSync } from 'fflate';
import { IngestFailure } from './types.js';

/** Unzip an OOXML package into { path: xmlText }. */
export function unzipOoxml(bytes: Uint8Array): Record<string, string> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (e) {
    throw new IngestFailure('corrupt', `not a readable zip package: ${String(e)}`);
  }
  const out: Record<string, string> = {};
  const decoder = new TextDecoder('utf-8');
  for (const [path, data] of Object.entries(entries)) {
    if (path.endsWith('.xml') || path.endsWith('.rels')) out[path] = decoder.decode(data);
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
