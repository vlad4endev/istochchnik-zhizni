import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Документирует контракт: счётчики лайков/комментариев/репостов на карточке
 * репоста берутся с корневой публикации (COALESCE(shared_post_id, id)).
 */
function engagementRootId(row: { id: string; shared_post_id: string | null }): string {
  return row.shared_post_id && row.shared_post_id.length > 0 ? row.shared_post_id : row.id;
}

describe('feed engagement root', () => {
  it('uses own id for originals', () => {
    assert.equal(engagementRootId({ id: '10', shared_post_id: null }), '10');
    assert.equal(engagementRootId({ id: '10', shared_post_id: '' }), '10');
  });

  it('uses shared_post_id for repost shells', () => {
    assert.equal(engagementRootId({ id: '99', shared_post_id: '10' }), '10');
  });

  it('keeps the same root for nested-looking shells (already flattened on insert)', () => {
    // createRepost всегда пишет shared_post_id = resolveRepostRoot(source)
    assert.equal(engagementRootId({ id: '200', shared_post_id: '10' }), '10');
  });
});
