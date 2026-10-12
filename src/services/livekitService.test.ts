import assert from 'node:assert/strict';

import {
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
  };

  delete process.env.LIVEKIT_API_KEY;
  delete process.env.LIVEKIT_API_SECRET;
  delete process.env.LIVEKIT_URL;
  assert.equal(isLiveKitConfigured(), false);

  process.env.LIVEKIT_API_KEY = 'key';
  process.env.LIVEKIT_API_SECRET = 'secret';
  process.env.LIVEKIT_URL = 'http://livekit:7880';
  assert.equal(isLiveKitConfigured(), true);

  process.env.LIVEKIT_PUBLIC_URL = 'wss://call.example.ru';
  assert.equal(getLiveKitPublicUrl(), 'wss://call.example.ru');

  delete process.env.LIVEKIT_PUBLIC_URL;
  assert.equal(getLiveKitPublicUrl(), 'ws://livekit:7880');

  // restore
  for (const [k, v] of Object.entries(prev)) {
    const envKey =
      k === 'KEY'
        ? 'LIVEKIT_API_KEY'
        : k === 'SECRET'
          ? 'LIVEKIT_API_SECRET'
          : k === 'URL'
            ? 'LIVEKIT_URL'
            : 'LIVEKIT_PUBLIC_URL';
    if (v === undefined) delete process.env[envKey];
    else process.env[envKey] = v;
  }

  console.log('livekitService ok');
}

void main();
