import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchBibleBooks, fetchBibleChapter } from '../api/bible';
import { ScreenHeader } from '../components/ScreenHeader';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function BibleHomeScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<Nav>();
  const booksQ = useQuery({
    queryKey: ['bible', 'books'],
    queryFn: () => fetchBibleBooks('synodal'),
  });

  const nt = (booksQ.data ?? []).filter((b) => b.testament === 'nt');
  const ot = (booksQ.data ?? []).filter((b) => b.testament === 'ot');

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Библия" subtitle="Синодальный перевод" />
      <ScrollView contentContainerStyle={styles.content}>
        {booksQ.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
        {nt.length > 0 ? <Text style={styles.section}>Новый Завет</Text> : null}
        {nt.map((b) => (
          <Pressable
            key={b.slug}
            style={styles.row}
            onPress={() =>
              navigation.navigate('BibleReader', {
                translation: 'synodal',
                book: b.slug,
                chapter: 1,
                title: `${b.short_name} 1`,
              })
            }
          >
            <Text style={styles.rowTitle}>{b.short_name}</Text>
            <Text style={styles.rowSub}>{b.name}</Text>
          </Pressable>
        ))}
        {ot.length > 0 ? <Text style={styles.section}>Ветхий Завет</Text> : null}
        {ot.map((b) => (
          <Pressable
            key={b.slug}
            style={styles.row}
            onPress={() =>
              navigation.navigate('BibleReader', {
                translation: 'synodal',
                book: b.slug,
                chapter: 1,
                title: `${b.short_name} 1`,
              })
            }
          >
            <Text style={styles.rowTitle}>{b.short_name}</Text>
            <Text style={styles.rowSub}>{b.name}</Text>
          </Pressable>
        ))}
        {!booksQ.isLoading && (booksQ.data ?? []).length === 0 ? (
          <Text style={styles.empty}>Текст ещё не загружен на сервере (npm run bible:seed).</Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

export function BibleReaderScreen({
  route,
}: {
  route: {
    params: { translation: string; book: string; chapter: number; title?: string; verse?: number };
  };
}) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { translation, book, chapter, verse } = route.params;
  const [currentChapter, setCurrentChapter] = useState(chapter);

  const chapterQ = useQuery({
    queryKey: ['bible', 'chapter', translation, book, currentChapter],
    queryFn: () => fetchBibleChapter(translation, book, currentChapter),
  });

  const maxChapter = chapterQ.data?.book.chapters_count ?? currentChapter;

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <View style={styles.navRow}>
        <Pressable
          disabled={currentChapter <= 1}
          onPress={() => setCurrentChapter((c) => Math.max(1, c - 1))}
          style={[styles.navBtn, currentChapter <= 1 && { opacity: 0.3 }]}
        >
          <Text style={styles.navBtnText}>←</Text>
        </Pressable>
        <Text style={styles.navTitle}>
          {chapterQ.data?.book.short_name ?? book} {currentChapter}
        </Text>
        <Pressable
          disabled={currentChapter >= maxChapter}
          onPress={() => setCurrentChapter((c) => Math.min(maxChapter, c + 1))}
          style={[styles.navBtn, currentChapter >= maxChapter && { opacity: 0.3 }]}
        >
          <Text style={styles.navBtnText}>→</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.readerContent}>
        {chapterQ.isLoading ? <ActivityIndicator color={colors.primary} /> : null}
        {(chapterQ.data?.verses ?? []).map((v) => (
          <Text
            key={v.verse}
            style={[styles.verse, verse === v.verse && styles.verseActive]}
          >
            <Text style={styles.verseNum}>{v.verse} </Text>
            {v.text}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(
  colors: ReturnType<typeof useTheme>['colors'],
  _isDark: boolean,
) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    content: { padding: 16, paddingBottom: 40, gap: 8 },
    section: {
      marginTop: 12,
      marginBottom: 4,
      fontSize: 12,
      fontWeight: '800',
      color: colors.textMuted,
      textTransform: 'uppercase',
    },
    row: {
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: colors.surfaceElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    rowTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
    rowSub: { marginTop: 2, fontSize: 12, color: colors.textMuted },
    empty: { marginTop: 20, fontSize: 14, color: colors.textMuted },
    navRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    navBtn: { padding: 8 },
    navBtnText: { fontSize: 20, color: colors.primary, fontWeight: '700' },
    navTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
    readerContent: { padding: 16, paddingBottom: 48 },
    verse: {
      fontSize: 17,
      lineHeight: 28,
      color: colors.text,
      marginBottom: 6,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 8,
    },
    verseActive: { backgroundColor: 'rgba(251, 191, 36, 0.25)' },
    verseNum: { fontSize: 12, fontWeight: '800', color: colors.primary },
  });
}
