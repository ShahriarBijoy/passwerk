import { decodeBase64 } from '@passwerk/server';
import { parseLang, printJson, readJsonFile, withOutputOptions } from '../format.js';
import { invoke, toolContext } from '../invoke.js';
import { CliInputError, EXIT_USAGE } from '../io.js';
import { registerCommand } from '../program.js';

interface Options {
  uid?: string;
  gtin?: string;
  serial?: string;
  giai?: string;
  resolverBase?: string;
  format: string;
  out: string;
  lang: string;
  json?: boolean;
}

interface CarrierOut {
  uid: string;
  digitalLink?: string;
  payload: string;
  format: 'svg' | 'png';
  mediaType: string;
  image: { name: string; size: number; bytes?: string };
  sources: string[];
}

function gs1From(o: Options): { gtin: string; serial: string } | { giai: string } | undefined {
  if (o.giai !== undefined) {
    if (o.gtin !== undefined || o.serial !== undefined)
      throw new CliInputError('--giai cannot be combined with --gtin or --serial');
    return { giai: o.giai };
  }
  if (o.gtin !== undefined || o.serial !== undefined) {
    if (o.gtin === undefined || o.serial === undefined)
      throw new CliInputError('--gtin and --serial must be given together');
    return { gtin: o.gtin, serial: o.serial };
  }
  return undefined;
}

registerCommand((program, io, exit) => {
  withOutputOptions(
    program
      .command('carrier')
      .description(
        'write the QR data carrier (SVG or PNG) of a passport identifier or GS1 Digital Link',
      )
      .argument('[draft.json]', 'the PassportDraft file (omit with --uid)')
      .option('--uid <https-uri>', 'the passport identifier instead of a draft')
      .option('--gtin <digits>', 'GTIN (8, 12, 13 or 14 digits) for a GS1 Digital Link')
      .option('--serial <text>', 'serial number (with --gtin)')
      .option('--giai <text>', 'GIAI for a GS1 Digital Link (instead of --gtin/--serial)')
      .option(
        '--resolver-base <https-url>',
        'GS1 Digital Link resolver base (required with --gtin or --giai)',
      )
      .option('--format <svg|png>', 'image format', 'svg')
      .requiredOption('--out <file>', 'file to write the image to'),
  ).action(async (path: string | undefined, options: Options) => {
    const lang = parseLang(options.lang);
    if (options.format !== 'svg' && options.format !== 'png')
      throw new CliInputError(`--format must be svg or png, got "${options.format}"`);
    if ((path === undefined) === (options.uid === undefined))
      throw new CliInputError('give either a draft file or --uid');
    const gs1 = gs1From(options);
    if (gs1 !== undefined && options.resolverBase === undefined)
      throw new CliInputError('--resolver-base is required with --gtin or --giai');
    const input: Record<string, unknown> = { format: options.format };
    if (path !== undefined) input['draft'] = await readJsonFile(io, path);
    if (options.uid !== undefined) input['uid'] = options.uid;
    if (gs1 !== undefined) input['gs1'] = gs1;
    if (options.resolverBase !== undefined) input['resolverBase'] = options.resolverBase;
    const result = await invoke('generate_carrier', input, toolContext(io));
    if (result.isError) {
      io.stderr.write(`${String(result.structured['error'])}\n`);
      exit(EXIT_USAGE);
      return;
    }
    const out = result.structured as unknown as CarrierOut;
    const bytes = decodeBase64(out.image.bytes ?? '');
    const target = io.fs.resolve(options.out);
    await io.fs.writeFile(target, bytes);
    if (options.json) {
      const { image, ...rest } = out;
      printJson(io, { ...rest, path: target, size: image.size, mediaType: out.mediaType });
    } else {
      const L =
        lang === 'de'
          ? [
              `Kennung: ${out.uid}`,
              ...(out.digitalLink ? [`GS1 Digital Link: ${out.digitalLink}`] : []),
              `QR-Inhalt: ${out.payload}`,
              `Geschrieben: ${target} (${out.image.size} Bytes, ${out.mediaType})`,
              'Keine Rechtsberatung.',
            ]
          : [
              `Identifier: ${out.uid}`,
              ...(out.digitalLink ? [`GS1 Digital Link: ${out.digitalLink}`] : []),
              `QR payload: ${out.payload}`,
              `Wrote: ${target} (${out.image.size} bytes, ${out.mediaType})`,
              'Not legal advice.',
            ];
      io.stdout.write(`${L.join('\n')}\n`);
    }
    exit(0);
  });
});
