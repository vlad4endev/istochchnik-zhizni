import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Локальный бэкенд: `PORT` в корневом `.env` (в `src/main.ts` дефолт 40978).
 * Задаётся в web-react/.env: VITE_DEV_API_PROXY=http://127.0.0.1:40978
 * Прокси действует и для `vite dev`, и для `vite preview` (иначе /api не доходит до Express).
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxyTarget = env.VITE_DEV_API_PROXY || 'http://127.0.0.1:40978';

  const apiProxy = {
    '/api': {
      target: apiProxyTarget,
      changeOrigin: true,
    },
    '/health': {
      target: apiProxyTarget,
      changeOrigin: true,
    },
  };

  return {
    plugins: [react()],
    base: '/',
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
