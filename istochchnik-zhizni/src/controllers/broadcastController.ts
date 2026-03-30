import type { Request, Response } from 'express';
import { pool } from '../config/db';

export async function getBroadcastEmbed(req: Request, res: Response): Promise<void> {
  if (!pool) {
    res.status(503).json({ error: 'Database pool is not initialized' });
    return;
  }
  try {
    const { rows } = await pool.query('SELECT rutube_embed_code FROM global_settings WHERE id = 1');
    const code = rows[0]?.rutube_embed_code || null;
    res.json({ rutube_embed_code: code });
  } catch (error) {
    console.error('getBroadcastEmbed error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateBroadcastEmbed(req: Request, res: Response): Promise<void> {
  if (!pool) {
    res.status(503).json({ error: 'Database pool is not initialized' });
    return;
  }
  try {
    let { rutube_embed_code } = req.body;
    if (typeof rutube_embed_code !== 'string') {
        rutube_embed_code = null;
    }
    
    // Auto-migrate just in case SKIP_DB_INIT_ON_START prevented initDb
    try {
      await pool.query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS rutube_embed_code TEXT;');
    } catch (e) {
      console.warn('Auto-migration failed, ignoring:', e);
    }
    
    await pool.query(
      `INSERT INTO global_settings (id, start_date, rutube_embed_code) 
       VALUES (1, CURRENT_DATE, $1) 
       ON CONFLICT (id) DO UPDATE SET rutube_embed_code = EXCLUDED.rutube_embed_code`,
      [rutube_embed_code]
    );

    res.json({ rutube_embed_code });
  } catch (error) {
    console.error('updateBroadcastEmbed error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
