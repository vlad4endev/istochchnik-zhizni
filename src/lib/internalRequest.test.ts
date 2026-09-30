import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';

import { internalGet } from './internalRequest';

async function main(): Promise<void> {
  const app = express();
  app.get('/inner', (req, res) => {
    res.json({ auth: req.headers.authorization ?? null, q: req.query.x ?? null });
  });
  app.get('/missing-auth', (_req, res) => {
    res.status(401).json({ error: 'no' });
  });
  app.get('/outer', async (req, res) => {
    const [a, b, c] = await Promise.all([
      internalGet(req, '/inner?x=1'),
      internalGet(req, '/missing-auth'),
      internalGet(req, '/nope'),
    ]);
    res.json({ a, b, c });
  });
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  const body = await new Promise<{ a: unknown; b: { status: number }; c: { status: number } }>((resolve, reject) => {
    http
      .get({ port, path: '/outer', headers: { authorization: 'Bearer t' } }, (res) => {
        let s = '';
        res.on('data', (d) => (s += d));
        res.on('end', () => resolve(JSON.parse(s)));
      })
      .on('error', reject);
  });
  server.close();
  assert.deepEqual(body.a, { status: 200, body: { auth: 'Bearer t', q: '1' } });
  assert.equal(body.b.status, 401);
  assert.equal(body.c.status, 404);
  console.log('internalRequest ok');
}

void main();
