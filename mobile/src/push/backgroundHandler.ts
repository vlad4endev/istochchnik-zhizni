/**
 * Подключается самым первым в index.ts: Firebase вызывает этот код, когда приходит пуш,
 * а приложение свёрнуто или закрыто (Android запускает JavaScript без интерфейса).
 * Здесь нельзя тянуть экраны и тяжёлые модули — только показ уведомления о звонке.
 */
import { handleCallPushData } from './callNotifications';
import { getPushTransport } from './pushNative';

const transport = getPushTransport();
if (transport) {
  transport.setBackgroundMessageHandler(async (message) => {
    await handleCallPushData(message.data, message.sentTime).catch(() => undefined);
  });
}
