import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  authorDisplayName,
  createPostComment,
  fetchPostComments,
  type FeedComment,
} from '../api/feed';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import type { RootStackParamList } from '../navigation/types';
import { useTheme, type ThemeColors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'FeedPostComments'>;

export function FeedPostCommentsScreen({ route }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { postId } = route.params;
  const qc = useQueryClient();
  const [text, setText] = useState('');

  const commentsQuery = useQuery({
    queryKey: ['feed', 'comments', postId],
    queryFn: () => fetchPostComments(postId),
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const value = text.trim();
      if (!value) throw new Error('Пустой комментарий');
      await createPostComment(postId, value);
    },
    onSuccess: () => {
      setText('');
      void qc.invalidateQueries({ queryKey: ['feed', 'comments', postId] });
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={88}
      >
        {commentsQuery.isLoading ? (
          <LoadingView />
        ) : commentsQuery.isError ? (
          <ErrorView
            message={String(commentsQuery.error)}
            onRetry={() => void commentsQuery.refetch()}
          />
        ) : (
          <FlatList
            data={commentsQuery.data ?? []}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Ionicons name="chatbubble-outline" size={36} color={colors.textMuted} />
                <Text style={styles.emptyText}>Пока нет комментариев</Text>
              </View>
            }
            renderItem={({ item }) => <CommentRow item={item} colors={colors} />}
          />
        )}

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Написать комментарий…"
            placeholderTextColor={colors.textMuted}
            multiline
          />
          <Pressable
            onPress={() => sendMutation.mutate()}
            disabled={sendMutation.isPending || !text.trim()}
            style={({ pressed }) => [
              styles.sendBtn,
              pressed && { opacity: 0.9 },
              (!text.trim() || sendMutation.isPending) && { opacity: 0.5 },
            ]}
          >
            <Ionicons name="send" size={18} color={colors.textOnPrimary} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CommentRow({ item, colors }: { item: FeedComment; colors: ThemeColors }) {
  return (
    <View
      style={{
        backgroundColor: colors.surfaceElevated,
        borderRadius: 14,
        padding: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: 'rgba(28,25,23,0.06)',
      }}
    >
      <Text style={{ fontWeight: '800', color: colors.text, marginBottom: 4 }}>
        {authorDisplayName(item.author)}
      </Text>
      <Text style={{ fontSize: 15, color: colors.text, lineHeight: 21 }}>{item.text}</Text>
      <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 8 }}>
        {item.created_at
          ? format(parseISO(item.created_at), 'd MMM, HH:mm', { locale: ru })
          : ''}
      </Text>
    </View>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    list: { padding: 16, paddingBottom: 12 },
    empty: { alignItems: 'center', paddingTop: 48, gap: 8 },
    emptyText: { color: colors.textMuted, fontWeight: '600' },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      padding: 12,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(28,25,23,0.08)',
      backgroundColor: colors.surfaceElevated,
    },
    input: {
      flex: 1,
      maxHeight: 120,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.text,
    },
    sendBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
