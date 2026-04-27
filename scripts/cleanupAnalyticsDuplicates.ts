import { pool } from '../src/config/db';

type CliOptions = {
  from: string;
  to: string;
  bucketSeconds: number;
  apply: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const now = new Date();
  const fromDefault = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const toDefault = now.toISOString();
  const args = new Map<string, string>();

  for (const raw of argv) {
    const [k, v] = raw.split('=');
    if (!k || v == null) continue;
    args.set(k.replace(/^--/, ''), v);
  }

  const bucketSeconds = Number(args.get('bucket-seconds') ?? 10);
  return {
    from: args.get('from') ?? fromDefault,
    to: args.get('to') ?? toDefault,
    bucketSeconds: Number.isFinite(bucketSeconds) && bucketSeconds > 0 ? Math.floor(bucketSeconds) : 10,
    apply: argv.includes('--apply'),
  };
}

async function main(): Promise<void> {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured. Cannot clean analytics data.');
  }

  const options = parseArgs(process.argv.slice(2));
  console.log('[analytics:dedupe] options:', options);

  const previewSql = `
    WITH ranked AS (
      SELECT
        ctid,
        page_key,
        ROW_NUMBER() OVER (
          PARTITION BY
            COALESCE(user_id::text, session_id, ip_hash, user_agent),
            page_key,
            FLOOR(EXTRACT(EPOCH FROM viewed_at) / $3)
          ORDER BY viewed_at ASC
        ) AS rn
      FROM page_views
      WHERE viewed_at >= $1::timestamptz
        AND viewed_at <  $2::timestamptz
    )
    SELECT
      COUNT(*) FILTER (WHERE rn = 1)::bigint AS kept_rows,
      COUNT(*) FILTER (WHERE rn > 1)::bigint AS duplicate_rows
    FROM ranked
  `;

  const preview = await pool.query(previewSql, [options.from, options.to, options.bucketSeconds]);
  const kept = Number(preview.rows[0]?.kept_rows ?? 0);
  const duplicate = Number(preview.rows[0]?.duplicate_rows ?? 0);
  console.log(`[analytics:dedupe] kept rows: ${kept}`);
  console.log(`[analytics:dedupe] duplicate rows: ${duplicate}`);

  if (!options.apply) {
    console.log('[analytics:dedupe] Dry-run complete. Re-run with --apply to delete duplicates.');
    return;
  }

  const deleteSql = `
    WITH ranked AS (
      SELECT
        ctid,
        ROW_NUMBER() OVER (
          PARTITION BY
            COALESCE(user_id::text, session_id, ip_hash, user_agent),
            page_key,
            FLOOR(EXTRACT(EPOCH FROM viewed_at) / $3)
          ORDER BY viewed_at ASC
        ) AS rn
      FROM page_views
      WHERE viewed_at >= $1::timestamptz
        AND viewed_at <  $2::timestamptz
    )
    DELETE FROM page_views pv
    USING ranked r
    WHERE pv.ctid = r.ctid
      AND r.rn > 1
  `;

  const deleted = await pool.query(deleteSql, [options.from, options.to, options.bucketSeconds]);
  console.log(`[analytics:dedupe] deleted rows: ${deleted.rowCount ?? 0}`);
}

void main()
  .catch((error) => {
    console.error('[analytics:dedupe] failed:', error);
    const err = error as { code?: string; hostname?: string };
    if ((err?.code === 'EAI_AGAIN' || err?.code === 'ENOTFOUND') && err?.hostname) {
      console.error(
        `[analytics:dedupe] DNS error for host "${err.hostname}". ` +
          'Likely DATABASE_URL points to an internal Docker hostname. ' +
          'Run this script where that hostname resolves, or use a public/localhost DATABASE_URL.'
      );
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    if (pool) {
      await pool.end().catch(() => undefined);
    }
  });
