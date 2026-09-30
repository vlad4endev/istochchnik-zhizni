-- Семейные связи участников. Одна строка на связь; relation — кем relative приходится member.
-- Родственник — либо другой участник (relative_member_id), либо свободная запись (relative_name).
CREATE TABLE IF NOT EXISTS member_family_links (
  id BIGSERIAL PRIMARY KEY,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  relative_member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
  relative_name VARCHAR(255),
  relative_birth_date DATE,
  relation VARCHAR(16) NOT NULL
    CHECK (relation IN ('spouse', 'parent', 'child', 'sibling', 'grandparent', 'grandchild', 'other')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (relative_member_id IS NOT NULL OR COALESCE(BTRIM(relative_name), '') <> ''),
  CHECK (relative_member_id IS NULL OR relative_member_id <> member_id)
);
CREATE INDEX IF NOT EXISTS idx_member_family_links_member ON member_family_links (member_id);
CREATE INDEX IF NOT EXISTS idx_member_family_links_relative ON member_family_links (relative_member_id);
-- Одна пара участников — одна связь, независимо от направления.
CREATE UNIQUE INDEX IF NOT EXISTS uq_member_family_links_pair
  ON member_family_links (LEAST(member_id, relative_member_id), GREATEST(member_id, relative_member_id))
  WHERE relative_member_id IS NOT NULL;
