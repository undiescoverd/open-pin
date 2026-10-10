import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { stepTitle, safeFileName } from './names';
import { canvasToBlob, renderStep, throwIfCancelled, type ExportJob } from './stills';

/* A PDF copy of the guide: one step per page, the frame with its annotations, the title and note as real selectable text in
   embedded Figtree. Sizes are in points (1/72 inch). */

export type PdfPage = 'a4' | 'letter' | 'slide';

export interface PdfFonts {
  /** Figtree 400 as WOFF/TTF/OTF bytes */
  regular: ArrayBuffer;
  /** Figtree 600 */
  semibold: ArrayBuffer;
}

const PAGES: Record<PdfPage, { width: number; height: number; label: string }> = {
  a4: { width: 595.28, height: 841.89, label: 'A4' },
  letter: { width: 612, height: 792, label: 'Letter' },
  slide: { width: 960, height: 540, label: '16:9' },
};
export const PDF_PAGE_SIZES = PAGES;

/** Images in the PDF are capped at this width, which is plenty for a page and keeps files small. */
const IMAGE_WIDTH = 1800;
const CORAL = rgb(0xd1 / 255, 0x3a / 255, 0x30 / 255);
const INK = rgb(0x0e / 255, 0x11 / 255, 0x16 / 255);
const MUTED = rgb(0x5a / 255, 0x63 / 255, 0x72 / 255);
const LINE = rgb(0xd9 / 255, 0xdd / 255, 0xe4 / 255);

/** Replaces characters the font has no glyph for, so one stray emoji can't fail the whole export. */
function printable(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet());
  return Array.from(text.replace(/\r\n?/g, '\n'))
    .map(ch => (ch === '\n' || supported.has(ch.codePointAt(0)!) ? ch : '?'))
    .join('');
}

/** Breaks text into lines no wider than `width`, keeping the author's own line breaks. */
export function wrapText(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of printable(font, text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/ +/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

function fitContain(w: number, h: number, boxW: number, boxH: number): { width: number; height: number } {
  const scale = Math.min(boxW / w, boxH / h);
  return { width: w * scale, height: h * scale };
}

function drawBadge(page: PDFPage, font: PDFFont, number: number, x: number, y: number, size: number): void {
  page.drawCircle({ x: x + size / 2, y: y + size / 2, size: size / 2, color: CORAL });
  const label = String(number);
  const fontSize = size * 0.5;
  page.drawText(label, { x: x + size / 2 - font.widthOfTextAtSize(label, fontSize) / 2, y: y + size / 2 - fontSize * 0.35, size: fontSize, font, color: rgb(1, 1, 1) });
}

export async function exportPdf(job: ExportJob, options: { page: PdfPage; fonts: PdfFonts }): Promise<{ blob: Blob; name: string; count: number }> {
  const { project } = job;
  const spec = PAGES[options.page];
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(options.fonts.regular, { subset: true });
  const semibold = await doc.embedFont(options.fonts.semibold, { subset: true });
  doc.setTitle(project.name);
  doc.setCreator('Waypost');
  doc.setProducer('Waypost');
  doc.setCreationDate(new Date(project.updatedAt));
  doc.setModificationDate(new Date(project.updatedAt));

  const total = project.steps.length;
  for (const [i, step] of project.steps.entries()) {
    throwIfCancelled(job.signal);
    job.onProgress?.(i, total);
    const canvas = await renderStep(job, step, IMAGE_WIDTH, true);
    const jpeg = new Uint8Array(await (await canvasToBlob(canvas, 'image/jpeg', 0.9)).arrayBuffer());
    const image = await doc.embedJpg(jpeg);
    const page = doc.addPage([spec.width, spec.height]);
    const title = printable(semibold, stepTitle(step, i));
    const note = step.body.trim();
    const footer = `${printable(regular, project.name)}  ·  Step ${i + 1} of ${total}`;

    if (options.page === 'slide') {
      /* image on the left, words on the right */
      const margin = 40, gutter = 32, textWidth = 260;
      const box = { w: spec.width - margin * 2 - gutter - textWidth, h: spec.height - margin * 2 - 24 };
      const size = fitContain(image.width, image.height, box.w, box.h);
      const top = spec.height - margin;
      const y = top - size.height;
      page.drawImage(image, { x: margin, y, ...size });
      page.drawRectangle({ x: margin, y, ...size, borderColor: LINE, borderWidth: 0.75 });
      const tx = margin + box.w + gutter;
      drawBadge(page, semibold, i + 1, tx, top - 30, 30);
      let ty = top - 62;
      for (const line of wrapText(semibold, title, 24, textWidth)) {
        ty -= 28;
        page.drawText(line, { x: tx, y: ty, size: 24, font: semibold, color: INK });
      }
      ty -= 10;
      for (const line of note ? wrapText(regular, note, 14, textWidth) : []) {
        ty -= 20;
        page.drawText(line, { x: tx, y: ty, size: 14, font: regular, color: MUTED });
      }
      page.drawText(footer, { x: margin, y: margin - 8, size: 9, font: regular, color: MUTED });
    } else {
      /* portrait: number and title, the frame across the page, the note under it */
      const margin = 48;
      const inner = spec.width - margin * 2;
      let y = spec.height - margin - 30;
      drawBadge(page, semibold, i + 1, margin, y, 30);
      const titleLines = wrapText(semibold, title, 22, inner - 44);
      titleLines.forEach((line, n) => page.drawText(line, { x: margin + 44, y: y + 8 - n * 26, size: 22, font: semibold, color: INK }));
      y -= Math.max(0, titleLines.length - 1) * 26 + 24;
      const size = fitContain(image.width, image.height, inner, spec.height * 0.5);
      y -= size.height;
      page.drawImage(image, { x: margin, y, ...size });
      page.drawRectangle({ x: margin, y, ...size, borderColor: LINE, borderWidth: 0.75 });
      y -= 12;
      for (const line of note ? wrapText(regular, note, 12, inner) : []) {
        y -= 18;
        if (y < margin + 24) break;
        page.drawText(line, { x: margin, y, size: 12, font: regular, color: MUTED });
      }
      page.drawText(footer, { x: margin, y: margin - 18, size: 9, font: regular, color: MUTED });
    }
  }
  if (total === 0) {
    const page = doc.addPage([spec.width, spec.height]);
    page.drawText('This guide has no steps yet.', { x: 48, y: spec.height - 96, size: 16, font: regular, color: MUTED });
  }
  job.onProgress?.(total, total);
  const bytes = await doc.save();
  return {
    blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
    name: `${safeFileName(project.name)} (${spec.label}).pdf`,
    count: total,
  };
}
