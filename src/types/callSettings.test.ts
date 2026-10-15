import assert from 'node:assert/strict';

import {
  buildCallRuntimeConfig,
  buildCallSettingsAdminView,
  defaultCallSettingsDocument,
  isAppRoleAllowedForCalls,
  normalizeCallSettingsDocument,
} from './callSettings';

function run(): void {
  const empty = normalizeCallSettingsDocument(null);
  assert.equal(empty.enabled, null);
  assert.equal(empty.features.direct_calls, true);
  assert.ok(empty.allowed_roles.includes('member'));

  const doc = normalizeCallSettingsDocument({
    enabled: false,
    ring_timeout_sec: 999,
    max_group_participants: 1,
    features: { video: false, unknown: true },
    allowed_roles: ['admin', 'pastor', 'fake'],
    status_labels: {
      call: { ended: '  Готово  ', bogus: 'x' },
      participant: { busy: 'На линии' },
    },
    livekit: {
      api_key: '  key123  ',
      internal_url: ' http://host.docker.internal:7880/ ',
    },
  });

  assert.equal(doc.enabled, false);
  assert.equal(doc.ring_timeout_sec, 180);
  assert.equal(doc.max_group_participants, 2);
  assert.equal(doc.features.video, false);
  assert.equal(doc.features.audio, true);
  assert.deepEqual(doc.allowed_roles, ['admin', 'pastor']);
  assert.equal(doc.status_labels.call.ended, 'Готово');
  assert.equal((doc.status_labels.call as Record<string, string>).bogus, undefined);
  assert.equal(doc.livekit.api_key, 'key123');
  assert.equal(doc.livekit.internal_url, 'http://host.docker.internal:7880/');

  const prev = process.env.CALLS_ENABLED;
  const prevRing = process.env.CALL_RING_TIMEOUT_SEC;
  process.env.CALLS_ENABLED = 'true';
  process.env.CALL_RING_TIMEOUT_SEC = '45';

  const inherit = buildCallRuntimeConfig(defaultCallSettingsDocument());
  assert.equal(inherit.enabled, true);
  assert.equal(inherit.enabled_source, 'env');
  assert.equal(inherit.ring_timeout_sec, 45);

  const forced = buildCallRuntimeConfig(normalizeCallSettingsDocument({ enabled: false, ring_timeout_sec: 90 }));
  assert.equal(forced.enabled, false);
  assert.equal(forced.enabled_source, 'db');
  assert.equal(forced.ring_timeout_sec, 90);

  const view = buildCallSettingsAdminView(forced, { ok: true, configured: true, url: 'http://x' });
  assert.equal(view.effective_enabled, false);
  assert.equal(view.livekit.probe?.ok, true);
  assert.ok(view.status_catalog.some((e) => e.kind === 'call' && e.id === 'missed'));
  assert.ok(view.role_catalog.some((r) => r.id === 'admin'));

  assert.equal(isAppRoleAllowedForCalls('admin', ['admin']), true);
  assert.equal(isAppRoleAllowedForCalls('member', ['admin']), false);
  assert.equal(isAppRoleAllowedForCalls('parishioner', ['member']), true);

  if (prev === undefined) delete process.env.CALLS_ENABLED;
  else process.env.CALLS_ENABLED = prev;
  if (prevRing === undefined) delete process.env.CALL_RING_TIMEOUT_SEC;
  else process.env.CALL_RING_TIMEOUT_SEC = prevRing;

  console.log('callSettings.test.ts: OK');
}

run();
