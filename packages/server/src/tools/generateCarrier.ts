import { CarrierInputError, type CarrierResult, generateCarrier } from '@passwerk/core';
import { z } from 'zod';
import { encodeBase64 } from '../base64.js';
import { DraftRef, resolveDraft } from '../refs.js';
import { out, type ToolDefinition } from '../types.js';
import { slug } from './emitPassport.js';

const inputSchema = {
  draft: DraftRef.optional().describe('The draft whose meta.passportId is the identifier'),
  uid: z
    .string()
    .optional()
    .describe('The passport identifier (absolute https URI) when no draft is given'),
  gs1: z
    .union([z.object({ gtin: z.string(), serial: z.string() }), z.object({ giai: z.string() })])
    .optional()
    .describe('GS1 key: GTIN (8, 12, 13 or 14 digits) plus serial, or a GIAI'),
  resolverBase: z
    .string()
    .optional()
    .describe('https base of the GS1 Digital Link resolver; required with gs1'),
  format: z.enum(['svg', 'png']).optional().describe('Image format (default svg)'),
  outDir: z
    .string()
    .optional()
    .describe(
      'Directory to write the image into (needs a file system). Omit to receive base64 bytes inline',
    ),
};

const outputSchema = out({
  draftId: z.string().optional(),
  uid: z.string().optional(),
  digitalLink: z.string().optional(),
  payload: z.string().optional(),
  format: z.enum(['svg', 'png']).optional(),
  mediaType: z.string().optional(),
  image: z
    .object({
      name: z.string(),
      size: z.number(),
      path: z.string().optional(),
      bytes: z.string().optional().describe('base64'),
    })
    .optional(),
  isNotLegalAdvice: z.literal(true).optional(),
  sources: z.array(z.string()).optional(),
});

export const generateCarrierTool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: 'generate_carrier',
  title: 'Generate the data carrier (QR code)',
  description:
    'Builds the data carrier for a passport: the unique identifier (the draft’s passportId, an absolute https URI), an optional GS1 Digital Link (/01/{gtin}/21/{serial} or /8004/{giai}) and the QR code as SVG or PNG. The QR encodes the Digital Link when GS1 data is given, else the identifier. Says nothing about validity; validate_passport does.',
  inputSchema,
  outputSchema,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  async handler(input, ctx) {
    if (input.outDir !== undefined && !ctx.fs) {
      const message =
        'File output needs a file system; this server was started without one. Omit outDir to receive bytes inline.';
      return {
        isError: true,
        structured: { error: message },
        text: {
          de: 'Dateiausgabe braucht ein Dateisystem; dieser Server wurde ohne eines gestartet. outDir weglassen, um die Bytes inline zu erhalten.',
          en: message,
        },
      };
    }
    let draftId: string | undefined;
    let carrierInput: Parameters<typeof generateCarrier>[0];
    if (input.draft !== undefined) {
      const resolved = await resolveDraft(input.draft, ctx);
      draftId = resolved.draftId;
      carrierInput = { draft: resolved.draft };
    } else {
      carrierInput = input.uid !== undefined ? { uid: input.uid } : {};
    }
    if (input.gs1 !== undefined) carrierInput.gs1 = input.gs1;
    if (input.resolverBase !== undefined) carrierInput.resolverBase = input.resolverBase;
    if (input.format !== undefined) carrierInput.format = input.format;
    let result: CarrierResult;
    try {
      result = generateCarrier(carrierInput);
    } catch (e) {
      if (e instanceof CarrierInputError) {
        return { isError: true, structured: { error: e.text.en }, text: e.text };
      }
      throw e;
    }
    const name = `${slug(result.uid)}.qr.${result.format}`;
    let image: { name: string; size: number; path?: string; bytes?: string };
    if (input.outDir !== undefined && ctx.fs) {
      const path = ctx.fs.join(ctx.fs.resolve(input.outDir), name);
      await ctx.fs.writeFile(path, result.image);
      image = { name, size: result.image.length, path };
    } else {
      image = { name, size: result.image.length, bytes: encodeBase64(result.image) };
    }
    const { image: _bytes, ...rest } = result;
    const link =
      result.digitalLink !== undefined ? ` GS1 Digital Link: ${result.digitalLink}.` : '';
    return {
      structured: { ...(draftId !== undefined ? { draftId } : {}), ...rest, image },
      text: {
        de: `QR-Inhalt: ${result.payload}.${link} ${image.path !== undefined ? `Geschrieben: ${image.path}` : `Bild (${result.mediaType}, ${image.size} Bytes) inline`}. Keine Rechtsberatung.`,
        en: `QR payload: ${result.payload}.${link} ${image.path !== undefined ? `Wrote ${image.path}` : `Image (${result.mediaType}, ${image.size} bytes) inline`}. Not legal advice.`,
      },
    };
  },
};
