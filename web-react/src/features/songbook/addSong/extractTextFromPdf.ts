import * as pdfjs from 'pdfjs-dist';

type Piece = {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  hasEOL: boolean;
};

export type PdfExtractMeta = {
  text: string;
  /**
   * `safe-main-thread` — извлечение без PDF worker (обходит MIME-проблемы на части серверов).
   */
  mode: 'safe-main-thread' | 'ocr-fallback';
};

export type PdfExtractProgress = {
  stage: 'pdf-text' | 'ocr';
  page: number;
  totalPages: number;
  message: string;
};

type ExtractOptions = {
  onProgress?: (progress: PdfExtractProgress) => void;
};

function describePdfError(err: unknown): string {
  if (err && typeof err === 'object') {
    const obj = err as { name?: string; message?: string };
    const name = String(obj.name ?? '');
    const msg = String(obj.message ?? '');
    const full = `${name} ${msg}`.trim();
    if (/PasswordException/i.test(full)) {
      return 'PDF защищён паролем. Снимите защиту или экспортируйте в текст.';
    }
    if (/InvalidPDFException|FormatError/i.test(full)) {
      return 'Файл повреждён или имеет нестандартный PDF-формат.';
    }
    if (/UnexpectedResponseException|Missing PDF/i.test(full)) {
      return 'Не удалось прочитать структуру PDF.';
    }
    if (msg) return msg;
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Неизвестная ошибка чтения PDF.';
}

async function loadTesseractFromCdn(): Promise<{
  createWorker: (lang?: string, oem?: number, options?: { logger?: (m: { progress?: number; status?: string }) => void }) => Promise<{
    recognize: (image: string | HTMLCanvasElement | HTMLImageElement) => Promise<{ data: { text: string } }>;
    terminate: () => Promise<void>;
  }>;
}> {
  const urls = [
    'https://esm.sh/tesseract.js@5?bundle',
    'https://esm.sh/tesseract.js@4?bundle',
  ];
  let lastError: unknown = null;
  for (const url of urls) {
    try {
      const mod = await import(/* @vite-ignore */ url);
      const createWorker =
        (mod as { createWorker?: unknown }).createWorker ??
        (mod as { default?: { createWorker?: unknown } }).default?.createWorker;
      if (typeof createWorker === 'function') {
        return { createWorker: createWorker as never };
      }
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`OCR-модуль недоступен: ${describePdfError(lastError)}`);
}

async function runPdfOcrFallback(
  pdf: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>,
  onProgress?: (progress: PdfExtractProgress) => void,
): Promise<string> {
  const tesseract = await loadTesseractFromCdn();
  const totalPages = pdf.numPages;
  const worker = await tesseract.createWorker('rus+eng', 1, {
    logger: (m) => {
      const p = Math.round(((m.progress ?? 0) * 100));
      onProgress?.({
        stage: 'ocr',
        page: 0,
        totalPages,
        message: `OCR инициализация: ${m.status ?? 'обработка'} ${p}%`,
      });
    },
  });

  try {
    const chunks: string[] = [];
    for (let i = 1; i <= totalPages; i += 1) {
      onProgress?.({
        stage: 'ocr',
        page: i,
        totalPages,
        message: `OCR страницы ${i}/${totalPages}…`,
      });
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const { data } = await worker.recognize(canvas);
      const text = String(data?.text ?? '').trim();
      if (text) chunks.push(text);
    }
    return chunks.join('\n\n').trim();
  } finally {
    await worker.terminate();
  }
}

function isRenderableTextItem(item: unknown): item is {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL: boolean;
} {
  if (!item || typeof item !== 'object') return false;
  const o = item as Record<string, unknown>;
  return typeof o.str === 'string' && Array.isArray(o.transform) && (o.transform as number[]).length >= 6;
}

function piecesFromPage(textContent: { items: unknown[] }): Piece[] {
  const out: Piece[] = [];
  for (const item of textContent.items) {
    if (!isRenderableTextItem(item)) continue;
    const s = item.str.replace(/\u00a0/g, ' ');
    if (!s.trim()) continue;
    const t = item.transform;
    const x = t[4] as number;
    const y = t[5] as number;
    const h = Math.abs(item.height || (t[3] as number) || 10);
    const w = Math.abs(item.width || 0);
    out.push({
      str: s,
      x,
      y,
      w: w > 0 ? w : h * 0.5 * Math.max(1, [...s].length),
      h,
      hasEOL: Boolean(item.hasEOL),
    });
  }
  return out;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 8;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Одна визуальная строка: крупные зазоры → таб (аккорды над текстом в PDF). */
function mergeLinePieces(row: Piece[], gapForTab: number): string {
  row.sort((a, b) => a.x - b.x);
  let s = '';
  let lastEnd = -Infinity;
  for (let i = 0; i < row.length; i++) {
    const p = row[i]!;
    if (i > 0 && lastEnd > -Infinity) {
      const gap = p.x - lastEnd;
      if (gap >= gapForTab) s += '\t';
      else if (!s.endsWith('\n') && !s.endsWith('\t')) s += ' ';
    }
    s += p.str;
    lastEnd = p.x + p.w;
    if (p.hasEOL) s += '\n';
  }
  return s.replace(/[ \t]+\n/g, '\n').trimEnd();
}

/**
 * Восстанавливает строки по координатам (вместо склейки всех фрагментов в одну линию).
 */
function layoutPageLines(pieces: Piece[]): string {
  if (pieces.length === 0) return '';
  const heights = pieces.map((p) => p.h);
  const lineTol = Math.min(12, Math.max(2.2, median(heights) * 0.5));
  const gapForTab = Math.max(14, median(heights) * 3.8);

  const byY = [...pieces].sort((a, b) => b.y - a.y);
  const rows: Piece[][] = [];
  for (const p of byY) {
    const last = rows[rows.length - 1];
    if (!last) {
      rows.push([p]);
      continue;
    }
    const refY = last.reduce((s, q) => s + q.y, 0) / last.length;
    if (Math.abs(p.y - refY) <= lineTol) last.push(p);
    else rows.push([p]);
  }

  return rows.map((r) => mergeLinePieces(r, gapForTab)).join('\n');
}

/**
 * Извлекает текст из PDF с учётом положения фрагментов (строки и табы между колонками).
 * Нужен текстовый слой в PDF (не чистый скан без OCR).
 */
export async function extractTextFromPdfBuffer(buffer: ArrayBuffer): Promise<string> {
  const meta = await extractTextFromPdfBufferWithMeta(buffer);
  return meta.text;
}

export async function extractTextFromPdfBufferWithMeta(
  buffer: ArrayBuffer,
  options: ExtractOptions = {},
): Promise<PdfExtractMeta> {
  const { onProgress } = options;
  const data = buffer.byteLength === 0 ? new Uint8Array() : new Uint8Array(buffer);
  let pdf: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']>;
  try {
    // На некоторых nginx-конфигах `.mjs` отдаётся как application/octet-stream,
    // из-за чего worker не стартует. Явно выключаем worker и парсим в main-thread.
    const loadingTask = pdfjs.getDocument({
      data,
      useSystemFonts: true,
      disableWorker: true,
    } as unknown as Parameters<typeof pdfjs.getDocument>[0]);
    pdf = await loadingTask.promise;
  } catch (err) {
    throw new Error(describePdfError(err));
  }

  const pageTexts: string[] = [];
  const pageErrors: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.({
      stage: 'pdf-text',
      page: i,
      totalPages: pdf.numPages,
      message: `Чтение текстового слоя: страница ${i}/${pdf.numPages}…`,
    });
    try {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pieces = piecesFromPage(textContent);
      const text = layoutPageLines(pieces);
      if (text.trim()) pageTexts.push(text);
    } catch (err) {
      pageErrors.push(`стр. ${i}: ${describePdfError(err)}`);
    }
  }

  const extracted = pageTexts.join('\n\n').trim();
  if (extracted.length > 0) {
    return { text: extracted, mode: 'safe-main-thread' };
  }

  try {
    const ocrText = await runPdfOcrFallback(pdf, onProgress);
    if (ocrText) {
      return { text: ocrText, mode: 'ocr-fallback' };
    }
  } catch (ocrErr) {
    if (pageErrors.length > 0) {
      throw new Error(`OCR не помог: ${describePdfError(ocrErr)}. Ошибка чтения PDF: ${pageErrors[0]}`);
    }
    throw new Error(`OCR не помог: ${describePdfError(ocrErr)}`);
  }

  if (pageErrors.length > 0) {
    throw new Error(`Не удалось извлечь текст (${pageErrors[0]}).`);
  }
  throw new Error('В PDF не найден текст даже после OCR.');
}
