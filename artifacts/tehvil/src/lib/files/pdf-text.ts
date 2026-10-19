/**
 * Reads the text layer of a PDF in the browser (pdf.js) and looks for numbers a drawing
 * usually prints as text: areas ("21,4 m²"), scale ("M 1:100"), floor count, ceiling height.
 *
 * It does NOT look at the drawing's lines. A scanned PDF or a pure vector drawing has no
 * text layer — then nothing is found and the caller says so. Every finding carries its page
 * and the surrounding text so the person can check it against the drawing.
 */
export interface PdfPage { page: number; text: string }
export interface PdfFinding {
  kind: 'total_area' | 'living_area' | 'room_area' | 'scale' | 'floors' | 'height';
  label: string;
  value: number;
  unit: 'm²' | 'm' | 'mərtəbə' | '';
  page: number;
  snippet: string;
}
export interface PdfReadResult { pageCount: number; pages: PdfPage[]; hasText: boolean; findings: PdfFinding[] }

const toNum = (s: string) => Number(s.replace(/\s/g, '').replace(',', '.'));

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  return pdfjs;
}

export async function readPdf(file: Blob, maxPages = 30): Promise<PdfReadResult> {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const pages: PdfPage[] = [];
  for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    let text = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      text += item.str + (item.hasEOL ? '\n' : ' ');
    }
    pages.push({ page: n, text: text.replace(/[ \t]+/g, ' ').trim() });
  }
  const pageCount = doc.numPages;
  await doc.destroy();
  const hasText = pages.some(p => p.text.replace(/\s/g, '').length > 20);
  return { pageCount, pages, hasText, findings: hasText ? findInText(pages) : [] };
}

const AREA = /(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:m²|m2|м²|м2|kv\.?\s?m|кв\.?\s?м)/gi;
const TOTAL = /(ümumi|umumi|cəmi|cemi|общая|итого|total|gross)/i;
const LIVING = /(yaşayış|yasayis|жилая|living)/i;

/** Pure text analysis — exported for tests. */
export function findInText(pages: PdfPage[]): PdfFinding[] {
  const out: PdfFinding[] = [];
  const seen = new Set<string>();
  const push = (f: PdfFinding) => { const k = `${f.kind}|${f.label}|${f.value}|${f.page}`; if (!seen.has(k)) { seen.add(k); out.push(f); } };
  for (const { page, text } of pages) {
    for (const line of text.split('\n')) {
      for (const m of line.matchAll(AREA)) {
        const value = toNum(m[1]);
        if (!(value > 0.5 && value < 100000)) continue;
        const before = line.slice(Math.max(0, (m.index ?? 0) - 48), m.index).trim();
        const snippet = line.slice(Math.max(0, (m.index ?? 0) - 48), (m.index ?? 0) + m[0].length + 12).trim();
        const kind = TOTAL.test(before) ? 'total_area' : LIVING.test(before) ? 'living_area' : 'room_area';
        const name = before.replace(/[=:–—\-\s]+$/, '').split(/\s{2,}|[|;]/).pop()?.replace(/^[\d.,\s]+/, '').trim() ?? '';
        push({ kind, label: kind === 'room_area' ? (name.slice(-40) || 'Sahə yazısı') : kind === 'total_area' ? 'Ümumi sahə' : 'Yaşayış sahəsi', value, unit: 'm²', page, snippet });
      }
      const scale = line.match(/\bM\s*1\s*[:/]\s*(\d{2,4})\b/i) ?? line.match(/\b1\s*:\s*(20|25|50|75|100|200|250|500)\b/);
      if (scale) push({ kind: 'scale', label: `Miqyas 1:${scale[1]}`, value: Number(scale[1]), unit: '', page, snippet: line.trim().slice(0, 90) });
      const floors = line.match(/\b(\d{1,2})\s*-?\s*(?:mərtəbəli|mərtəbə|mertebe|этажн|этаж)/i);
      if (floors && Number(floors[1]) > 0 && Number(floors[1]) < 60) push({ kind: 'floors', label: 'Mərtəbə sayı', value: Number(floors[1]), unit: 'mərtəbə', page, snippet: line.trim().slice(0, 90) });
      const h = line.match(/(?:\bh\s*=|hündürlü[yk]\w*|высота)\s*:?\s*(\d[.,]\d{1,2})\s*m?/i);
      if (h && toNum(h[1]) > 2 && toNum(h[1]) < 8) push({ kind: 'height', label: 'Tavan / mərtəbə hündürlüyü', value: toNum(h[1]), unit: 'm', page, snippet: line.trim().slice(0, 90) });
    }
  }
  return out;
}

export const UNSUPPORTED_CAD = /\.(dwg|dxf|ifc|rvt|skp|pln)$/i;
export const CAD_HINT = 'Bu format (DWG, DXF, IFC, RVT) hələ oxunmur. Memardan çertyojların PDF ixracını və ya otaqlar/ölçülər cədvəlini (XLSX, CSV) istəyin.';
