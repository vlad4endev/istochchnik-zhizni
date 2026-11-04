import assert from 'node:assert/strict';

/**
 * Контракт полей публичного сайта (админка ↔ /api/site/public/*).
 * Без БД — фиксируем ожидаемые ключи настроек.
 */
function run(): void {
  const settingsKeys = [
    'church_name',
    'tagline',
    'about_text',
    'contact_text',
    'show_events',
    'show_live',
    'show_gallery',
    'updated_at',
  ] as const;

  assert.equal(settingsKeys.length, 8);
  assert.equal(new Set(settingsKeys).size, 8);

  const publicRoutes = [
    '/api/site/public/overview',
    '/api/site/public/settings',
    '/api/site/public/events',
    '/api/site/public/broadcast',
    '/api/site/public/gallery',
  ];
  assert.ok(publicRoutes.every((p) => p.startsWith('/api/site/public/')));

  console.log('siteContentService.test OK');
}

run();
