import assert from 'node:assert/strict';
import test from 'node:test';

import { isPrivateIp, parseHtmlMeta } from './linkPreviewService';

test('isPrivateIp blocks internal ranges', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.5', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:10.0.0.1']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  assert.equal(isPrivateIp('8.8.8.8'), false);
});

test('parseHtmlMeta reads OG tags and resolves relative urls', () => {
  const p = parseHtmlMeta(
    `<html><head><title>Fallback</title>
     <meta property="og:title" content="Hello &amp; welcome">
     <meta property="og:image" content="/img/a.png">
     <meta name="description" content="Desc">
     <link rel="icon" href="/f.ico"></head></html>`,
    'https://www.example.com/page',
  );
  assert.equal(p.title, 'Hello & welcome');
  assert.equal(p.image, 'https://www.example.com/img/a.png');
  assert.equal(p.description, 'Desc');
  assert.equal(p.favicon, 'https://www.example.com/f.ico');
  assert.equal(p.host, 'example.com');
});
