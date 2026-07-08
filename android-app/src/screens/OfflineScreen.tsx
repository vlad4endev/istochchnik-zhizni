import {Text, View} from 'react-native';

import {Screen} from '../components/ui/Screen';

export function OfflineScreen() {
  return (
    <Screen className="justify-center">
      <View className="gap-3">
        <Text className="text-2xl font-bold text-stone-900">Нет подключения</Text>
        <Text className="text-base text-stone-600">
          Данные доступны офлайн из локальной базы. Синхронизация продолжится при появлении сети.
        </Text>
      </View>
    </Screen>
  );
}
