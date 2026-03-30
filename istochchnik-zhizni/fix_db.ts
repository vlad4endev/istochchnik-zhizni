import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function fix() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    await client.query('ALTER TABLE global_settings ADD COLUMN IF NOT EXISTS rutube_embed_code TEXT;');
    console.log('Successfully altered table.');
  } catch (err) {
    console.error('Failed to alter table:', err);
  } finally {
    await client.end();
  }
}

fix();
