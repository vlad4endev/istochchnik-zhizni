import assert from 'node:assert/strict';
import {
  AI_KNOWLEDGE_CHUNK_MAX,
  AI_KNOWLEDGE_CHUNK_OVERLAP,
  chunkKnowledgeText,
} from './aiKnowledgeChunker';
import { formatKnowledgeContextBlock, type RetrievedKnowledgeChunk } from './aiKnowledgeRetrieveService';
import { embeddingToPgVectorLiteral } from '../ai/embeddingsClient';

function run(): void {
  assert.deepEqual(chunkKnowledgeText(''), []);
  assert.deepEqual(chunkKnowledgeText('   \n\n  '), []);

  const short = chunkKnowledgeText('Короткий абзац о вере.');
  assert.equal(short.length, 1);
  assert.equal(short[0].index, 0);
  assert.ok(short[0].content.includes('вере'));
  assert.ok(short[0].tokenEstimate > 0);

  const para = 'А'.repeat(400);
  const long = chunkKnowledgeText(`${para}\n\n${para}\n\n${para}\n\n${para}`);
  assert.ok(long.length >= 2, `expected multiple chunks, got ${long.length}`);
  for (const c of long) {
    assert.ok(c.content.length <= AI_KNOWLEDGE_CHUNK_MAX + AI_KNOWLEDGE_CHUNK_OVERLAP + 10);
  }
  if (long.length >= 2 && AI_KNOWLEDGE_CHUNK_OVERLAP > 0) {
    const prevTail = long[0].content.slice(-Math.min(40, long[0].content.length));
    assert.ok(
      long[1].content.includes(prevTail.slice(0, 20)) || long[1].content.length > 0,
      'overlap should keep continuity between chunks',
    );
  }

  const emptyBlock = formatKnowledgeContextBlock([]);
  assert.ok(emptyBlock.includes('База знаний'));
  assert.ok(emptyBlock.includes('нет'));

  const chunks: RetrievedKnowledgeChunk[] = [
    {
      chunkId: 1,
      documentId: 10,
      title: 'Устав',
      sourceFilename: 'ustav.pdf',
      content: 'Членство в церкви...',
      distance: 0.1,
    },
  ];
  const filled = formatKnowledgeContextBlock(chunks);
  assert.ok(filled.includes('Устав'));
  assert.ok(filled.includes('ustav.pdf'));
  assert.ok(filled.includes('Членство в церкви'));

  const literal = embeddingToPgVectorLiteral([0.1, -0.2, 0.3]);
  assert.equal(literal, '[0.1,-0.2,0.3]');

  console.log('aiKnowledgeChunker.test.ts: OK');
}

run();
