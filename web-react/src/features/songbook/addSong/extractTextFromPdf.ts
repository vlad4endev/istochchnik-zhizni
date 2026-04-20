import * as pdfjs from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

/**
 * Извлекает сырой текст из PDF (как в «копировать текст» в просмотрщике).
 * Порядок строк может отличаться от оригинальной вёрстки — дальше помогает convertToChordPro.
 */
export async function extractTextFromPdfBuffer(buffer: ArrayBuffer): Promise<string> {
  const data = buffer.byteLength === 0 ? new Uint8Array() : new Uint8Array(buffer);
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });
  const pdf = await loadingTask.promise;
  const chunks: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const line = textContent.items
      .map((item) => {
        if (item && typeof item === 'object' && 'str' in item && typeof item.str === 'string') {
          return item.str;
        }
        return '';
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (line) chunks.push(line);
  }

  return chunks.join('\n\n').trim();
}
