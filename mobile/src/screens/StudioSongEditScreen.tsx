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

import { fetchSong, type RecognizedSong } from '../api/songs';
import {
  aiChordPlacement,
  aiSongCleanup,
  fetchVersionForSong,
  saveSheetVersion,
  saveVersion,
  type StudioSheetMeta,
} from '../api/studio';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { SheetMusicPreview } from '../components/studio/SheetMusicPreview';
import { SheetRecognizerModal } from '../components/studio/SheetRecognizerModal';
import {
  buildSheetMetaFromRecognition,
  recognizedSongToSheetChordPro,
} from '../lib/sheetMusicTypes';
import type { RootStackParamList } from '../navigation/types';
import { useTheme, type ThemeColors } from '../theme';

type Route = RouteProp<RootStackParamList, 'StudioSongEdit'>;
type Pane = 'lyrics' | 'sheet';

type LyricsBaseline = { content: string; key: string };
type SheetBaseline = {
  content: string;
  key: string;
  meta: StudioSheetMeta;
};

function emptyMeta(): StudioSheetMeta {
  return {
    bpm: null,
    timeSignature: null,
    composer: null,
    arranger: null,
    title: null,
    generalNotes: null,
    abcNotation: null,
    sourceImageUrl: null,
  };
}

function normalizeMeta(raw: StudioSheetMeta | null | undefined): StudioSheetMeta {
  return {
    ...emptyMeta(),
    ...(raw ?? {}),
  };
}

function metaEqual(a: StudioSheetMeta, b: StudioSheetMeta): boolean {
  return JSON.stringify(normalizeMeta(a)) === JSON.stringify(normalizeMeta(b));
}

export function StudioSongEditScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  const route = useRoute<Route>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { songId, title } = route.params;
  const qc = useQueryClient();

  const [pane, setPane] = useState<Pane>('lyrics');
  const [showSheetPreview, setShowSheetPreview] = useState(false);
  const [recognizerOpen, setRecognizerOpen] = useState(false);

  const [content, setContent] = useState('');
  const [key, setKey] = useState('');
  const [lyricsBaseline, setLyricsBaseline] = useState<LyricsBaseline | null>(null);

  const [sheetContent, setSheetContent] = useState('');
  const [sheetKey, setSheetKey] = useState('');
  const [sheetMeta, setSheetMeta] = useState<StudioSheetMeta>(emptyMeta());
  const [sheetBaseline, setSheetBaseline] = useState<SheetBaseline | null>(null);
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
    setLyricsBaseline({ content: nextContent, key: nextKey });

    const nextSheetContent = (version?.sheet_content ?? '').toString();
    const nextSheetKey = (version?.sheet_key ?? '').toString();
    const nextMeta = normalizeMeta(version?.sheet_meta);
    setSheetContent(nextSheetContent);
    setSheetKey(nextSheetKey);
    setSheetMeta(nextMeta);
    setSheetBaseline({ content: nextSheetContent, key: nextSheetKey, meta: nextMeta });
    setHydrated(true);
  }, [hydrated, songQuery.data, songQuery.isLoading, versionQuery.data, versionQuery.isLoading]);

  const lyricsDirty =
    lyricsBaseline != null &&
    (content !== lyricsBaseline.content || key !== lyricsBaseline.key);
  const sheetDirty =
    sheetBaseline != null &&
    (sheetContent !== sheetBaseline.content ||
      sheetKey !== sheetBaseline.key ||
      !metaEqual(sheetMeta, sheetBaseline.meta));
  const dirty = pane === 'lyrics' ? lyricsDirty : sheetDirty;

  const saveLyricsMut = useMutation({
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
      setLyricsBaseline({ content: nextContent, key: nextKey });
      void qc.invalidateQueries({ queryKey: ['studio', 'versions'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'version', songId] });
      void qc.invalidateQueries({ queryKey: ['song', songId] });
      Alert.alert('Сохранено', 'Текстовая версия обновлена');
    },
    onError: (err: unknown) => {
      Alert.alert('Ошибка', err instanceof Error ? err.message : 'Не удалось сохранить');
    },
  });

  const saveSheetMut = useMutation({
    mutationFn: () => {
      if (!sheetContent.trim()) {
        throw new Error('Введите ChordPro / текст нотной версии');
      }
      const metaPayload: StudioSheetMeta = {
        ...sheetMeta,
        bpm:
          sheetMeta.bpm == null || Number.isNaN(Number(sheetMeta.bpm))
            ? null
            : Number(sheetMeta.bpm),
        timeSignature: sheetMeta.timeSignature?.trim() || null,
        composer: sheetMeta.composer?.trim() || null,
        arranger: sheetMeta.arranger?.trim() || null,
        title: sheetMeta.title?.trim() || null,
        generalNotes: sheetMeta.generalNotes?.trim() || null,
        abcNotation: sheetMeta.abcNotation?.trim() || null,
        sourceImageUrl: sheetMeta.sourceImageUrl?.trim() || null,
      };
      return saveSheetVersion(songId, {
        sheet_content: sheetContent,
        sheet_key: sheetKey.trim() ? sheetKey.trim() : null,
        sheet_meta: metaPayload,
      });
    },
    onSuccess: (saved) => {
      const nextContent = saved.sheet_content ?? sheetContent;
      const nextKey = saved.sheet_key ?? '';
      const nextMeta = normalizeMeta(saved.sheet_meta);
      setSheetContent(nextContent);
      setSheetKey(nextKey);
      setSheetMeta(nextMeta);
      setSheetBaseline({ content: nextContent, key: nextKey, meta: nextMeta });
      void qc.invalidateQueries({ queryKey: ['studio', 'versions'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'version', songId] });
      void qc.invalidateQueries({ queryKey: ['studio', 'setlist'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'perform'] });
      Alert.alert('Сохранено', 'Нотная версия обновлена');
    },
    onError: (err: unknown) => {
      Alert.alert('Ошибка', err instanceof Error ? err.message : 'Не удалось сохранить ноты');
    },
  });

  const cleanupMut = useMutation({
    mutationFn: () => aiSongCleanup(content),
    onSuccess: (res) => {
      const next = String(res.chordPro ?? '').trim();
      if (!next) {
        Alert.alert('AI', 'Пустой ответ — текст не изменён');
        return;
      }
      if (next === content.trim()) {
        Alert.alert('AI', 'Текст уже в порядке');
        return;
      }
      setContent(next);
      Alert.alert('Готово', 'Текст приведён в ChordPro — проверьте и сохраните');
    },
    onError: (err: unknown) => {
      Alert.alert('AI', err instanceof Error ? err.message : 'Не удалось обработать текст');
    },
  });

  const chordsMut = useMutation({
    mutationFn: () => aiChordPlacement(content),
    onSuccess: (res) => {
      const next = String(res.content ?? '').trim();
      if (!next) {
        Alert.alert('AI', 'Пустой ответ — текст не изменён');
        return;
      }
      setContent(next);
      Alert.alert(
        'Готово',
        `Аккорды расставлены (${res.totalChords ?? 0}). Проверьте и сохраните`,
      );
    },
    onError: (err: unknown) => {
      Alert.alert('AI', err instanceof Error ? err.message : 'Не удалось расставить аккорды');
    },
  });

  const saving = saveLyricsMut.isPending || saveSheetMut.isPending;
  const aiBusy = cleanupMut.isPending || chordsMut.isPending;

  const runCleanup = () => {
    if (!content.trim()) {
      Alert.alert('AI', 'Сначала введите текст песни');
      return;
    }
    Alert.alert('Привести в порядок?', 'AI переформатирует текст в ChordPro. Сохранение вручную.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Запустить', onPress: () => cleanupMut.mutate() },
    ]);
  };

  const runChords = () => {
    if (!content.trim()) {
      Alert.alert('AI', 'Сначала введите текст песни');
      return;
    }
    Alert.alert('Расставить аккорды?', 'AI добавит аккорды к тексту. Сохранение вручную.', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Запустить', onPress: () => chordsMut.mutate() },
    ]);
  };

  const confirmDiscard = () => {
    if (!lyricsDirty && !sheetDirty) {
      navigation.goBack();
      return;
    }
    Alert.alert('Несохранённые изменения', 'Выйти без сохранения?', [
      { text: 'Остаться', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  };

  const onSave = () => {
    if (pane === 'lyrics') saveLyricsMut.mutate();
    else saveSheetMut.mutate();
  };

  const applySheetRecognition = async (data: RecognizedSong) => {
    const hasNotation = Boolean(data.abcNotation?.trim() || data.sourceImageUrl?.trim());
    const nextChordPro = recognizedSongToSheetChordPro(data);
    if (!nextChordPro.trim() && !hasNotation) {
      throw new Error('Не удалось извлечь ноты из партитуры');
    }
    const nextMeta = buildSheetMetaFromRecognition(data);
    const nextKey = data.key?.trim() || '';
    const contentToSave = nextChordPro.trim() || '{sec:Партитура}\n';
    const saved = await saveSheetVersion(songId, {
      sheet_content: contentToSave,
      sheet_key: nextKey || null,
      sheet_meta: nextMeta,
    });
    const savedContent = saved.sheet_content ?? contentToSave;
    const savedKey = saved.sheet_key ?? nextKey;
    const savedMeta = normalizeMeta(saved.sheet_meta ?? nextMeta);
    setSheetContent(savedContent);
    setSheetKey(savedKey);
    setSheetMeta(savedMeta);
    setSheetBaseline({ content: savedContent, key: savedKey, meta: savedMeta });
    setPane('sheet');
    setShowSheetPreview(false);
    void qc.invalidateQueries({ queryKey: ['studio', 'versions'] });
    void qc.invalidateQueries({ queryKey: ['studio', 'version', songId] });
    void qc.invalidateQueries({ queryKey: ['studio', 'setlist'] });
    void qc.invalidateQueries({ queryKey: ['studio', 'perform'] });
    const titleBit = data.title?.trim() ? ` «${data.title.trim()}»` : '';
    Alert.alert(
      'Готово',
      `Создана версия с нотами${titleBit}. Основной текст песни не изменён.`,
    );
  };

  const patchMeta = <K extends keyof StudioSheetMeta>(field: K, value: StudioSheetMeta[K]) => {
    setSheetMeta((prev) => ({ ...prev, [field]: value }));
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
            {dirty
              ? 'Есть изменения'
              : pane === 'sheet'
                ? sheetBaseline?.content
                  ? 'Нотная версия'
                  : 'Новая нотная версия'
                : versionQuery.data?.custom_content
                  ? 'Ваша версия'
                  : 'Новая версия'}
          </Text>
        </View>
        <Pressable
          onPress={onSave}
          disabled={!dirty || saving || aiBusy}
          style={({ pressed }) => [
            styles.saveBtn,
            (!dirty || saving || aiBusy) && { opacity: 0.45 },
            pressed && dirty && { opacity: 0.9 },
          ]}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.textOnPrimary} />
          ) : (
            <Text style={styles.saveBtnText}>Сохранить</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.tabs}>
        <Pressable
          onPress={() => setPane('lyrics')}
          style={[styles.tab, pane === 'lyrics' && styles.tabActive]}
        >
          <Text style={[styles.tabText, pane === 'lyrics' && styles.tabTextActive]}>
            Текст
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setPane('sheet')}
          style={[styles.tab, pane === 'sheet' && styles.tabActive]}
        >
          <Text style={[styles.tabText, pane === 'sheet' && styles.tabTextActive]}>
            Ноты
          </Text>
        </Pressable>
      </View>

      {pane === 'lyrics' ? (
        <View style={styles.aiRow}>
          <Pressable
            onPress={runCleanup}
            disabled={aiBusy || saving}
            style={({ pressed }) => [
              styles.aiBtn,
              (aiBusy || saving) && { opacity: 0.5 },
              pressed && { opacity: 0.85 },
            ]}
          >
            {cleanupMut.isPending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
            )}
            <Text style={styles.aiBtnText}>Привести в порядок</Text>
          </Pressable>
          <Pressable
            onPress={runChords}
            disabled={aiBusy || saving}
            style={({ pressed }) => [
              styles.aiBtn,
              (aiBusy || saving) && { opacity: 0.5 },
              pressed && { opacity: 0.85 },
            ]}
          >
            {chordsMut.isPending ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="musical-notes-outline" size={16} color={colors.primary} />
            )}
            <Text style={styles.aiBtnText}>Аккорды</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.aiRow}>
          <Pressable
            onPress={() => setShowSheetPreview((v) => !v)}
            style={({ pressed }) => [styles.aiBtn, pressed && { opacity: 0.85 }]}
          >
            <Ionicons
              name={showSheetPreview ? 'create-outline' : 'eye-outline'}
              size={16}
              color={colors.primary}
            />
            <Text style={styles.aiBtnText}>
              {showSheetPreview ? 'Редактор' : 'Просмотр'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setRecognizerOpen(true)}
            disabled={saving || aiBusy}
            style={({ pressed }) => [
              styles.aiBtn,
              (saving || aiBusy) && { opacity: 0.5 },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="camera-outline" size={16} color={colors.primary} />
            <Text style={styles.aiBtnText}>Распознать</Text>
          </Pressable>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 24 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {pane === 'lyrics' ? (
          <>
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
          </>
        ) : showSheetPreview ? (
          <SheetMusicPreview
            sheetMeta={sheetMeta}
            sheetKey={sheetKey}
            songTitle={title || songQuery.data?.title}
            fallbackContent={sheetContent}
          />
        ) : (
          <>
            <Text style={styles.label}>Тональность нот</Text>
            <TextInput
              style={styles.keyInput}
              value={sheetKey}
              onChangeText={setSheetKey}
              placeholder={key || songQuery.data?.default_key || 'например C'}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Заголовок нот</Text>
            <TextInput
              style={styles.keyInput}
              value={sheetMeta.title ?? ''}
              onChangeText={(v) => patchMeta('title', v)}
              placeholder={title || songQuery.data?.title || 'Название'}
              placeholderTextColor={colors.textMuted}
            />

            <View style={styles.metaRow}>
              <View style={styles.metaHalf}>
                <Text style={styles.label}>BPM</Text>
                <TextInput
                  style={styles.keyInput}
                  value={sheetMeta.bpm == null ? '' : String(sheetMeta.bpm)}
                  onChangeText={(v) => {
                    const n = v.trim() === '' ? null : Number(v);
                    patchMeta('bpm', n != null && Number.isFinite(n) ? n : null);
                  }}
                  keyboardType="number-pad"
                  placeholder="120"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={styles.metaHalf}>
                <Text style={styles.label}>Размер</Text>
                <TextInput
                  style={styles.keyInput}
                  value={sheetMeta.timeSignature ?? ''}
                  onChangeText={(v) => patchMeta('timeSignature', v)}
                  placeholder="4/4"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                />
              </View>
            </View>

            <Text style={styles.label}>Композитор</Text>
            <TextInput
              style={styles.keyInput}
              value={sheetMeta.composer ?? ''}
              onChangeText={(v) => patchMeta('composer', v)}
              placeholder="Необязательно"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.label}>Аранжировка</Text>
            <TextInput
              style={styles.keyInput}
              value={sheetMeta.arranger ?? ''}
              onChangeText={(v) => patchMeta('arranger', v)}
              placeholder="Необязательно"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.label}>ChordPro / текст нот</Text>
            <TextInput
              style={styles.editor}
              value={sheetContent}
              onChangeText={setSheetContent}
              placeholder="Нотная версия в ChordPro…"
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />

            <Text style={styles.label}>ABC (если есть)</Text>
            <TextInput
              style={styles.abcEditor}
              value={sheetMeta.abcNotation ?? ''}
              onChangeText={(v) => patchMeta('abcNotation', v)}
              placeholder="X:1 …"
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />

            <Text style={styles.label}>URL скана</Text>
            <TextInput
              style={styles.keyInput}
              value={sheetMeta.sourceImageUrl ?? ''}
              onChangeText={(v) => patchMeta('sourceImageUrl', v)}
              placeholder="/uploads/… или https://…"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.label}>Общие заметки</Text>
            <TextInput
              style={styles.notesEditor}
              value={sheetMeta.generalNotes ?? ''}
              onChangeText={(v) => patchMeta('generalNotes', v)}
              placeholder="Комментарии к партитуре…"
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
            />
          </>
        )}
      </ScrollView>

      <SheetRecognizerModal
        visible={recognizerOpen}
        onClose={() => setRecognizerOpen(false)}
        onApply={applySheetRecognition}
      />
    </KeyboardAvoidingView>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  const border = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.1)';
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
      borderBottomColor: border,
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
    tabs: {
      flexDirection: 'row',
      marginHorizontal: 12,
      marginTop: 10,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      padding: 4,
      gap: 4,
    },
    tab: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 10,
      alignItems: 'center',
    },
    tabActive: {
      backgroundColor: colors.primary,
    },
    tabText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    tabTextActive: {
      color: colors.textOnPrimary,
    },
    aiRow: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: border,
      backgroundColor: colors.surface,
    },
    aiBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: colors.surfaceElevated,
    },
    aiBtnText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
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
      borderColor: border,
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 16,
      color: colors.text,
    },
    metaRow: {
      flexDirection: 'row',
      gap: 10,
    },
    metaHalf: {
      flex: 1,
    },
    editor: {
      minHeight: 320,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 15,
      lineHeight: 22,
      color: colors.text,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    abcEditor: {
      minHeight: 140,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 13,
      lineHeight: 18,
      color: colors.text,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    notesEditor: {
      minHeight: 90,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 15,
      lineHeight: 22,
      color: colors.text,
    },
  });
}
