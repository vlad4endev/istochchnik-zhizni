const fs = require('fs');
const path = require('path');

/**
 * Базовые настройки лежат в app.json; здесь добавляется только то, что зависит от файлов и платформы.
 *
 * Пуши (в том числе звонки при закрытом приложении) идут через Firebase:
 *  - Android: google-services.json лежит в проекте;
 *  - iOS: нужен GoogleService-Info.plist из консоли Firebase (положите рядом с app.json).
 *    Пока его нет, iOS-сборка собирается без обычных пушей, чтобы не ломаться.
 *    Звонки на iPhone при закрытом приложении (CallKit + VoIP-пуш, модуль modules/expo-callkit)
 *    от Firebase не зависят: им нужен только ключ APNs на сервере.
 */
module.exports = ({ config }) => {
  const iosPlist = path.join(__dirname, 'GoogleService-Info.plist');
  const hasIosPlist = fs.existsSync(iosPlist);

  const args = process.argv.join(' ');
  const platform =
    process.env.EAS_BUILD_PLATFORM ||
    (/(^|\s)(run:ios|--platform\s+ios|-p\s+ios|--ios)(\s|$)/.test(args) ? 'ios' : '') ||
    (/(^|\s)(run:android|--platform\s+android|-p\s+android|--android)(\s|$)/.test(args) ? 'android' : '') ||
    'all';

  // Только iOS без файла Firebase: плагин Firebase не подключаем, иначе он остановит сборку.
  const useFirebase = !(platform === 'ios' && !hasIosPlist);

  return {
    ...config,
    ios: {
      ...config.ios,
      ...(hasIosPlist ? { googleServicesFile: './GoogleService-Info.plist' } : {}),
      infoPlist: {
        ...config.ios?.infoPlist,
        // voip — приём VoIP-пушей и CallKit при закрытом приложении; remote-notification — фоновые пуши.
        UIBackgroundModes: ['audio', 'voip', 'remote-notification'],
      },
    },
    plugins: [...(config.plugins ?? []), ...(useFirebase ? ['@react-native-firebase/app'] : [])],
  };
};
