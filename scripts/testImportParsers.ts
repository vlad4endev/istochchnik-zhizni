import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';

import { parseXlsxBuffer } from '../src/import/xlsxParser';
import { fetchTelegraphTextDetailed } from '../src/import/telegraphParser';

function buildXlsxBuffer(rows: Array<Array<string | number | null>>): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Songs');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

async function run() {
  // 1) Fuzzy header mapping (аккородов typo) + basic validation
  {
    const buf = buildXlsxBuffer([
      ['ID', 'Номер песни', 'Наименование', 'Оглавление', 'Ссылка без аккородов', 'Ссылка с акордами', 'ссылка на ютуб'],
      ['0123456789abcdef01234567', 1, 'Песня', '1. Песня', 'https://telegra.ph/x-1', 'https://telegra.ph/x-2', ''],
    ]);
    const r = parseXlsxBuffer(buf);
    assert.equal(r.errors.length, 0);
    assert.equal(r.songs.length, 1);
    assert.match(r.songs[0]!.url_lyrics, /^https:\/\/telegra\.ph\//);
    assert.match(r.songs[0]!.url_chords, /^https:\/\/telegra\.ph\//);
  }

  // 2) Invalid external_id should produce validation error
  {
    const buf = buildXlsxBuffer([
      ['ID', 'Номер песни', 'Наименование', 'Оглавление', 'Ссылка без аккородов', 'Ссылка с акордами'],
      ['BAD', 1, 'Песня', '1. Песня', 'https://telegra.ph/x-1', 'https://telegra.ph/x-2'],
    ]);
    const r = parseXlsxBuffer(buf);
    assert.ok(r.errors.some((e) => e.field === 'external_id'));
  }

  // 3) Telegraph parser: invalid URL should return ok=false
  {
    const r = await fetchTelegraphTextDetailed('https://example.com/not-telegraph');
    assert.equal(r.ok, false);
  }

  console.log('[testImportParsers] OK');
}

void run().catch((e) => {
  console.error('[testImportParsers] FAILED', e);
  process.exit(1);
});

