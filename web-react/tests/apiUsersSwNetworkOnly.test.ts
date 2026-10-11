import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const viteConfig = readFileSync(join(root, 'vite.config.ts'), 'utf8');

describe('PWA runtimeCaching for slow admin/calendar lists', () => {
  it('routes /api/users and calendar next-week through NetworkOnly', () => {
    expect(viteConfig).toContain('users(?:');
    expect(viteConfig).toContain('calendar\\/next-week');
    const usersIdx = viteConfig.indexOf('users(?:');
    expect(usersIdx).toBeGreaterThan(-1);
    const after = viteConfig.slice(usersIdx, usersIdx + 280);
    expect(after).toContain("handler: 'NetworkOnly'");
  });

  it('does not cache opaque status 0 for generic /api NetworkFirst', () => {
    const marker = 'urlPattern: /\\/api\\//';
    const idx = viteConfig.lastIndexOf(marker);
    expect(idx).toBeGreaterThan(-1);
    const apiBlock = viteConfig.slice(idx, idx + 900);
    expect(apiBlock).toMatch(/cacheableResponse:\s*\{\s*statuses:\s*\[\s*200\s*\]\s*\}/);
    expect(apiBlock).not.toMatch(/statuses:\s*\[\s*0\s*,\s*200\s*\]/);
  });
});
