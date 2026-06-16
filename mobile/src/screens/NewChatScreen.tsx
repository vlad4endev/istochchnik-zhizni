import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createPersonalChat, searchMembers, type SearchMember } from '../api/messenger';
import { ChatAvatar } from '../components/messenger/ChatAvatar';
import { ErrorView } from '../components/ErrorView';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme';

function memberDisplayName(m: SearchMember): string {
  const fn = (m.first_name || '').trim();
  const ln = (m.last_name || '').trim();
  const full = `${fn} ${ln}`.trim();
  return full || m.name;
}

export function NewChatScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [query, setQuery] = useState('');

  const searchQuery = useQuery({
    queryKey: ['messenger', 'member-search', query],
    queryFn: () => searchMembers(query.trim()),
    enabled: query.trim().length >= 2,
  });

  const createMutation = useMutation({
    mutationFn: (memberId: number) => createPersonalChat(memberId),
    onSuccess: (data, memberId) => {
      const member = searchQuery.data?.find((m) => m.id === memberId);
      const title = member ? memberDisplayName(member) : 'Чат';
      navigation.replace('ChatThread', {
        conversationId: data.conversationId,
        title,
        isGroup: false,
      });
    },
  });

  const members = searchQuery.data ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Имя или фамилия..."
          placeholderTextColor={colors.textMuted}
          autoFocus
          autoCapitalize="words"
          autoCorrect={false}
        />
      </View>

      {query.trim().length < 2 ? (
        <View style={styles.hint}>
          <Text style={styles.hintText}>Введите минимум 2 символа для поиска</Text>
        </View>
      ) : null}

      {searchQuery.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      {searchQuery.isError ? (
        <ErrorView
          message={searchQuery.error instanceof Error ? searchQuery.error.message : 'Ошибка'}
          onRetry={() => void searchQuery.refetch()}
        />
      ) : null}

      {query.trim().length >= 2 && !searchQuery.isLoading && !searchQuery.isError ? (
        <FlatList
          data={members}
          keyExtractor={(item) => String(item.id)}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.hint}>
              <Text style={styles.hintText}>Никого не найдено</Text>
            </View>
          }
          renderItem={({ item }) => {
            const name = memberDisplayName(item);
            const busy = createMutation.isPending && createMutation.variables === item.id;
            return (
              <Pressable
                onPress={() => createMutation.mutate(item.id)}
                disabled={createMutation.isPending}
                style={({ pressed }) => [
                  styles.row,
                  pressed && { backgroundColor: `${colors.primary}10` },
                ]}
              >
                <ChatAvatar name={name} imageUrl={item.avatar_url} seed={String(item.id)} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{name}</Text>
                  {item.is_online ? (
                    <Text style={styles.online}>в сети</Text>
                  ) : null}
                </View>
                {busy ? <ActivityIndicator color={colors.primary} /> : null}
              </Pressable>
            );
          }}
        />
      ) : null}

      {createMutation.isError ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorText}>
            {createMutation.error instanceof Error
              ? createMutation.error.message
              : 'Не удалось создать чат'}
          </Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    searchWrap: {
      padding: 16,
    },
    search: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
    },
    hint: {
      padding: 24,
      alignItems: 'center',
    },
    hintText: {
      color: colors.textMuted,
      fontSize: 14,
      textAlign: 'center',
    },
    center: {
      padding: 24,
      alignItems: 'center',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    name: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    online: {
      fontSize: 12,
      color: '#22c55e',
      marginTop: 2,
    },
    errorBar: {
      padding: 12,
      backgroundColor: '#fef2f2',
    },
    errorText: {
      color: '#b91c1c',
      textAlign: 'center',
      fontSize: 14,
    },
  });
}
