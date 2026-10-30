import assert from 'node:assert/strict';
import {
  buildMessengerQrPayload,
  generateMessengerAccountId,
  isValidMessengerAccountId,
  messengerAccountIdFromPublicKey,
  messengerSessionDeepLinkPath,
  normalizeMessengerAccountId,
  parseMessengerQrScanText,
} from './messengerAccountId';

function run(): void {
  const a = generateMessengerAccountId();
  assert.equal(a.length, 66);
  assert.ok(a.startsWith('05'));
  assert.equal(isValidMessengerAccountId(a), true);
  assert.equal(normalizeMessengerAccountId(a.toUpperCase()), a);
  assert.equal(normalizeMessengerAccountId(`  ${a.slice(0, 32)}-${a.slice(32)}  `), a);

  assert.equal(isValidMessengerAccountId('05short'), false);
  assert.equal(isValidMessengerAccountId('04' + 'a'.repeat(64)), false);
  assert.equal(normalizeMessengerAccountId(null), null);

  const fromKey = messengerAccountIdFromPublicKey('test-pub-key');
  assert.equal(fromKey, messengerAccountIdFromPublicKey('test-pub-key'));
  assert.ok(isValidMessengerAccountId(fromKey));

  const payload = buildMessengerQrPayload(a);
  assert.deepEqual(payload, { v: 1, type: 'messenger_session', id: a });

  const path = messengerSessionDeepLinkPath(a);
  assert.equal(path, `/messenger?sessionId=${encodeURIComponent(a)}`);
  assert.equal(parseMessengerQrScanText(path), a);
  assert.equal(parseMessengerQrScanText(`https://app.example${path}`), a);
  assert.equal(parseMessengerQrScanText(JSON.stringify(payload)), a);
  assert.equal(parseMessengerQrScanText(a), a);
  assert.equal(parseMessengerQrScanText('not-an-id'), null);

  console.log('messengerAccountId.test.ts: OK');
}

run();
