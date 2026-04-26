import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  /** Стабильный id манифеста: не привязывать к `base` (./ vs /), иначе после сборки PWA «другая» иконка на главном экране. */
  const pwaManifestId =
    String(env.VITE_PWA_MANIFEST_ID ?? '').trim() || 'istochchnik-zhizni-pwa';
  /**
   * iOS (Safari) стабильнее открывает «с экрана Домой» в standalone, если start_url/scope — абсолютный URL того же origin.
   * Пример: VITE_PWA_ORIGIN=https://app.church-tambov.ru
   */
  const pwaOrigin = String(env.VITE_PWA_ORIGIN ?? '').trim().replace(/\/+$/, '');
  const pwaStartUrl = pwaOrigin ? `${pwaOrigin}/` : base;
  const pwaScope = pwaOrigin ? `${pwaOrigin}/` : base;
  const canHandleLinks = /^https:\/\//i.test(pwaOrigin);

  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@features': path.resolve(__dirname, 'src/features'),
      },
    },
    define: {
      __WEB_REACT_BUILD_STAMP__: JSON.stringify(buildStamp),
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        manifest: {
          id: pwaManifestId,
          name: 'Моя церковь - цифровая плаформа',
          short_name: 'Моя церковь',
          description:
            'Цифровая платформа: дневные темы, служения, молитва за членов и профиль.',
          theme_color: '#7d3640',
          background_color: '#f4f1ed',
          display: 'standalone',
          orientation: 'portrait',
          /* Не задаём display_override: на iOS WebKit это часто игнорируется или ведёт себя иначе, чем один display. */
          start_url: pwaStartUrl,
          scope: pwaScope,
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
              src: 'assets/maskable-icon-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
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
          shortcuts: [
            {
              name: 'Открыть мессенджер',
              short_name: 'Чат',
              url: '/messenger',
              icons: [{ src: '/assets/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'Календарь',
              short_name: 'Календарь',
              url: '/calendar',
              icons: [{ src: '/assets/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
            {
              name: 'Студия',
              short_name: 'Студия',
              url: '/studio',
              icons: [{ src: '/assets/pwa-192x192.png', sizes: '192x192', type: 'image/png' }],
            },
          ],
          screenshots: [
            {
              src: '/assets/screenshot-mobile.png',
              sizes: '390x844',
              type: 'image/png',
              form_factor: 'narrow',
              label: 'Главный экран',
            },
            {
              src: '/assets/screenshot-desktop.png',
              sizes: '1280x800',
              type: 'image/png',
              form_factor: 'wide',
              label: 'Десктоп версия',
            },
          ],
          ...(canHandleLinks
            ? ({
                /**
                 * Позволяет ОС/браузеру (где поддерживается) открывать https-ссылки
                 * этого origin сразу в установленной PWA вместо обычной вкладки.
                 * После изменения манифеста пользователю обычно нужно обновить/переустановить PWA.
                 */
                url_handlers: [{ origin: pwaOrigin }],
                /**
                 * При открытии ссылки стараемся фокусировать существующее окно приложения,
                 * а не плодить отдельные инстансы.
                 */
                launch_handler: { client_mode: 'focus-existing' },
              } as Record<string, unknown>)
            : {}),
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2,woff,ttf,otf,eot}'],
          /**
           * Иконки из `manifest.icons` плагин уже кладёт в precache с `__WB_REVISION__`.
           * globPatterns дублирует те же `assets/*.png` без revision → Workbox: add-to-cache-list-conflicting-entries.
           */
          globIgnores: [
            '**/pwa-64x64.png',
            '**/pwa-192x192.png',
            '**/pwa-512x512.png',
            '**/maskable-icon-192x192.png',
            '**/maskable-icon-512x512.png',
          ],
          skipWaiting: true,
          clientsClaim: true,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api/, /^\/uploads/, /^\/health/],
          /**
           * `public/custom-sw.js` — обработчики Web Push (`push`, `notificationclick`, бейдж).
           * Без importScripts файл только прекэшируется и не выполняется в контексте SW.
           */
          importScripts: ['custom-sw.js'],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === 'navigate',
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'navigation-cache',
              },
            },
            {
              urlPattern: /\/api\//,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                networkTimeoutSeconds: 3,
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'images-cache',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 30 * 24 * 60 * 60,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /\.(?:woff|woff2|ttf|otf|eot)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'fonts-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 30 * 24 * 60 * 60,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /\.(?:js|css)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'static-cache',
                expiration: {
                  maxEntries: 60,
                  maxAgeSeconds: 7 * 24 * 60 * 60,
                },
                cacheableResponse: { statuses: [0, 200] },
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
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-ui': ['zustand', '@tanstack/react-query'],
            'vendor-utils': ['axios', 'date-fns'],
            'vendor-icons': ['react-icons'],
            'vendor-emoji-react': ['@emoji-mart/react'],
            'vendor-emoji-data': ['@emoji-mart/data'],
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },
  };
});
