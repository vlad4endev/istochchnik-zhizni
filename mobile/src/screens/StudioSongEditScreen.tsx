import { Ionicons } from '@expo/vector-icons';
import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchSong } from '../api/songs';
import { fetchVersionForSong, saveVersion } from '../api/studio';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import type { RootStackParamList } from '../navigation/types';
import { useTheme, type ThemeColors } from '../theme';

type Route = RouteProp<RootStackParamList, 'StudioSongEdit'>;

export function StudioSongEditScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { songId, title } = route.params;
  const qc = useQueryClient();

  const [content, setContent] = useState('');
  const [key, setKey] = useState('');
  const [baseline, setBaseline] = useState<{ content: string; key: string } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const songQuery = useQuery({
    queryKey: ['song', songId],
    queryFn: () => fetchSong(songId),
  });

  const versionQuery = useQuery({
    queryKey: ['studio', 'version', songId],
    queryFn: () => fetchVersionForSong(songId),
  });

  useEffect(() => {
    navigation.setOptions({ title: title || 'Редактор' });
  }, [navigation, title]);

  useEffect(() => {
    if (hydrated) return;
    if (songQuery.isLoading || versionQuery.isLoading) return;
    if (!songQuery.data) return;

    const version = versionQuery.data;
    const nextContent = (version?.custom_content ?? songQuery.data.content ?? '').toString();
    const nextKey = (version?.custom_key ?? songQuery.data.default_key ?? '').toString();
    setContent(nextContent);
    setKey(nextKey);
    setBaseline({ content: nextContent, key: nextKey });
    setHydrated(true);
  }, [hydrated, songQuery.data, songQuery.isLoading, versionQuery.data, versionQuery.isLoading]);

  const dirty =
    baseline != null && (content !== baseline.content || key !== baseline.key);

  const saveMut = useMutation({
    mutationFn: () =>
      saveVersion(songId, {
        custom_content: content,
        custom_key: key.trim() ? key.trim() : null,
      }),
    onSuccess: (saved) => {
      const nextContent = saved.custom_content ?? content;
      const nextKey = saved.custom_key ?? '';
      setContent(nextContent);
      setKey(nextKey);
      setBaseline({ content: nextContent, key: nextKey });
      void qc.invalidateQueries({ queryKey: ['studio', 'versions'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'version', songId] });
      void qc.invalidateQueries({ queryKey: ['song', songId] });
      Alert.alert('Сохранено', 'Версия песни обновлена');
    },
    onError: (err: unknown) => {
      Alert.alert('Ошибка', err instanceof Error ? err.message : 'Не удалось сохранить');
    },
  });

  const confirmDiscard = () => {
    if (!dirty) {
      navigation.goBack();
      return;
    }
    Alert.alert('Несохранённые изменения', 'Выйти без сохранения?', [
      { text: 'Остаться', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  };

  const loading = songQuery.isLoading || versionQuery.isLoading || !hydrated;
  const error = songQuery.isError
    ? songQuery.error
    : versionQuery.isError
      ? versionQuery.error
      : null;

  if (loading) {
    return (
      <View style={styles.safe}>
        <LoadingView />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.safe}>
        <ErrorView
          message={error instanceof Error ? error.message : 'Ошибка'}
          onRetry={() => {
            setHydrated(false);
            void songQuery.refetch();
            void versionQuery.refetch();
          }}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.safe}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.toolbar}>
        <Pressable onPress={confirmDiscard} hitSlop={10} style={styles.toolBtn}>
          <Ionicons name="close" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.toolbarCenter}>
          <Text style={styles.toolbarTitle} numberOfLines={1}>
            {title || songQuery.data?.title || 'Песня'}
          </Text>
          <Text style={styles.toolbarSub}>
            {dirty ? 'Есть изменения' : versionQuery.data ? 'Ваша версия' : 'Новая версия'}
          </Text>
        </View>
        <Pressable
          onPress={() => saveMut.mutate()}
          disabled={!dirty || saveMut.isPending}
          style={({ pressed }) => [
            styles.saveBtn,
            (!dirty || saveMut.isPending) && { opacity: 0.45 },
            pressed && dirty && { opacity: 0.9 },
          ]}
        >
          {saveMut.isPending ? (
            <ActivityIndicator size="small" color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.saveBtnText}>Сохранить</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>Тональность</Text>
        <TextInput
          style={styles.keyInput}
          value={key}
          onChangeText={setKey}
          placeholder={songQuery.data?.default_key || 'например Am'}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>ChordPro / текст</Text>
        <TextInput
          style={styles.editor}
          value={content}
          onChangeText={setContent}
          placeholder="Текст песни в формате ChordPro…"
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.1)',
      backgroundColor: colors.surfaceElevated,
    },
    toolBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toolbarCenter: {
      flex: 1,
      minWidth: 0,
    },
    toolbarTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    toolbarSub: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 1,
    },
    saveBtn: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
      minWidth: 96,
      alignItems: 'center',
    },
    saveBtnText: {
      color: colors.textOnPrimary,
      fontWeight: '800',
      fontSize: 13,
    },
    content: {
      padding: 16,
      gap: 8,
    },
    label: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      marginTop: 6,
    },
    keyInput: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(28,25,23,0.1)',
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 16,
      color: colors.text,
    },
    editor: {
      minHeight: 420,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(28,25,23,0.1)',
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 15,
      lineHeight: 22,
      color: colors.text,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
  });
}
