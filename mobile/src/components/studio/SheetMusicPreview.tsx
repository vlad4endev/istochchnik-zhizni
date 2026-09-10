import { Image } from 'expo-image';
import { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import type { StudioSheetMeta } from '../../api/studio';
import { resolvePublicUrl } from '../../lib/resolvePublicUrl';
import { useTheme, type ThemeColors } from '../../theme';

interface SheetMusicPreviewProps {
  sheetMeta?: StudioSheetMeta | null;
  sheetKey?: string | null;
  songTitle?: string | null;
  fallbackContent?: string | null;
  compact?: boolean;
}

export function hasSheetMusic(input: {
  sheet_content?: string | null;
  sheet_meta?: StudioSheetMeta | null;
}): boolean {
  const content = input.sheet_content?.trim();
  const meta = input.sheet_meta;
  return Boolean(
    content ||
      meta?.abcNotation?.trim() ||
      meta?.sourceImageUrl?.trim(),
  );
}

export function SheetMusicPreview({
  sheetMeta,
  sheetKey,
  songTitle,
  fallbackContent,
  compact = false,
}: SheetMusicPreviewProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark, compact), [colors, isDark, compact]);

  const title = sheetMeta?.title?.trim() || songTitle?.trim() || '';
  const composer = sheetMeta?.composer?.trim() || '';
  const arranger = sheetMeta?.arranger?.trim() || '';
  const bpm = sheetMeta?.bpm;
  const timeSig = sheetMeta?.timeSignature?.trim() || '';
  const keyLabel = sheetKey?.trim() || '';
  const abc = sheetMeta?.abcNotation?.trim() || '';
  const imageUrl = resolvePublicUrl(sheetMeta?.sourceImageUrl ?? null);
  const fallback = fallbackContent?.trim() || '';
  const notes = sheetMeta?.generalNotes?.trim() || '';

  const metaBits = [
    keyLabel ? `Тональность ${keyLabel}` : null,
    bpm != null ? `${bpm} BPM` : null,
    timeSig || null,
  ].filter(Boolean);

  return (
    <View style={styles.wrap}>
      {title || composer || arranger || metaBits.length > 0 ? (
        <View style={styles.header}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {composer ? <Text style={styles.meta}>Композитор: {composer}</Text> : null}
          {arranger ? <Text style={styles.meta}>Аранжировка: {arranger}</Text> : null}
          {metaBits.length > 0 ? (
            <Text style={styles.chips}>{metaBits.join(' · ')}</Text>
          ) : null}
        </View>
      ) : null}

      {abc ? (
        <View style={styles.block}>
          <Text style={styles.blockLabel}>ABC</Text>
          <Text style={styles.mono} selectable>
            {abc}
          </Text>
        </View>
      ) : null}

      {imageUrl ? (
        <View style={styles.block}>
          <Text style={styles.blockLabel}>Скан / фото</Text>
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            contentFit="contain"
          />
        </View>
      ) : null}

      {!abc && !imageUrl && fallback ? (
        <View style={styles.block}>
          <Text style={styles.blockLabel}>ChordPro / текст нот</Text>
          <Text style={styles.mono} selectable>
            {fallback}
          </Text>
        </View>
      ) : null}

      {!abc && !imageUrl && !fallback ? (
        <Text style={styles.empty}>Нотная версия пока пустая</Text>
      ) : null}

      {notes ? (
        <View style={styles.notes}>
          <Text style={styles.blockLabel}>Заметки</Text>
          <Text style={styles.notesText}>{notes}</Text>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean, compact: boolean) {
  const border = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.1)';
  return StyleSheet.create({
    wrap: {
      gap: 12,
    },
    header: {
      gap: 4,
    },
    title: {
      fontSize: compact ? 16 : 18,
      fontWeight: '700',
      color: colors.text,
    },
    meta: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    chips: {
      marginTop: 4,
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
    block: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: border,
      backgroundColor: colors.surfaceElevated,
      padding: 12,
      gap: 8,
    },
    blockLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    mono: {
      fontSize: compact ? 12 : 13,
      lineHeight: compact ? 18 : 20,
      color: colors.text,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    },
    image: {
      width: '100%',
      height: compact ? 180 : 280,
      borderRadius: 8,
      backgroundColor: colors.surface,
    },
    empty: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: 'center',
      paddingVertical: 16,
    },
    notes: {
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
      padding: 12,
      gap: 6,
      borderWidth: 1,
      borderColor: border,
    },
    notesText: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
    },
  });
}
