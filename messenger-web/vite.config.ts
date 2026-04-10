import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxy = env.VITE_DEV_MESSENGER_API || 'http://127.0.0.1:3002';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '../web-react/src'),
        '@features': path.resolve(__dirname, '../web-react/src/features'),
      },
    },
    server: {
      port: 5174,
      fs: {
        allow: [path.resolve(__dirname, '..')],
      },
      proxy: {
        '/api': { target: apiProxy, changeOrigin: true, ws: true },
        '/uploads': { target: apiProxy, changeOrigin: true },
        '/health': { target: apiProxy, changeOrigin: true },
      },
    },
    preview: {
      port: 4174,
      proxy: {
        '/api': { target: apiProxy, changeOrigin: true, ws: true },
        '/uploads': { target: apiProxy, changeOrigin: true },
      },
    },
  };
});
