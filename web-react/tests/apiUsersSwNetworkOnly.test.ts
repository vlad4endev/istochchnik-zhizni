import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const viteConfig = readFileSync(join(root, 'vite.config.ts'), 'utf8');
const nginxConf = readFileSync(join(root, '..', 'docker', 'nginx-web.unified.conf'), 'utf8');

describe('PWA / nginx: API and SW must not be edge-cached wrongly', () => {
  it('routes all /api/ through NetworkOnly (no NetworkFirst timeout)', () => {
    const apiIdx = viteConfig.lastIndexOf('urlPattern: /\\/api\\//');
    expect(apiIdx).toBeGreaterThan(-1);
    const after = viteConfig.slice(apiIdx, apiIdx + 220);
    expect(after).toContain("handler: 'NetworkOnly'");
    expect(after).not.toContain('NetworkFirst');
    expect(viteConfig).not.toMatch(/urlPattern:\s*\/\\\/api\/\/[\s\S]{0,400}networkTimeoutSeconds/);
  });

  it('tells Cloudflare not to cache sw.js at the edge', () => {
    const swIdx = nginxConf.indexOf('location = /sw.js');
    expect(swIdx).toBeGreaterThan(-1);
    const swBlock = nginxConf.slice(swIdx, swIdx + 700);
    expect(swBlock).toContain('Cloudflare-CDN-Cache-Control "no-store"');
    expect(swBlock).toContain('CDN-Cache-Control "no-store"');
  });
});
