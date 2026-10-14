import {Text, View} from 'react-native';

import {Button} from '../../components/ui/Button';
import {Screen} from '../../components/ui/Screen';
import {resolveApiBaseUrl} from '../../shared/config';
import {useAuthStore} from '../../shared/auth/authStore';
import {triggerSync} from '../../sync/useNetworkSync';
import {useSyncStatusStore} from '../../sync/syncStatusStore';

export function SettingsScreen() {
  const logout = useAuthStore(s => s.logout);
  const firstName = useAuthStore(s => s.firstName);
  const lastName = useAuthStore(s => s.lastName);
  const username = useAuthStore(s => s.username);
  const role = useAuthStore(s => s.role);
  const phase = useSyncStatusStore(s => s.phase);
  const isOnline = useSyncStatusStore(s => s.isOnline);
  const pendingCount = useSyncStatusStore(s => s.pendingCount);
  const songCount = useSyncStatusStore(s => s.songCount);
  const lastSuccessAt = useSyncStatusStore(s => s.lastSuccessAt);
  const lastError = useSyncStatusStore(s => s.lastError);

  return (
    <Screen scroll>
      <View className="gap-5">
        <View className="gap-1">
          <Text className="text-2xl font-bold text-stone-900">Настройки</Text>
          <Text className="text-base text-stone-600">
            {firstName} {lastName}
            {username ? ` · @${username}` : ''}
          </Text>
          {role ? <Text className="text-sm text-stone-500">Роль: {role}</Text> : null}
        </View>

        <View className="gap-2 rounded-2xl border border-stone-200 bg-white p-4">
          <Text className="text-lg font-semibold text-stone-900">Локальная база</Text>
          <Text className="text-sm text-stone-600">Песен: {songCount}</Text>
          <Text className="text-sm text-stone-600">Очередь sync: {pendingCount}</Text>
          <Text className="text-sm text-stone-600">
            Сеть: {isOnline ? 'онлайн' : 'офлайн'} ·{' '}
            {phase === 'syncing' ? 'идёт синхронизация' : 'готово'}
          </Text>
          {lastSuccessAt ? (
            <Text className="text-sm text-stone-600">
              Последний sync: {new Date(lastSuccessAt).toLocaleString('ru-RU')}
            </Text>
          ) : null}
          {lastError ? <Text className="text-sm text-red-600">{lastError}</Text> : null}
          <Text className="text-xs text-stone-400">API: {resolveApiBaseUrl() || 'не задан'}</Text>
          <Button
            title={phase === 'syncing' ? 'Синхронизация…' : 'Синхронизировать сейчас'}
            onPress={() => void triggerSync()}
            disabled={phase === 'syncing' || !isOnline}
          />
        </View>

        <Button title="Выйти" variant="ghost" onPress={() => void logout()} />
      </View>
    </Screen>
  );
}
