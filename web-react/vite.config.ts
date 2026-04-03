import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Локальный бэкенд: `PORT` в корневом `.env` (в `src/main.ts` дефолт 40978).
 * Задаётся в web-react/.env: VITE_DEV_API_PROXY=http://127.0.0.1:40978
 * Прокси действует и для `vite dev`, и для `vite preview` (иначе /api не доходит до Express).
 *
 * Важно: аватарки отдаются как `/uploads/avatars/...` с API. Без прокси `/uploads` запросы
 * в dev попадают на Vite и дают 404 — фото «сохранилось», но не отображается.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxyTarget = env.VITE_DEV_API_PROXY || 'http://127.0.0.1:40978';
  const enablePwaDev = String(env.VITE_PWA_DEV ?? '').trim() === 'true';
  /** Видно внизу админки — чтобы отличить свежий деплой от старой «Заглушки». */
  const buildStamp = new Date().toISOString().replace('T', ' ').slice(0, 16);

  const apiProxy = {
    '/api': {
      target: apiProxyTarget,
      changeOrigin: true,
      ws: true,
    },
    '/uploads': {
      target: apiProxyTarget,
      changeOrigin: true,
    },
    '/health': {
      target: apiProxyTarget,
      changeOrigin: true,
    },
  };

  const useRelativeBase = String(env.VITE_RELATIVE_BASE ?? '').trim() === 'true';
  const base = mode === 'production' && !useRelativeBase ? '/' : './';

  return {
    define: {
      __WEB_REACT_BUILD_STAMP__: JSON.stringify(buildStamp),
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        manifest: {
          id: base,
          name: 'МОЯ ЦЕРКОВЬ — молитвенный календарь',
          short_name: 'Молитва',
          description:
            'Цифровая платформа: дневные темы, служения, молитва за членов и профиль.',
          theme_color: '#7d3640',
          background_color: '#f4f1ed',
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui', 'browser'],
          start_url: base,
          scope: base,
          lang: 'ru',
          dir: 'ltr',
          categories: ['lifestyle', 'utilities'],
          icons: [
            {
              src: 'assets/pwa-64x64.png',
              sizes: '64x64',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'assets/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'assets/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'assets/maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2,woff,ttf}'],
          // Активирует новый SW сразу без ожидания закрытия старых вкладок
          skipWaiting: true,
          clientsClaim: true,
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
          importScripts: ['custom-sw.js'],
          // Версионирование для инвалидации кэша
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/api\//,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 3600, // 1 час
                },
              },
            },
          ],
        },
        devOptions: {
          // Push notifications require an installed Service Worker.
          // In dev we keep it opt-in to avoid caching surprises: set VITE_PWA_DEV=true in web-react/.env
          enabled: mode === 'development' && enablePwaDev,
        },
      }),
    ],
    // Для web-деплоя (SPA на домене) нужен абсолютный base '/', иначе на /route ищет /route/assets/*
    // Для Capacitor оставляем относительный base './' через VITE_RELATIVE_BASE=true
    base,
    server: {
      port: 5173,
      proxy: apiProxy,
    },
    preview: {
      port: 4173,
      proxy: apiProxy,
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: true,
      chunkSizeWarningLimit: 650,
    },
  };
});
