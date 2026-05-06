import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';

import type { ParsedXlsxSong, ValidationError, XlsxParseResult } from './types';

function normHeader(s: string): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
}

function is24Hex(s: string): boolean {
  return /^[0-9a-f]{24}$/i.test(s.trim());
}

function normalizeUrl(s: string): string {
  return s.trim();
}

function isHttpsUrl(s: string): boolean {
  return /^https:\/\/[^\s]+$/i.test(s.trim());
}

function isTelegraphUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    return u.protocol === 'https:' && (u.hostname === 'telegra.ph' || u.hostname.endsWith('.telegra.ph'));
  } catch {
    return false;
  }
}

function toIntStrict(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
}

type ColumnKey = keyof ParsedXlsxSong;

const COLUMN_HINTS: Array<{ key: ColumnKey; patterns: RegExp[] }> = [
  { key: 'external_id', patterns: [/^id$/i, /external/i, /объект/i, /mongo/i] },
  { key: 'song_number', patterns: [/номер/i, /песн/i] },
  { key: 'title', patterns: [/наимен/i, /назван/i, /title/i] },
  { key: 'table_of_contents', patterns: [/оглав/i, /содерж/i] },
  // real file has typo "аккородов"
  { key: 'url_lyrics', patterns: [/ссылка/i, /без/i, /аккор/i, /lyrics/i] },
  { key: 'url_chords', patterns: [/ссылка/i, /(аккор|аккород|акорд|акор)/i, /(с|со)\s*(аккор|акорд|акор)/i, /chord/i] },
  { key: 'url_youtube', patterns: [/ютуб/i, /youtube/i, /you\s*tube/i] },
];

function pickColumnKey(header: string): ColumnKey | null {
  const h = normHeader(header);
  if (!h) return null;

  // hard matches first
  if (h === 'id') return 'external_id';
  if (h.includes('номер') && h.includes('пес')) return 'song_number';
  if (h.includes('наимен') || h.includes('назван')) return 'title';
  if (h.includes('оглав')) return 'table_of_contents';
  if (h.includes('ютуб') || h.includes('youtube')) return 'url_youtube';
  if (h.includes('ссылка') && h.includes('без') && h.includes('аккор')) return 'url_lyrics';
  if (h.includes('ссылка') && (h.includes('аккор') || h.includes('акорд') || h.includes('акор'))) return 'url_chords';

  // fuzzy score
  let best: { key: ColumnKey; score: number } | null = null;
  for (const entry of COLUMN_HINTS) {
    let score = 0;
    for (const re of entry.patterns) {
      if (re.test(h)) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) {
      best = { key: entry.key, score };
    }
  }
  return best?.key ?? null;
}

type HeaderMap = Partial<Record<ColumnKey, number>>;

function buildHeaderMap(headers: unknown[]): { map: HeaderMap; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const map: HeaderMap = {};

  for (let col = 0; col < headers.length; col += 1) {
    const raw = headers[col];
    const name = String(raw ?? '').trim();
    if (!name) continue;
    const key = pickColumnKey(name);
    if (!key) continue;
    if (map[key] != null) {
      errors.push({
        row: 1,
        field: 'row',
        message: `Дублирующая колонка для «${key}»: «${name}»`,
      });
      continue;
    }
    map[key] = col;
  }

  const required: ColumnKey[] = ['external_id', 'song_number', 'table_of_contents'];
  for (const k of required) {
    if (map[k] == null) {
      errors.push({
        row: 1,
        field: 'row',
        message: `Не найдена обязательная колонка: ${k}`,
      });
    }
  }

  return { map, errors };
}

function cell(row: unknown[], idx: number | undefined): string {
  if (idx == null) return '';
  const v = row[idx];
  if (v == null) return '';
  if (typeof v === 'number') return String(v);
  return String(v).trim();
}

function validateRow(rowNumExcel: number, row: unknown[], headerMap: HeaderMap): { song: ParsedXlsxSong | null; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  const external_id = cell(row, headerMap.external_id);
  const song_number_raw = cell(row, headerMap.song_number);
  const titleRaw = cell(row, headerMap.title);
  const table_of_contents = cell(row, headerMap.table_of_contents);
  const url_lyrics = normalizeUrl(cell(row, headerMap.url_lyrics));
  const url_chords = normalizeUrl(cell(row, headerMap.url_chords));
  const url_youtube_raw = normalizeUrl(cell(row, headerMap.url_youtube));

  if (!external_id || !is24Hex(external_id)) {
    errors.push({ row: rowNumExcel, field: 'external_id', message: 'external_id должен быть 24-char hex', value: external_id });
  }

  const song_number = toIntStrict(song_number_raw);
  if (song_number == null || song_number <= 0) {
    errors.push({ row: rowNumExcel, field: 'song_number', message: 'Номер песни должен быть целым > 0', value: song_number_raw });
  }

  if (!table_of_contents.trim()) {
    errors.push({ row: rowNumExcel, field: 'table_of_contents', message: 'Оглавление не может быть пустым', value: table_of_contents });
  }

  // URLs are optional: allow empty placeholders for “no text yet”.
  if (url_lyrics && (!isHttpsUrl(url_lyrics) || !isTelegraphUrl(url_lyrics))) {
    errors.push({ row: rowNumExcel, field: 'url_lyrics', message: 'url_lyrics должен быть https://telegra.ph/...', value: url_lyrics });
  }
  if (url_chords && (!isHttpsUrl(url_chords) || !isTelegraphUrl(url_chords))) {
    errors.push({ row: rowNumExcel, field: 'url_chords', message: 'url_chords должен быть https://telegra.ph/...', value: url_chords });
  }

  const title = (titleRaw ?? '').trim() ? titleRaw : table_of_contents;
  if (!title.trim()) {
    errors.push({ row: rowNumExcel, field: 'title', message: 'Название не может быть пустым (используйте хотя бы оглавление)', value: titleRaw });
  }

  let url_youtube: string | null = null;
  if (url_youtube_raw) {
    url_youtube = isHttpsUrl(url_youtube_raw) ? url_youtube_raw : null;
  }

  if (errors.length > 0) return { song: null, errors };

  return {
    song: {
      external_id: external_id.trim(),
      song_number: song_number!,
      title: title.trim(),
      table_of_contents: table_of_contents.trim(),
      url_lyrics: url_lyrics ? url_lyrics : '',
      url_chords: url_chords ? url_chords : '',
      url_youtube,
    },
    errors: [],
  };
}

export function parseXlsxBuffer(buffer: Buffer, options: { previewLimit?: number } = {}): XlsxParseResult {
  const previewLimit = options.previewLimit ?? 5;

  const wb = XLSX.read(buffer, { type: 'buffer', raw: true, cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { songs: [], errors: [{ row: 1, field: 'row', message: 'В файле нет листов' }], preview: [], totalRows: 0 };
  }
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' }) as unknown[][];
  if (rows.length === 0) {
    return { songs: [], errors: [{ row: 1, field: 'row', message: 'Лист пуст' }], preview: [], totalRows: 0 };
  }

  const headers = rows[0] ?? [];
  const { map: headerMap, errors: headerErrors } = buildHeaderMap(headers);
  const errors: ValidationError[] = [...headerErrors];
  const songs: ParsedXlsxSong[] = [];

  for (let i = 1; i < rows.length; i += 1) {
    const r = rows[i] ?? [];
    const excelRow = i + 1; // header is row 1
    // skip fully empty rows
    if (Array.isArray(r) && r.every((c) => String(c ?? '').trim() === '')) continue;
    const v = validateRow(excelRow, r, headerMap);
    if (v.song) songs.push(v.song);
    else errors.push(...v.errors);
  }

  return {
    songs,
    errors,
    preview: songs.slice(0, previewLimit),
    totalRows: Math.max(0, rows.length - 1),
  };
}

export function parseXlsxFile(filePath: string, options?: { previewLimit?: number }): XlsxParseResult {
  const p = path.resolve(filePath);
  const buf = fs.readFileSync(p);
  return parseXlsxBuffer(buf, options);
}

