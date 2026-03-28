import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Нативная оболочка для Vite-сборки (webDir = dist).
 * Все команды Capacitor выполняйте из каталога web-react.
 */
const config: CapacitorConfig = {
  appId: 'com.istochnikzhizni.molitva',
  appName: 'Молитва',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
