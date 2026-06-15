/**
 * Диагностика каталога для участника. В Docker:
 *   node dist/cli/diagnoseMemberCatalogSongs.js Камышин
 *   node dist/cli/diagnoseMemberCatalogSongs.js Камышин --fix
 */
import pg from 'pg';

import { loadEnvFromDotenv } from './loadEnv';

type MemberRow = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  name: string;
  app_role: string;
};

type SongDiag = {
  id: string;
  title: string;
  song_number: number | null;
  is_published: boolean;
  content_len: number;
  studio_len: number;
  tags: string[];
  in_songbook: boolean;
  issue: string;
};

function buildClient(): pg.Client {
  loadEnvFromDotenv();
  const cs = process.env.DATABASE_URL?.trim();
  if (!cs) throw new Error('Задайте DATABASE_URL в окружении или .env');
  const useSsl = cs.includes('sslmode=') || process.env.DB_SSL === 'true';
  return new pg.Client({
    connectionString: cs,
    ssl: useSsl ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' } : undefined,
  });
}

async function findMembers(client: pg.Client, query: string): Promise<MemberRow[]> {
  const pattern = `%${query.trim().toLowerCase()}%`;
  const r = await client.query<MemberRow>(
    `SELECT id, first_name, last_name, name, app_role
     FROM members
     WHERE lower(coalesce(first_name, '')) LIKE $1
        OR lower(coalesce(last_name, '')) LIKE $1
        OR lower(coalesce(name, '')) LIKE $1
     ORDER BY id`,
    [pattern],
  );
  return r.rows;
}

async function diagnoseMember(client: pg.Client, memberId: number): Promise<SongDiag[]> {
  const r = await client.query(
    `SELECT s.id,
            s.title,
            s.song_number,
            s.is_published,
            length(coalesce(s.content, ''))::int AS content_len,
            coalesce(s.tags, '{}'::text[]) AS tags,
            coalesce((
              SELECT max(length(coalesce(sv.custom_content, '')))
              FROM studio_versions sv
              WHERE sv.song_id = s.id AND sv.member_id = $1
            ), 0)::int AS studio_len
     FROM songs s
     WHERE s.created_by_member_id = $1
        OR EXISTS (SELECT 1 FROM studio_versions sv WHERE sv.song_id = s.id AND sv.member_id = $1)
     ORDER BY s.updated_at DESC`,
    [memberId],
  );

  return r.rows.map((row) => {
    const tags = Array.isArray(row.tags) ? row.tags.map(String) : [];
    const isPublished = Boolean(row.is_published);
    const contentLen = Number(row.content_len ?? 0);
    const studioLen = Number(row.studio_len ?? 0);
    const hasMissingTextTag = tags.includes('нет_текста');
    const archived = tags.includes('__archived');

    let issue = '';
    if (isPublished && contentLen > 0) {
      issue = 'OK — в общем песеннике';
    } else if (isPublished && contentLen === 0 && studioLen > 0) {
      issue = 'Опубликована, но текст только в студийной версии';
    } else if (!isPublished && (contentLen > 0 || studioLen > 0)) {
      issue = 'Не опубликована — видна только в студии у автора';
    } else if (!isPublished && hasMissingTextTag) {
      issue = 'Заготовка без текста';
    } else if (archived) {
      issue = 'В архиве';
    } else {
      issue = 'Пустая / без текста';
    }

    return {
      id: String(row.id),
      title: String(row.title),
      song_number: row.song_number != null ? Number(row.song_number) : null,
      is_published: isPublished,
      content_len: contentLen,
      studio_len: studioLen,
      tags,
      in_songbook: isPublished && contentLen > 0 && !hasMissingTextTag && !archived,
      issue,
    };
  });
}

async function repairMember(client: pg.Client, memberId: number): Promise<void> {
  const pub = await client.query(
    `UPDATE songs s
     SET is_published = TRUE, updated_at = NOW()
     WHERE s.created_by_member_id = $1
       AND NOT s.is_published
       AND btrim(coalesce(s.content, '')) <> ''
       AND NOT (coalesce(s.tags, '{}'::text[]) @> ARRAY['нет_текста']::text[])
       AND NOT (coalesce(s.tags, '{}'::text[]) @> ARRAY['__archived']::text[])
     RETURNING id, title`,
    [memberId],
  );
  console.log(`[fix] Опубликовано (текст в songs): ${pub.rowCount ?? 0}`);

  const studio = await client.query(
    `UPDATE songs s
     SET content = sub.content,
         default_key = COALESCE(sub.custom_key, s.default_key),
         is_published = TRUE,
         tags = COALESCE(
           (
             SELECT array_agg(t)
             FROM unnest(s.tags) AS t
             WHERE t NOT IN ('импортированная', 'импортировано', 'нет_текста')
           ),
           '{}'::text[]
         ),
         updated_at = NOW()
     FROM (
       SELECT DISTINCT ON (sv.song_id)
         sv.song_id,
         sv.custom_content AS content,
         sv.custom_key
       FROM studio_versions sv
       WHERE sv.member_id = $1
         AND btrim(coalesce(sv.custom_content, '')) <> ''
       ORDER BY sv.song_id, length(sv.custom_content) DESC, sv.updated_at DESC
     ) sub
     WHERE s.id = sub.song_id
       AND s.created_by_member_id = $1
       AND NOT s.is_published
       AND btrim(coalesce(s.content, '')) = ''
     RETURNING s.id, s.title`,
    [memberId],
  );
  console.log(`[fix] Перенесено из studio_versions: ${studio.rowCount ?? 0}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== '--fix');
  const doFix = process.argv.includes('--fix');
  const search = args.join(' ').trim() || 'камышин';

  const client = buildClient();
  await client.connect();
  try {
    const members = await findMembers(client, search);
    if (members.length === 0) {
      console.log(`Участник не найден: «${search}»`);
      return;
    }

    for (const m of members) {
      const label = [m.first_name, m.last_name].filter(Boolean).join(' ') || m.name;
      console.log(`\n=== ${label} (id=${m.id}, role=${m.app_role}) ===\n`);

      const rows = await diagnoseMember(client, m.id);
      if (rows.length === 0) {
        console.log('Нет песен.');
        continue;
      }

      const hidden = rows.filter((r) => !r.in_songbook);
      const ok = rows.filter((r) => r.in_songbook);

      console.log(`В песеннике для всех: ${ok.length}`);
      for (const r of ok) {
        console.log(`  ✓ [${r.id}] ${r.song_number ?? '—'}. ${r.title}`);
      }

      console.log(`\nНе видны в общем песеннике: ${hidden.length}`);
      for (const r of hidden) {
        console.log(
          `  ✗ [${r.id}] ${r.song_number ?? '—'}. ${r.title} — ${r.issue} (каталог ${r.content_len}, студия ${r.studio_len})`,
        );
      }

      if (doFix && hidden.length > 0) {
        console.log('\n--- repair ---');
        await repairMember(client, m.id);
      }
    }

    if (!doFix) {
      console.log('\nИсправить: node dist/cli/diagnoseMemberCatalogSongs.js Камышин --fix');
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
