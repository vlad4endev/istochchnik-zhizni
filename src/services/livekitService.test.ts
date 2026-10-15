import assert from 'node:assert/strict';

import {
  applyLiveKitSettingsOverride,
  getLiveKitInternalUrl,
  getLiveKitInternalUrlCandidates,
  getLiveKitPublicUrl,
  isLiveKitConfigured,
  livekitIdentityForMember,
  normalizeLiveKitInternalUrl,
} from './livekitService';

async function main(): Promise<void> {
  assert.equal(livekitIdentityForMember(42), 'member:42');
  assert.equal(livekitIdentityForMember(1), 'member:1');

  assert.equal(
    normalizeLiveKitInternalUrl('http://livekit:7880'),
    'http://host.docker.internal:7880',
  );
  assert.equal(
    normalizeLiveKitInternalUrl('http://host.docker.internal:7880/'),
    'http://host.docker.internal:7880',
  );

  const prev = {
    KEY: process.env.LIVEKIT_API_KEY,
    SECRET: process.env.LIVEKIT_API_SECRET,
    URL: process.env.LIVEKIT_URL,
    PUB: process.env.LIVEKIT_PUBLIC_URL,
    WEB: process.env.PUBLIC_WEB_ORIGIN,
  };

  // Reset override so env-only tests are stable.
  applyLiveKitSettingsOverride({
    apiKey: null,
    apiSecret: null,
    internalUrl: null,
    publicUrl: null,
    tokenTtlSec: null,
    routingMode: null,
    disableLocalFallbacks: null,
  });

  delete process.env.LIVEKIT_API_KEY;
  delete process.env.LIVEKIT_API_SECRET;
  delete process.env.LIVEKIT_URL;
  delete process.env.LIVEKIT_PUBLIC_URL;
  delete process.env.PUBLIC_WEB_ORIGIN;
  assert.equal(isLiveKitConfigured(), false);

  process.env.LIVEKIT_API_KEY = 'key';
  process.env.LIVEKIT_API_SECRET = 'secret';
  process.env.LIVEKIT_URL = 'http://livekit:7880';
  assert.equal(isLiveKitConfigured(), true);
  // host-network: docker DNS livekit → gateway
  assert.equal(getLiveKitInternalUrl(), 'http://host.docker.internal:7880');
  assert.ok(getLiveKitInternalUrlCandidates().includes('http://172.17.0.1:7880'));

  process.env.LIVEKIT_URL = 'http://host.docker.internal:7880';
  assert.equal(getLiveKitInternalUrl(), 'http://host.docker.internal:7880');
  process.env.LIVEKIT_URL = 'http://livekit:7880';

  // Same-origin /lk/ from PUBLIC_WEB_ORIGIN (trailing slash)
  process.env.PUBLIC_WEB_ORIGIN = 'https://app.example.ru';
  assert.equal(getLiveKitPublicUrl(), 'wss://app.example.ru/lk/');

  // Explicit LIVEKIT_PUBLIC_URL on same host is kept (normalized with /)
  process.env.LIVEKIT_PUBLIC_URL = 'wss://app.example.ru/lk';
  assert.equal(getLiveKitPublicUrl(), 'wss://app.example.ru/lk/');

  // Legacy call.* host is overridden when PUBLIC_WEB_ORIGIN is the app host
  process.env.LIVEKIT_PUBLIC_URL = 'wss://call.example.ru';
  assert.equal(getLiveKitPublicUrl(), 'wss://app.example.ru/lk/');
  delete process.env.LIVEKIT_PUBLIC_URL;
  delete process.env.PUBLIC_WEB_ORIGIN;

  // Internal docker URL falls back to PUBLIC_WEB_ORIGIN/lk/
  process.env.LIVEKIT_PUBLIC_URL = 'ws://livekit:7880';
  process.env.PUBLIC_WEB_ORIGIN = 'https://app.example.ru';
  assert.equal(getLiveKitPublicUrl(), 'wss://app.example.ru/lk/');
  delete process.env.LIVEKIT_PUBLIC_URL;
  delete process.env.PUBLIC_WEB_ORIGIN;

  // Without PUBLIC_WEB_ORIGIN, rewrite legacy call.* → app.*/lk/
  process.env.LIVEKIT_PUBLIC_URL = 'wss://call.example.ru';
  assert.equal(getLiveKitPublicUrl(), 'wss://app.example.ru/lk/');
  delete process.env.LIVEKIT_PUBLIC_URL;

  // Non-call external host kept when no PUBLIC_WEB_ORIGIN
  process.env.LIVEKIT_PUBLIC_URL = 'wss://lk.example.ru';
  assert.equal(getLiveKitPublicUrl(), 'wss://lk.example.ru/');
  delete process.env.LIVEKIT_PUBLIC_URL;

  // local_proxy: foreign public host still prefers PUBLIC_WEB_ORIGIN/lk
  process.env.PUBLIC_WEB_ORIGIN = 'https://app.example.ru';
  process.env.LIVEKIT_PUBLIC_URL = 'wss://remote-lk.example.com';
  applyLiveKitSettingsOverride({ routingMode: 'local_proxy', disableLocalFallbacks: false });
  assert.equal(getLiveKitPublicUrl(), 'wss://app.example.ru/lk/');

  // remote_server: honor foreign public URL as-is
  applyLiveKitSettingsOverride({
    routingMode: 'remote_server',
    disableLocalFallbacks: true,
    publicUrl: 'wss://remote-lk.example.com',
    internalUrl: 'https://remote-lk.example.com',
  });
  assert.equal(getLiveKitPublicUrl(), 'wss://remote-lk.example.com/');

  // remote + disable fallbacks → only primary (no docker gateway / loopback)
  const remoteCandidates = getLiveKitInternalUrlCandidates();
  assert.deepEqual(remoteCandidates, ['https://remote-lk.example.com']);
  assert.ok(!remoteCandidates.includes('http://172.17.0.1:7880'));
  assert.ok(!remoteCandidates.includes('http://127.0.0.1:7880'));

  // Clean override again before restore
  applyLiveKitSettingsOverride({
    apiKey: null,
    apiSecret: null,
    internalUrl: null,
    publicUrl: null,
    tokenTtlSec: null,
    routingMode: null,
    disableLocalFallbacks: null,
  });

  // restore
  for (const [k, v] of Object.entries(prev)) {
    const envKey =
      k === 'KEY'
        ? 'LIVEKIT_API_KEY'
        : k === 'SECRET'
          ? 'LIVEKIT_API_SECRET'
          : k === 'URL'
            ? 'LIVEKIT_URL'
            : k === 'WEB'
              ? 'PUBLIC_WEB_ORIGIN'
              : 'LIVEKIT_PUBLIC_URL';
    if (v === undefined) delete process.env[envKey];
    else process.env[envKey] = v;
  }

  console.log('livekitService ok');
}

void main();
