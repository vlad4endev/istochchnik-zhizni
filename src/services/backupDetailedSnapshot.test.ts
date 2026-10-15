import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { readBackupDetail } from './backupDetailedSnapshot';

async function run(): Promise<void> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'backup-detail-'));
  try {
    await fsp.writeFile(path.join(dir, 'MANIFEST.txt'), 'project=test\n', 'utf8');
    await fsp.writeFile(path.join(dir, 'db.dump.gz'), 'x', 'utf8');
    await fsp.writeFile(path.join(dir, 'uploads.tar.gz'), 'x', 'utf8');
    await fsp.writeFile(
      path.join(dir, 'inventory.json'),
      JSON.stringify({
        version: 1,
        created_at: new Date().toISOString(),
        tables: { members: 3, messages: 10 },
        messenger: {
          conversations: 2,
          messages: 10,
          participants: 4,
          reactions: 0,
          poll_votes: 0,
          pins: 0,
        },
        members: { total: 3, active: 3, admins: 1 },
        notes: [],
      }),
      'utf8',
    );
    await fsp.writeFile(
      path.join(dir, 'components.json'),
      JSON.stringify({
        version: 1,
        database: true,
        uploads: true,
        secrets: false,
        env_keys: true,
        env_full_encrypted: false,
        inventory: true,
        settings_snapshot: true,
        server_snapshot: true,
        messenger_summary: true,
        storage: false,
        storage_object_count: 0,
        storage_bytes: 0,
      }),
      'utf8',
    );
    await fsp.writeFile(
      path.join(dir, 'server.snapshot.json'),
      JSON.stringify({ hostname: 'test-host', node: 'v20.0.0', git_sha: 'abc' }),
      'utf8',
    );
    await fsp.mkdir(path.join(dir, 'storage'), { recursive: true });
    await fsp.writeFile(
      path.join(dir, 'storage', 'manifest.json'),
      JSON.stringify({ configured: false, buckets: [] }),
      'utf8',
    );

    const detail = await readBackupDetail('istochnik-backup-20260101-120000', dir);
    assert.equal(detail.components.database, true);
    assert.equal(detail.components.uploads, true);
    assert.equal(detail.components.inventory, true);
    assert.equal(detail.components.server_snapshot, true);
    assert.equal(detail.inventory?.members.total, 3);
    assert.equal(detail.inventory?.messenger.messages, 10);
    assert.equal(detail.server?.hostname, 'test-host');
    assert.ok(detail.manifest_text?.includes('project=test'));
    console.log('backupDetailedSnapshot.test.ts: ok');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
