import type { CapacitorConfig } from '@capacitor/cli';

/**
 * APK по умолчанию грузит встроенный dist (нативные FCM, разрешения, CapacitorHttp).
 * VITE_API_BASE_URL=https://app.church-tambov.ru + CapacitorHttp обходят CORS.
 *
 * Только если явно задан CAPACITOR_SERVER_URL — WebView открывает удалённый сайт
 * (пуши и разрешения телефона через Capacitor тогда не работают).
 */
const serverUrl = (process.env.CAPACITOR_SERVER_URL ?? '').trim().replace(/\/+$/, '');

const server: NonNullable<CapacitorConfig['server']> = {
  androidScheme: 'https',
};

if (serverUrl) {
  server.url = serverUrl;
  server.cleartext = false;
  server.allowNavigation = [serverUrl];
}

const config: CapacitorConfig = {
  appId: 'com.istochnikzhizni.molitva',
  appName: 'Источник жизни',
  webDir: 'dist',
  server,
  ios: {
    scrollEnabled: false,
    contentInset: 'automatic',
    allowsLinkPreview: false,
    backgroundColor: '#f4f1ed',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
    CapacitorCookies: {
      enabled: true,
    },
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: false,
      backgroundColor: '#f4f1ed',
      androidSplashResourceName: 'splash',
      androidScaleType: 'FIT_CENTER',
      showSpinner: false,
      iosSpinnerStyle: 'small',
      spinnerColor: '#7d3640',
      splashFullScreen: true,
      splashImmersive: true,
      layoutName: 'launch_screen',
      useDialog: true,
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#7d3640',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'body',
      style: 'Dark',
      resizeOnFullScreen: true,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
