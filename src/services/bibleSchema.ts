import { query } from '../config/db';

let schemaInit: Promise<void> | null = null;

/** Self-heal Bible tables (works even when SKIP_DB_INIT_ON_START). */
export async function ensureBibleSchema(): Promise<void> {
  if (!schemaInit) {
    schemaInit = (async () => {
      await query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

      await query(`
        CREATE TABLE IF NOT EXISTS public.bible_translations (
          id SMALLSERIAL PRIMARY KEY,
          code VARCHAR(32) NOT NULL UNIQUE,
          title VARCHAR(200) NOT NULL,
          language VARCHAR(16) NOT NULL DEFAULT 'ru',
          license_note TEXT NOT NULL DEFAULT '',
          short_title VARCHAR(64) NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          year VARCHAR(32),
          scope VARCHAR(16) NOT NULL DEFAULT 'full',
          availability VARCHAR(32) NOT NULL DEFAULT 'available',
          sort_order SMALLINT NOT NULL DEFAULT 100,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await query(
        `ALTER TABLE public.bible_translations ADD COLUMN IF NOT EXISTS short_title VARCHAR(64) NOT NULL DEFAULT ''`,
      );
      await query(
        `ALTER TABLE public.bible_translations ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''`,
      );
      await query(`ALTER TABLE public.bible_translations ADD COLUMN IF NOT EXISTS year VARCHAR(32)`);
      await query(
        `ALTER TABLE public.bible_translations ADD COLUMN IF NOT EXISTS scope VARCHAR(16) NOT NULL DEFAULT 'full'`,
      );
      await query(
        `ALTER TABLE public.bible_translations ADD COLUMN IF NOT EXISTS availability VARCHAR(32) NOT NULL DEFAULT 'available'`,
      );
      await query(
        `ALTER TABLE public.bible_translations ADD COLUMN IF NOT EXISTS sort_order SMALLINT NOT NULL DEFAULT 100`,
      );

      await query(`
        CREATE TABLE IF NOT EXISTS public.bible_books (
          id SMALLSERIAL PRIMARY KEY,
          translation_id SMALLINT NOT NULL REFERENCES public.bible_translations(id) ON DELETE CASCADE,
          ord SMALLINT NOT NULL,
          testament VARCHAR(8) NOT NULL,
          slug VARCHAR(64) NOT NULL,
          name VARCHAR(200) NOT NULL,
          short_name VARCHAR(64) NOT NULL,
          chapters_count SMALLINT NOT NULL,
          UNIQUE (translation_id, slug),
          UNIQUE (translation_id, ord)
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS public.bible_verses (
          id BIGSERIAL PRIMARY KEY,
          translation_id SMALLINT NOT NULL REFERENCES public.bible_translations(id) ON DELETE CASCADE,
          book_id SMALLINT NOT NULL REFERENCES public.bible_books(id) ON DELETE CASCADE,
          chapter SMALLINT NOT NULL,
          verse SMALLINT NOT NULL,
          text TEXT NOT NULL,
          UNIQUE (translation_id, book_id, chapter, verse)
        )
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS idx_bible_verses_chapter
          ON public.bible_verses (translation_id, book_id, chapter, verse)
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS idx_bible_verses_text_trgm
          ON public.bible_verses USING gin (text gin_trgm_ops)
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS public.bible_notes (
          id BIGSERIAL PRIMARY KEY,
          member_id INTEGER NOT NULL,
          translation_id SMALLINT NOT NULL REFERENCES public.bible_translations(id) ON DELETE CASCADE,
          book_id SMALLINT NOT NULL REFERENCES public.bible_books(id) ON DELETE CASCADE,
          chapter SMALLINT NOT NULL,
          verse_start SMALLINT NOT NULL,
          verse_end SMALLINT NOT NULL,
          body TEXT NOT NULL DEFAULT '',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS idx_bible_notes_member_updated
          ON public.bible_notes (member_id, updated_at DESC)
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS public.bible_reading_progress (
          member_id INTEGER NOT NULL,
          translation_id SMALLINT NOT NULL REFERENCES public.bible_translations(id) ON DELETE CASCADE,
          book_id SMALLINT NOT NULL REFERENCES public.bible_books(id) ON DELETE CASCADE,
          chapter SMALLINT NOT NULL,
          verse SMALLINT NOT NULL DEFAULT 1,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (member_id, translation_id)
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS public.bible_reading_plans (
          id BIGSERIAL PRIMARY KEY,
          member_id INTEGER NOT NULL,
          title VARCHAR(500) NOT NULL DEFAULT '',
          goal TEXT NOT NULL DEFAULT '',
          start_date DATE,
          end_date DATE,
          status VARCHAR(32) NOT NULL DEFAULT 'active',
          ai_prompt TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS public.bible_reading_plan_days (
          id BIGSERIAL PRIMARY KEY,
          plan_id BIGINT NOT NULL REFERENCES public.bible_reading_plans(id) ON DELETE CASCADE,
          day_index INTEGER NOT NULL,
          day_date DATE,
          label VARCHAR(500) NOT NULL DEFAULT '',
          refs_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          completed_at TIMESTAMPTZ,
          UNIQUE (plan_id, day_index)
        )
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS public.bible_commentaries (
          id BIGSERIAL PRIMARY KEY,
          source VARCHAR(32) NOT NULL,
          translation_id SMALLINT REFERENCES public.bible_translations(id) ON DELETE SET NULL,
          book_id SMALLINT NOT NULL REFERENCES public.bible_books(id) ON DELETE CASCADE,
          chapter SMALLINT NOT NULL,
          verse_start SMALLINT,
          verse_end SMALLINT,
          title VARCHAR(500) NOT NULL DEFAULT '',
          body TEXT NOT NULL DEFAULT '',
          author_member_id INTEGER,
          visibility VARCHAR(32) NOT NULL DEFAULT 'public',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await query(`
        CREATE INDEX IF NOT EXISTS idx_bible_commentaries_ref
          ON public.bible_commentaries (book_id, chapter, verse_start)
      `);

      await query(`
        CREATE TABLE IF NOT EXISTS public.bible_audio_chapters (
          id BIGSERIAL PRIMARY KEY,
          translation_id SMALLINT NOT NULL REFERENCES public.bible_translations(id) ON DELETE CASCADE,
          book_id SMALLINT NOT NULL REFERENCES public.bible_books(id) ON DELETE CASCADE,
          chapter SMALLINT NOT NULL,
          audio_url TEXT NOT NULL,
          timings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          voice_id VARCHAR(64) NOT NULL DEFAULT 'default',
          duration_sec REAL NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (translation_id, book_id, chapter, voice_id)
        )
      `);

      // Soft FK to members when table exists
      await query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = 'members'
          ) THEN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.table_constraints
              WHERE constraint_schema = 'public'
                AND table_name = 'bible_notes'
                AND constraint_name = 'bible_notes_member_id_fkey'
            ) THEN
              ALTER TABLE public.bible_notes
                ADD CONSTRAINT bible_notes_member_id_fkey
                FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.table_constraints
              WHERE constraint_schema = 'public'
                AND table_name = 'bible_reading_progress'
                AND constraint_name = 'bible_reading_progress_member_id_fkey'
            ) THEN
              ALTER TABLE public.bible_reading_progress
                ADD CONSTRAINT bible_reading_progress_member_id_fkey
                FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.table_constraints
              WHERE constraint_schema = 'public'
                AND table_name = 'bible_reading_plans'
                AND constraint_name = 'bible_reading_plans_member_id_fkey'
            ) THEN
              ALTER TABLE public.bible_reading_plans
                ADD CONSTRAINT bible_reading_plans_member_id_fkey
                FOREIGN KEY (member_id) REFERENCES public.members(id) ON DELETE CASCADE;
            END IF;
          END IF;
        END $$
      `);
    })().catch((err) => {
      schemaInit = null;
      throw err;
    });
  }
  await schemaInit;
}
