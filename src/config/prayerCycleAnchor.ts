import type { Pool } from 'pg';

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Валидирует и нормализует дату YYYY-MM-DD (UTC-календарная). */
export function parsePrayerCycleAnchorDate(raw: string | undefined): string | null {
  const s = raw?.trim();
  if (!s || !YMD.test(s)) return null;
  const [, ys, ms, ds] = s.match(YMD)!;
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return `${ys}-${ms}-${ds}`;
}

/**
 * Гарантирует строку global_settings (id=1) и при необходимости выставляет start_date якоря цикла.
 *
 * - Без переменных: вставка только если строки нет (ON CONFLICT DO NOTHING) — **существующая БД не трогается**.
 * - PRAYER_CYCLE_START_DATE: при первой вставке используется эта дата; если строка уже есть — не перезаписывает
 *   (чтобы обновления проекта не сбрасывали якорь).
 * - PRAYER_CYCLE_SYNC_FROM_ENV или PRAYER_CYCLE_FORCE_RESTORE: принудительно обновить start_date из env при каждом старте
 *   (для фиксированного якоря в .env / восстановления после новой БД).
 */
export async function ensurePrayerCycleAnchor(pool: Pool): Promise<void> {
  const anchor = parsePrayerCycleAnchorDate(process.env.PRAYER_CYCLE_START_DATE);
  const sync =
    process.env.PRAYER_CYCLE_SYNC_FROM_ENV === 'true' || process.env.PRAYER_CYCLE_SYNC_FROM_ENV === '1';
  const force =
    process.env.PRAYER_CYCLE_FORCE_RESTORE === 'true' || process.env.PRAYER_CYCLE_FORCE_RESTORE === '1';

  if (process.env.PRAYER_CYCLE_START_DATE?.trim() && !anchor) {
    console.warn(
      '[cycle] PRAYER_CYCLE_START_DATE задан, но не распознан как YYYY-MM-DD. Проверьте формат.',
    );
  }

  if (sync || force) {
    if (!anchor) {
      console.warn(
        '[cycle] Включён SYNC/FORCE, но PRAYER_CYCLE_START_DATE не задан или неверен. Якорь из окружения не применён.',
      );
    } else {
      await pool.query(
        `INSERT INTO global_settings (id, start_date)
         VALUES (1, $1::date)
         ON CONFLICT (id) DO UPDATE SET start_date = EXCLUDED.start_date`,
        [anchor]
      );
      console.log(
        `[cycle] Якорь цикла из окружения: ${anchor} (${sync ? 'PRAYER_CYCLE_SYNC_FROM_ENV' : 'PRAYER_CYCLE_FORCE_RESTORE'})`,
      );
      await logCurrentAnchor(pool);
      return;
    }
  }

  if (anchor) {
    await pool.query(
      `INSERT INTO global_settings (id, start_date) VALUES (1, $1::date) ON CONFLICT (id) DO NOTHING`,
      [anchor],
    );
  } else {
    await pool.query(
      `INSERT INTO global_settings (id, start_date) VALUES (1, CURRENT_DATE) ON CONFLICT (id) DO NOTHING`,
    );
  }

  await logCurrentAnchor(pool);
}

async function logCurrentAnchor(pool: Pool): Promise<void> {
  try {
    const { rows } = await pool.query<{ d: string }>(
      `SELECT start_date::text AS d FROM global_settings WHERE id = 1`,
    );
    const d = rows[0]?.d;
    if (d) {
      console.log(`[cycle] Активный якорь молитвенного цикла (global_settings.start_date): ${d}`);
    }
  } catch {
    /* таблицы может ещё не быть при частичном init */
  }
}
