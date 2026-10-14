import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {buildPgSslOptions, resolveUseSsl} from './pgSsl';

describe('pgSsl', () => {
  it('disables ssl when neither DB_SSL nor sslmode', () => {
    assert.equal(resolveUseSsl('postgresql://u:p@localhost:5432/db', 'false'), false);
    assert.equal(buildPgSslOptions({connectionString: 'postgresql://u:p@localhost:5432/db', dbSsl: 'false'}), undefined);
  });

  it('enables ssl for sslmode=require and verifies when CA present', () => {
    const ssl = buildPgSslOptions({
      connectionString: 'postgresql://u:p@host:5432/db?sslmode=require',
      caPem: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
      rejectUnauthorizedEnv: '',
    });
    assert.ok(ssl);
    assert.equal(ssl!.rejectUnauthorized, true);
    assert.ok(typeof ssl!.ca === 'string');
  });

  it('honours explicit rejectUnauthorized=false even with CA', () => {
    const ssl = buildPgSslOptions({
      connectionString: 'postgresql://u:p@host:5432/db?sslmode=require',
      caPem: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----',
      rejectUnauthorizedEnv: 'false',
    });
    assert.ok(ssl);
    assert.equal(ssl!.rejectUnauthorized, false);
  });
});
