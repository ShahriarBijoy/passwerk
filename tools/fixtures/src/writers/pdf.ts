import { PDFDocument, StandardFonts } from 'pdf-lib';
import { CREATED } from '../content.js';

export interface PdfLayout {
  title: string;
  kv: [string, string][];
  table?: { header: string[]; rows: string[][] };
}

export async function writePdf(layout: PdfLayout): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setCreationDate(CREATED);
  doc.setModificationDate(CREATED);
  doc.setProducer('passwerk fixtures');
  doc.setCreator('passwerk fixtures');
  doc.setTitle(layout.title);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  let y = 790;
  page.drawText(layout.title, { x: 50, y, size: 14, font });
  y -= 30;
  for (const [k, v] of layout.kv) {
    page.drawText(k, { x: 50, y, size: 11, font });
    page.drawText(v, { x: 300, y, size: 11, font });
    y -= 18;
  }
  if (layout.table) {
    y -= 12;
    const xs = [50, 220, 390];
    layout.table.header.forEach((h, i) => {
      page.drawText(h, { x: xs[i] as number, y, size: 11, font });
    });
    y -= 18;
    for (const row of layout.table.rows) {
      row.forEach((c, i) => {
        page.drawText(c, { x: xs[i] as number, y, size: 11, font });
      });
      y -= 18;
    }
  }
  return doc.save({ useObjectStreams: false, updateFieldAppearances: false });
}
