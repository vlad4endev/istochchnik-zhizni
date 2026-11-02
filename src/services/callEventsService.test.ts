import assert from 'node:assert/strict';

import {
  CLIENT_CALL_EVENT_KINDS,
  deriveCallIssues,
  getCallJournalRetentionDays,
  sanitizeClientEvent,
  sanitizeClientPayload,
  type CallIssueInput,
} from './callEventsService';

/**
 * Pure guards for the call journal: client event sanitizing + issue derivation.
 * DB paths (record/list/detail) need integration env and are not covered here.
 */
async function main(): Promise<void> {
  // --- sanitizeClientEvent: allowlist + severity ---
  const ok = sanitizeClientEvent({
    kind: 'connected',
    at: new Date().toISOString(),
    payload: { rttMs: 42 },
  });
  assert.ok(ok);
  assert.equal(ok.kind, 'connected');
  assert.equal(ok.severity, 'info');
  assert.equal(ok.payload.rttMs, 42);

  assert.equal(sanitizeClientEvent({ kind: 'definitely_not_a_kind' }), null);
  assert.equal(sanitizeClientEvent('connected'), null);
  assert.equal(sanitizeClientEvent(null), null);
  assert.equal(sanitizeClientEvent({}), null);

  assert.equal(sanitizeClientEvent({ kind: 'device_error' })?.severity, 'error');
  assert.equal(sanitizeClientEvent({ kind: 'reconnecting' })?.severity, 'warn');
  assert.equal(sanitizeClientEvent({ kind: 'connected', severity: 'warn' })?.severity, 'warn');
  assert.equal(
    sanitizeClientEvent({ kind: 'connected', severity: 'fatal' })?.severity,
    'info',
  );

  // --- timestamps: valid past kept, far future/past clamped to now ---
  const pastIso = new Date(Date.now() - 60_000).toISOString();
  assert.equal(sanitizeClientEvent({ kind: 'connected', at: pastIso })?.at.toISOString(), pastIso);

  const farFuture = sanitizeClientEvent({
    kind: 'connected',
    at: new Date(Date.now() + 3_600_000).toISOString(),
  });
  assert.ok(farFuture);
  assert.ok(Math.abs(farFuture.at.getTime() - Date.now()) < 5_000);

  const farPast = sanitizeClientEvent({
    kind: 'connected',
    at: new Date(Date.now() - 24 * 3_600_000).toISOString(),
  });
  assert.ok(farPast);
  assert.ok(Math.abs(farPast.at.getTime() - Date.now()) < 5_000);

  assert.ok(sanitizeClientEvent({ kind: 'connected', at: 'not-a-date' }));

  // --- payload sanitize: types, truncation, size cap ---
  const payload = sanitizeClientPayload({
    s: 'x'.repeat(1000),
    n: 1.23456,
    b: true,
    nil: null,
    arr: [1, 'two', { no: true }, null],
    nested: { a: 1 },
    fn: () => 1,
  });
  assert.equal((payload.s as string).length, 300);
  assert.equal(payload.n, 1.235);
  assert.equal(payload.b, true);
  assert.equal(payload.nil, null);
  assert.deepEqual(payload.arr, [1, 'two', null, null]);
  assert.deepEqual(payload.nested, { a: 1 });
  assert.equal(payload.fn, null);

  assert.deepEqual(sanitizeClientPayload('str'), {});
  assert.deepEqual(sanitizeClientPayload([1, 2]), {});

  const hugeInput: Record<string, unknown> = {};
  for (let i = 0; i < 60; i += 1) hugeInput[`key_${i}`] = 'v'.repeat(300);
  const huge = sanitizeClientPayload(hugeInput);
  assert.ok(JSON.stringify(huge).length <= 2000);
  assert.ok(Object.keys(huge).length <= 40);

  // --- deriveCallIssues ---
  const base: CallIssueInput = {
    status: 'ended',
    endReason: 'ended',
    type: 'direct',
    createdAt: '2026-01-01T10:00:00.000Z',
    startedAt: '2026-01-01T10:00:10.000Z',
    durationSeconds: 300,
    reconnects: 0,
    deviceErrors: 0,
    roomErrors: 0,
    audioBlocked: 0,
    ghostCleared: 0,
    tokenIssued: true,
    clientConnected: true,
    hasClientEvents: true,
    minQualityScore: 4,
    qualityReports: 1,
  };
  assert.deepEqual(deriveCallIssues(base), []);

  const failed = deriveCallIssues({
    ...base,
    status: 'failed',
    endReason: 'livekit_unavailable',
    startedAt: null,
    durationSeconds: null,
  });
  assert.ok(failed.some((i) => i.code === 'call_failed' && i.severity === 'error'));
  assert.equal(failed.filter((i) => i.code === 'livekit_unavailable').length, 0);

  const neverConnected = deriveCallIssues({ ...base, clientConnected: false });
  assert.ok(neverConnected.some((i) => i.code === 'media_never_connected' && i.severity === 'error'));

  // Legacy calls without client telemetry must not be flagged.
  const legacy = deriveCallIssues({
    ...base,
    clientConnected: false,
    hasClientEvents: false,
  });
  assert.ok(!legacy.some((i) => i.code === 'media_never_connected'));

  // Cancelled before connect is normal, not a media problem.
  const cancelled = deriveCallIssues({
    ...base,
    status: 'cancelled',
    endReason: 'cancelled',
    clientConnected: false,
    durationSeconds: null,
    startedAt: null,
  });
  assert.ok(!cancelled.some((i) => i.code === 'media_never_connected'));

  assert.ok(deriveCallIssues({ ...base, reconnects: 5 }).some((i) => i.code === 'reconnect_storm'));
  assert.ok(!deriveCallIssues({ ...base, reconnects: 3 }).some((i) => i.code === 'reconnect_storm'));

  const device = deriveCallIssues({ ...base, deviceErrors: 1, roomErrors: 2, audioBlocked: 1 });
  assert.ok(device.some((i) => i.code === 'device_error' && i.severity === 'error'));
  assert.ok(device.some((i) => i.code === 'room_error' && i.severity === 'error'));
  assert.ok(device.some((i) => i.code === 'audio_blocked' && i.severity === 'warn'));

  assert.ok(deriveCallIssues({ ...base, minQualityScore: 2 }).some((i) => i.code === 'low_quality'));
  assert.ok(!deriveCallIssues({ ...base, minQualityScore: 3 }).some((i) => i.code === 'low_quality'));

  assert.ok(deriveCallIssues({ ...base, durationSeconds: 8 }).some((i) => i.code === 'short_talk'));
  assert.ok(!deriveCallIssues({ ...base, durationSeconds: 15 }).some((i) => i.code === 'short_talk'));
  assert.ok(!deriveCallIssues({ ...base, status: 'missed', durationSeconds: null }).some((i) => i.code === 'short_talk'));

  const longRing = deriveCallIssues({ ...base, startedAt: '2026-01-01T10:00:31.000Z' });
  assert.ok(longRing.some((i) => i.code === 'long_ring'));
  assert.ok(!deriveCallIssues({ ...base, type: 'group', startedAt: '2026-01-01T10:00:31.000Z' }).some((i) => i.code === 'long_ring'));

  assert.ok(deriveCallIssues({ ...base, ghostCleared: 2 }).some((i) => i.code === 'ghost_cleanup'));
  assert.ok(deriveCallIssues({ ...base, endReason: 'ghost_cleanup' }).some((i) => i.code === 'ghost_cleanup'));
  assert.ok(deriveCallIssues({ ...base, endReason: 'expired_empty' }).some((i) => i.code === 'expired_empty'));
  assert.ok(deriveCallIssues({ ...base, endReason: 'stale_direct' }).some((i) => i.code === 'stale_direct'));

  // --- allowlist sanity ---
  assert.equal(CLIENT_CALL_EVENT_KINDS.connected, 'info');
  assert.equal(CLIENT_CALL_EVENT_KINDS.room_error, 'error');
  assert.ok(!('sql_injection_attempt' in CLIENT_CALL_EVENT_KINDS));

  // --- getCallJournalRetentionDays: env parsing ---
  const prevRetentionEnv = process.env.CALL_JOURNAL_RETENTION_DAYS;
  try {
    delete process.env.CALL_JOURNAL_RETENTION_DAYS;
    assert.equal(getCallJournalRetentionDays(), 90);
    process.env.CALL_JOURNAL_RETENTION_DAYS = '30';
    assert.equal(getCallJournalRetentionDays(), 30);
    process.env.CALL_JOURNAL_RETENTION_DAYS = '0';
    assert.equal(getCallJournalRetentionDays(), 90);
    process.env.CALL_JOURNAL_RETENTION_DAYS = '-5';
    assert.equal(getCallJournalRetentionDays(), 90);
    process.env.CALL_JOURNAL_RETENTION_DAYS = 'abc';
    assert.equal(getCallJournalRetentionDays(), 90);
    process.env.CALL_JOURNAL_RETENTION_DAYS = '999999';
    assert.equal(getCallJournalRetentionDays(), 3650);
  } finally {
    if (prevRetentionEnv === undefined) delete process.env.CALL_JOURNAL_RETENTION_DAYS;
    else process.env.CALL_JOURNAL_RETENTION_DAYS = prevRetentionEnv;
  }

  console.log('callEventsService ok');
}

void main();
