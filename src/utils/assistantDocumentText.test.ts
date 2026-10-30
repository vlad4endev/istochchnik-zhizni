import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';

import {
  classifyAssistantDocument,
  extractAssistantDocumentText,
  readZipEntries,
} from './assistantDocumentText';

function storedZip(files: Record<string, Buffer | string>, method: 0 | 8 = 0): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, raw] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const plain = typeof raw === 'string' ? Buffer.from(raw) : raw;
    const data = method === 8 ? deflateRawSync(plain) : plain;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(plain.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const localFull = Buffer.concat([local, nameBuf, data]);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(plain.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBuf]));
    locals.push(localFull);
    offset += localFull.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

async function main(): Promise<void> {
  assert.equal(classifyAssistantDocument('конспект.pdf', ''), 'pdf');
  assert.equal(classifyAssistantDocument('file', 'application/pdf'), 'pdf');
  assert.equal(
    classifyAssistantDocument('урок.docx', 'application/octet-stream'),
    'docx',
  );
  assert.equal(classifyAssistantDocument('старое.doc', ''), 'legacy-doc');
  assert.equal(classifyAssistantDocument('photo.jpg', 'image/jpeg'), null);
  assert.equal(classifyAssistantDocument('voice.ogg', 'audio/ogg'), null);

  const docXml =
    '<?xml version="1.0"?><w:document>' +
    '<w:p><w:r><w:t>Мир вам</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>Второй абзац</w:t></w:r></w:p>' +
    '</w:document>';
  const docx = storedZip({ 'word/document.xml': docXml }, 8);
  const entries = readZipEntries(docx);
  assert.equal(entries.get('word/document.xml')?.toString('utf8'), docXml);
  const extracted = await extractAssistantDocumentText({
    buffer: docx,
    fileName: 'проповедь.docx',
  });
  assert.match(extracted, /Мир вам/);
  assert.match(extracted, /Второй абзац/);
  assert.match(extracted, /Текст документа «проповедь.docx»/);

  const pptx = storedZip({
    'ppt/slides/slide1.xml': '<a:t>Слайд один</a:t>',
    'ppt/slides/slide2.xml': '<a:t>Слайд два</a:t>',
  });
  const slides = await extractAssistantDocumentText({ buffer: pptx, fileName: 'урок.pptx' });
  assert.match(slides, /Слайд один/);
  assert.match(slides, /Слайд два/);

  const note = await extractAssistantDocumentText({
    buffer: Buffer.from('hello', 'utf8'),
    fileName: 'заметка.txt',
  });
  assert.match(note, /hello/);

  const legacy = await extractAssistantDocumentText({
    buffer: Buffer.from('binary'),
    fileName: 'старое.doc',
  });
  assert.match(legacy, /DOCX или PDF/);
  assert.doesNotMatch(legacy, /binary/);

  const rtf = await extractAssistantDocumentText({
    buffer: Buffer.from('{\\rtf1 Мир\\par вам}', 'utf8'),
    fileName: 'заметка.rtf',
  });
  assert.match(rtf, /Мир/);
  assert.match(rtf, /вам/);

  console.log('assistantDocumentText (unit) ok');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
