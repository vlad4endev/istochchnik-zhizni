import { inflateRawSync } from 'node:zlib';

/** Сколько текста документа отдаём модели за один раз. */
export const ASSISTANT_DOCUMENT_TEXT_LIMIT = 12_000;

/** Больше этого разбирать не пытаемся: pdf/xlsx легко раздувают память. */
export const ASSISTANT_DOCUMENT_MAX_BYTES = 8 * 1024 * 1024;

export type AssistantDocumentKind = 'pdf' | 'docx' | 'odt' | 'xlsx' | 'pptx' | 'text' | 'rtf' | 'legacy-doc';

const MIME_KIND: Record<string, AssistantDocumentKind> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'text',
  'text/csv': 'text',
  'text/markdown': 'text',
  'text/rtf': 'rtf',
  'application/rtf': 'rtf',
  'application/msword': 'legacy-doc',
};

const EXT_KIND: Record<string, AssistantDocumentKind> = {
  pdf: 'pdf',
  docx: 'docx',
  odt: 'odt',
  xlsx: 'xlsx',
  xls: 'xlsx',
  pptx: 'pptx',
  txt: 'text',
  csv: 'text',
  md: 'text',
  markdown: 'text',
  rtf: 'rtf',
  doc: 'legacy-doc',
};

function fileExtension(fileName: string): string {
  const base = String(fileName ?? '').trim().toLowerCase().split(/[/\\]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1);
}

/** PDF, Word, таблицы, презентации и простой текст. Картинки и аудио — нет. */
export function classifyAssistantDocument(fileName: string, mimeType?: string | null): AssistantDocumentKind | null {
  const ext = fileExtension(fileName);
  if (ext && EXT_KIND[ext]) return EXT_KIND[ext];
  const mime = String(mimeType ?? '').split(';')[0].trim().toLowerCase();
  return MIME_KIND[mime] ?? null;
}

export function formatAssistantDocumentBlock(input: {
  fileName: string;
  text: string;
  warning?: string;
}): string {
  const name = String(input.fileName ?? '').trim() || 'документ';
  const warning = String(input.warning ?? '').trim();
  const body = String(input.text ?? '')
    .replaceAll(String.fromCharCode(0), '')
    .trim();
  if (!body) {
    return (
      `Текст документа «${name}».\n` +
      (warning || 'Текст из файла не извлёкся. Не выдумывай содержание документа.')
    );
  }
  const clipped =
    body.length > ASSISTANT_DOCUMENT_TEXT_LIMIT
      ? `${body.slice(0, ASSISTANT_DOCUMENT_TEXT_LIMIT)}\n…(дальше файл обрезан и модели не передан)`
      : body;
  const note = warning ? `\n${warning}` : '';
  return (
    `Текст документа «${name}». Отвечай по этим строкам. Не выдумывай абзацы, цифры и цитаты, которых здесь нет.${note}\n\n` +
    clipped
  );
}

function decodePlainBuffer(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf8');
  }
  return buffer.toString('utf8');
}

function decodeXmlText(xml: string): string {
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/a:p>/g, '\n')
    .replace(/<\/text:p>/g, '\n')
    .replace(/<a:br\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : '';
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Читает ZIP (store и deflate). ZIP64 и шифрование не поддерживаются. */
export function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  if (buffer.length < 22) return out;
  let eocd = -1;
  const min = Math.max(0, buffer.length - 22 - 65535);
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return out;
  const count = buffer.readUInt16LE(eocd + 10);
  let ptr = buffer.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && n < 400; n += 1) {
    if (ptr + 46 > buffer.length || buffer.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(ptr + 10);
    const compSize = buffer.readUInt32LE(ptr + 20);
    const nameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const localOff = buffer.readUInt32LE(ptr + 42);
    const name = buffer.subarray(ptr + 46, ptr + 46 + nameLen).toString('utf8');
    ptr += 46 + nameLen + extraLen + commentLen;
    if (!name || name.endsWith('/')) continue;
    if (localOff + 30 > buffer.length || buffer.readUInt32LE(localOff) !== 0x04034b50) continue;
    const localNameLen = buffer.readUInt16LE(localOff + 26);
    const localExtraLen = buffer.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + localNameLen + localExtraLen;
    if (dataStart + compSize > buffer.length) continue;
    const compressed = buffer.subarray(dataStart, dataStart + compSize);
    try {
      const data = method === 0 ? compressed : method === 8 ? inflateRawSync(compressed) : null;
      if (data) out.set(name.replace(/\\/g, '/'), data);
    } catch {
      /* битая запись — пропускаем */
    }
  }
  return out;
}

function zipText(entries: Map<string, Buffer>, names: string[]): string {
  const chunks: string[] = [];
  for (const name of names) {
    const raw = entries.get(name);
    if (!raw) continue;
    const text = decodeXmlText(raw.toString('utf8'));
    if (text) chunks.push(text);
  }
  return chunks.join('\n\n').trim();
}

function extractDocx(buffer: Buffer): string {
  const entries = readZipEntries(buffer);
  return zipText(entries, ['word/document.xml']);
}

function extractOdt(buffer: Buffer): string {
  const entries = readZipEntries(buffer);
  return zipText(entries, ['content.xml']);
}

function extractPptx(buffer: Buffer): string {
  const entries = readZipEntries(buffer);
  const slides = [...entries.keys()]
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return slides
    .map((name, index) => {
      const text = decodeXmlText(entries.get(name)?.toString('utf8') ?? '');
      return text ? `Слайд ${index + 1}\n${text}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

function extractRtf(buffer: Buffer): string {
  const raw = decodePlainBuffer(buffer);
  return raw
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\'[0-9a-fA-F]{2}/g, ' ')
    .replace(/\\[a-zA-Z]+-?\d* ?/g, '')
    .replace(/[{}]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default;
  const parsed = await pdfParse(buffer);
  return String(parsed.text ?? '').trim();
}

async function extractSpreadsheet(buffer: Buffer): Promise<string> {
  const XLSX = await import('xlsx');
  const book = XLSX.read(buffer, { type: 'buffer' });
  return book.SheetNames.slice(0, 6)
    .map((name) => {
      const sheet = book.Sheets[name];
      if (!sheet) return '';
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).trim();
      return csv ? `Лист ${name}\n${csv}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Достаёт текст документа для контекста ИИ.
 * Пустой результат всё равно возвращает блок с предупреждением, чтобы модель не выдумывала файл.
 */
export async function extractAssistantDocumentText(input: {
  buffer: Buffer;
  fileName: string;
  mimeType?: string | null;
}): Promise<string> {
  const fileName = String(input.fileName ?? '').trim() || 'документ';
  const kind = classifyAssistantDocument(fileName, input.mimeType);
  if (!kind) {
    return formatAssistantDocumentBlock({
      fileName,
      text: '',
      warning: 'Этот формат помощник не разбирает. Пришлите PDF, DOCX, ODT, TXT, RTF, XLSX или PPTX.',
    });
  }
  if (kind === 'legacy-doc') {
    return formatAssistantDocumentBlock({
      fileName,
      text: '',
      warning: 'Старый формат DOC не читается. Сохраните файл как DOCX или PDF и отправьте снова.',
    });
  }
  const buffer = input.buffer;
  if (!buffer || buffer.length === 0) {
    return formatAssistantDocumentBlock({
      fileName,
      text: '',
      warning: 'Файл пустой. Не выдумывай содержание.',
    });
  }
  if (buffer.length > ASSISTANT_DOCUMENT_MAX_BYTES) {
    return formatAssistantDocumentBlock({
      fileName,
      text: '',
      warning: 'Файл больше 8 МБ, текст не разбирался. Пришлите более короткую версию. Не выдумывай содержание.',
    });
  }
  try {
    let text = '';
    if (kind === 'pdf') text = await extractPdf(buffer);
    else if (kind === 'docx') text = extractDocx(buffer);
    else if (kind === 'odt') text = extractOdt(buffer);
    else if (kind === 'pptx') text = extractPptx(buffer);
    else if (kind === 'xlsx') text = await extractSpreadsheet(buffer);
    else if (kind === 'rtf') text = extractRtf(buffer);
    else text = decodePlainBuffer(buffer).trim();
    return formatAssistantDocumentBlock({
      fileName,
      text,
      warning: text
        ? undefined
        : 'В файле не найден текст (возможен скан без текстового слоя). Не выдумывай содержание.',
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.warn('[assistant] document extract failed:', detail);
    return formatAssistantDocumentBlock({
      fileName,
      text: '',
      warning: 'Файл не удалось разобрать. Не выдумывай содержание.',
    });
  }
}
