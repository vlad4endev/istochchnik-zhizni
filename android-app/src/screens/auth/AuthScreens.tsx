import {useState} from 'react';
import {Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {Button} from '../../components/ui/Button';
import {Screen} from '../../components/ui/Screen';
import {TextField} from '../../components/ui/TextField';
import {useAuthStore} from '../../shared/auth/authStore';
import type {RootStackParamList} from '../../app/types';

export function AuthLandingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <Screen className="justify-center">
      <View className="gap-6">
        <View className="gap-2">
          <Text className="text-3xl font-bold text-primary">Источник жизни</Text>
          <Text className="text-base text-stone-600">
            Песенник и материалы церкви — работает офлайн и синхронизируется при подключении к сети.
          </Text>
        </View>
        <Button title="Войти" onPress={() => navigation.navigate('Login')} />
      </View>
    </Screen>
  );
}

export function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const login = useAuthStore(s => s.login);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    const result = await login(phone.trim(), password);
    setLoading(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    navigation.reset({index: 0, routes: [{name: 'MainTabs'}]});
  };

  return (
    <Screen scroll>
      <View className="gap-4">
        <Text className="text-2xl font-bold text-stone-900">Вход</Text>
        <TextField
          value={phone}
          onChangeText={setPhone}
          placeholder="Телефон"
          keyboardType="phone-pad"
          autoCapitalize="none"
        />
        <TextField
          value={password}
          onChangeText={setPassword}
          placeholder="Пароль"
          secureTextEntry
        />
        {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
        <Button title={loading ? 'Вход…' : 'Войти'} onPress={onSubmit} disabled={loading} />
        <Button title="Назад" variant="ghost" onPress={() => navigation.goBack()} />
      </View>
    </Screen>
  );
}
