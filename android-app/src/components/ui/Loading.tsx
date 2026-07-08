import {ActivityIndicator, Text, View} from 'react-native';

export function Loading({label = 'Загрузка…'}: {label?: string}) {
  return (
    <View className="flex-1 items-center justify-center gap-3">
      <ActivityIndicator size="large" color="#7d3640" />
      <Text className="text-base text-stone-500">{label}</Text>
    </View>
  );
}
