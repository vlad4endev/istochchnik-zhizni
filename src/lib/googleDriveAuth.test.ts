import assert from 'node:assert/strict';

import {
  normalizeDriveOAuthDocument,
  normalizeDrivePrivateKey,
  parseDriveOAuthClientJson,
  parseDriveServiceAccountJson,
  resolveDriveOAuthRedirectUri,
} from './googleDriveAuth';

function run(): void {
  const escaped = '-----BEGIN PRIVATE KEY-----\\nMIIB\\n-----END PRIVATE KEY-----\\n';
  const normalized = normalizeDrivePrivateKey(escaped);
  assert.equal(normalized.includes('\\n'), false);
  assert.ok(normalized.includes('\n'));

  const parsed = parseDriveServiceAccountJson(
    JSON.stringify({
      type: 'service_account',
      client_email: 'sa@example.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----\n',
    }),
  );
  assert.ok(parsed);
  assert.equal(parsed?.client_email, 'sa@example.iam.gserviceaccount.com');
  assert.equal(parseDriveServiceAccountJson('{not json'), null);
  assert.equal(parseDriveServiceAccountJson('{"client_email":"x@y.z"}'), null);

  const webClient = parseDriveOAuthClientJson(
    JSON.stringify({
      web: { client_id: 'abc.apps.googleusercontent.com', client_secret: 'GOCSPX-secret' },
    }),
  );
  assert.equal(webClient?.client_id, 'abc.apps.googleusercontent.com');
  assert.equal(parseDriveOAuthClientJson('{"client_id":"x"}'), null);

  const oauthDoc = normalizeDriveOAuthDocument({
    client_id: ' id ',
    client_secret: 'sec',
    refresh_token: 'rt',
    email: 'user@gmail.com',
  });
  assert.equal(oauthDoc.client_id, 'id');
  assert.equal(oauthDoc.email, 'user@gmail.com');

  process.env.PUBLIC_WEB_ORIGIN = 'https://app.example.ru/';
  assert.equal(
    resolveDriveOAuthRedirectUri(),
    'https://app.example.ru/api/backup/drive/oauth/callback',
  );
  delete process.env.PUBLIC_WEB_ORIGIN;

  console.log('googleDriveAuth.test.ts: ok');
}

run();
