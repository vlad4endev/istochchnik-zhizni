const fs = require('fs');
const path = require('path');

/**
 * Базовые настройки лежат в app.json; здесь добавляется только то, что зависит от файлов и платформы.
 *
 * Пуши (в том числе звонки при закрытом приложении) идут через Firebase:
 *  - Android: google-services.json лежит в проекте;
 *  - iOS: нужен GoogleService-Info.plist из консоли Firebase (положите рядом с app.json).
 *    Пока его нет, iOS-сборка собирается без пушей, чтобы не ломаться.
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
    },
    plugins: [...(config.plugins ?? []), ...(useFirebase ? ['@react-native-firebase/app'] : [])],
  };
};
