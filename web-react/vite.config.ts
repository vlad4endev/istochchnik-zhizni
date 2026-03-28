import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Локальный бэкенд: `PORT` в корневом `.env` (в `src/main.ts` дефолт 40978).
 * Задаётся в web-react/.env: VITE_DEV_API_PROXY=http://127.0.0.1:40978
 * Прокси действует и для `vite dev`, и для `vite preview` (иначе /api не доходит до Express).
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxyTarget = env.VITE_DEV_API_PROXY || 'http://127.0.0.1:40978';
  /** Видно внизу админки — чтобы отличить свежий деплой от старой «Заглушки». */
  const buildStamp = new Date().toISOString().replace('T', ' ').slice(0, 16);

  const apiProxy = {
    '/api': {
      target: apiProxyTarget,
      changeOrigin: true,
      ws: true,
    },
    '/health': {
      target: apiProxyTarget,
      changeOrigin: true,
    },
  };

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
          id: './',
          name: 'МОЯ ЦЕРКОВЬ — молитвенный календарь',
          short_name: 'Молитва',
          description:
            'Молитвенный календарь церкви: дневные темы, служения, молитва за членов и профиль.',
          theme_color: '#7d3640',
          background_color: '#f4f1ed',
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui', 'browser'],
          start_url: './',
          scope: './',
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
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    // Относительные пути — корректная загрузка ассетов в Capacitor WebView (file/capacitor).
    base: './',
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
