import assert from 'node:assert/strict';

import {
  getLiveKitInternalUrl,
  getLiveKitPublicUrl,
  isLiveKitConfigured,
  livekitIdentityForMember,
} from './livekitService';

async function main(): Promise<void> {
  assert.equal(livekitIdentityForMember(42), 'member:42');
  assert.equal(livekitIdentityForMember(1), 'member:1');

  const prev = {
    KEY: process.env.LIVEKIT_API_KEY,
    SECRET: process.env.LIVEKIT_API_SECRET,
    URL: process.env.LIVEKIT_URL,
    PUB: process.env.LIVEKIT_PUBLIC_URL,
    WEB: process.env.PUBLIC_WEB_ORIGIN,
  };

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
  assert.equal(getLiveKitInternalUrl(), 'http://livekit:7880');

  process.env.LIVEKIT_URL = 'http://host.docker.internal:7880';
  assert.equal(getLiveKitInternalUrl(), 'http://host.docker.internal:7880');
  process.env.LIVEKIT_URL = 'http://livekit:7880';

  // Same-origin /lk from PUBLIC_WEB_ORIGIN
  process.env.PUBLIC_WEB_ORIGIN = 'https://app.example.ru';
  assert.equal(getLiveKitPublicUrl(), 'wss://app.example.ru/lk');

  // Explicit LIVEKIT_PUBLIC_URL on same host is kept
  process.env.LIVEKIT_PUBLIC_URL = 'wss://app.example.ru/lk';
  assert.equal(getLiveKitPublicUrl(), 'wss://app.example.ru/lk');

  // Legacy call.* host is overridden when PUBLIC_WEB_ORIGIN is the app host
  process.env.LIVEKIT_PUBLIC_URL = 'wss://call.example.ru';
  assert.equal(getLiveKitPublicUrl(), 'wss://app.example.ru/lk');
  delete process.env.LIVEKIT_PUBLIC_URL;
  delete process.env.PUBLIC_WEB_ORIGIN;

  // Internal docker URL falls back to PUBLIC_WEB_ORIGIN/lk
  process.env.LIVEKIT_PUBLIC_URL = 'ws://livekit:7880';
  process.env.PUBLIC_WEB_ORIGIN = 'https://app.example.ru';
  assert.equal(getLiveKitPublicUrl(), 'wss://app.example.ru/lk');
  delete process.env.LIVEKIT_PUBLIC_URL;
  delete process.env.PUBLIC_WEB_ORIGIN;

  // Without PUBLIC_WEB_ORIGIN, rewrite legacy call.* → app.*/lk
  process.env.LIVEKIT_PUBLIC_URL = 'wss://call.example.ru';
  assert.equal(getLiveKitPublicUrl(), 'wss://app.example.ru/lk');
  delete process.env.LIVEKIT_PUBLIC_URL;

  // Non-call external host kept when no PUBLIC_WEB_ORIGIN
  process.env.LIVEKIT_PUBLIC_URL = 'wss://lk.example.ru';
  assert.equal(getLiveKitPublicUrl(), 'wss://lk.example.ru');
  delete process.env.LIVEKIT_PUBLIC_URL;

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
