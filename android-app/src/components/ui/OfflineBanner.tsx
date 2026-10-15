import {Text, View} from 'react-native';

import {useSyncStatusStore} from '../../sync/syncStatusStore';

export function OfflineBanner() {
  const isOnline = useSyncStatusStore(s => s.isOnline);
  const phase = useSyncStatusStore(s => s.phase);
  const pendingCount = useSyncStatusStore(s => s.pendingCount);
  const lastError = useSyncStatusStore(s => s.lastError);

  if (isOnline && phase !== 'error' && pendingCount === 0) {
    return null;
  }

  let message = '';
  let tone: 'warn' | 'info' | 'error' = 'info';

  if (!isOnline) {
    message = 'Офлайн — данные из локальной базы. Синхронизация при подключении.';
    tone = 'warn';
  } else if (phase === 'error' && lastError) {
    message = `Синхронизация: ${lastError}`;
    tone = 'error';
  } else if (pendingCount > 0) {
    message = `В очереди на отправку: ${pendingCount}`;
    tone = 'info';
  } else {
    return null;
  }

  const bg =
    tone === 'error' ? 'bg-red-100 border-red-200' : tone === 'warn' ? 'bg-amber-50 border-amber-200' : 'bg-stone-100 border-stone-200';
  const text =
    tone === 'error' ? 'text-red-800' : tone === 'warn' ? 'text-amber-900' : 'text-stone-700';

  return (
    <View className={`border-b px-4 py-2 ${bg}`}>
      <Text className={`text-sm ${text}`}>{message}</Text>
    </View>
  );
}
