import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  patchSetlistItemMusicianNotes,
  type SetlistItemRow,
} from '../../api/studio';
import {
  emptyMusicianNotes,
  notesFromItem,
  type MusicianNotesV1,
} from '../../lib/performNotes';
import { useTheme, type ThemeColors } from '../../theme';

type LineRow = { line: number; text: string };
type BlockRow = { from: number; to: number; text: string };

function toLineRows(n: MusicianNotesV1): LineRow[] {
  const o = n.lineComments ?? {};
  return Object.keys(o)
    .map((k) => ({ line: Number(k), text: o[k] ?? '' }))
    .filter((r) => Number.isInteger(r.line) && r.line >= 0 && r.text.trim())
    .sort((a, b) => a.line - b.line);
}

function fromLineRows(rows: LineRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const t = r.text.trim();
    if (!t || !Number.isInteger(r.line) || r.line < 0) continue;
    out[String(r.line)] = t;
  }
  return out;
}

interface SetlistMusicianNotesEditorProps {
  visible: boolean;
  setlistId: number;
  item: SetlistItemRow | null;
  onClose: () => void;
}

export function SetlistMusicianNotesEditor({
  visible,
  setlistId,
  item,
  onClose,
}: SetlistMusicianNotesEditorProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [lines, setLines] = useState<LineRow[]>([]);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);

  useEffect(() => {
    if (!visible || !item) return;
    const n = notesFromItem(item.musician_notes);
    setLines(toLineRows(n));
    setBlocks(n.blockComments?.map((b) => ({ ...b })) ?? []);
  }, [visible, item]);

  const lineCount = Math.max(
    1,
    (item?.effective_content || item?.song.content || '').split('\n').length,
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!item) return;
      const lineComments = fromLineRows(lines);
      const blockComments = blocks
        .map((b) => ({
          from: Math.min(b.from, b.to),
          to: Math.max(b.from, b.to),
          text: b.text.trim(),
        }))
        .filter(
          (b) =>
            b.text &&
            Number.isInteger(b.from) &&
            Number.isInteger(b.to) &&
            b.from >= 0 &&
            b.to >= b.from,
        );
      const payload: MusicianNotesV1 =
        Object.keys(lineComments).length === 0 && blockComments.length === 0
          ? emptyMusicianNotes()
          : {
              v: 1,
              ...(Object.keys(lineComments).length ? { lineComments } : {}),
              ...(blockComments.length ? { blockComments } : {}),
            };
      await patchSetlistItemMusicianNotes(setlistId, Number(item.id), payload);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['studio', 'setlist', setlistId, 'items'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'perform', setlistId] });
      Alert.alert('Готово', 'Заметки сохранены');
      onClose();
    },
    onError: () => Alert.alert('Ошибка', 'Не удалось сохранить заметки'),
  });

  const clearMut = useMutation({
    mutationFn: async () => {
      if (!item) return;
      await patchSetlistItemMusicianNotes(setlistId, Number(item.id), emptyMusicianNotes());
    },
    onSuccess: () => {
      setLines([]);
      setBlocks([]);
      void qc.invalidateQueries({ queryKey: ['studio', 'setlist', setlistId, 'items'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'perform', setlistId] });
      Alert.alert('Готово', 'Заметки удалены');
    },
    onError: () => Alert.alert('Ошибка', 'Не удалось очистить заметки'),
  });

  const busy = saveMut.isPending || clearMut.isPending;
  const title = item?.song.title ?? 'Заметки';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.safe, { paddingTop: insets.top || 12, paddingBottom: insets.bottom || 12 }]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} disabled={busy} hitSlop={10}>
            <Text style={styles.close}>Закрыть</Text>
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Заметки
          </Text>
          <Pressable
            onPress={() => saveMut.mutate()}
            disabled={busy || !item}
            hitSlop={10}
          >
            {saveMut.isPending ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.save}>Сохранить</Text>
            )}
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.songTitle}>{title}</Text>
          <Text style={styles.hint}>
            Видны в режиме выступления. Номера строк как в тексте (первая = 1).
          </Text>

          <Text style={styles.section}>К строке</Text>
          {lines.map((row, idx) => (
            <View key={`l-${idx}`} style={styles.noteCard}>
              <View style={styles.noteTop}>
                <Text style={styles.fieldLabel}>Стр.</Text>
                <TextInput
                  style={styles.numInput}
                  keyboardType="number-pad"
                  value={String(row.line + 1)}
                  onChangeText={(v) => {
                    const display = Math.max(1, Math.min(lineCount, Number(v) || 1));
                    const next = [...lines];
                    next[idx] = { ...row, line: display - 1 };
                    setLines(next);
                  }}
                />
                <Pressable
                  onPress={() => setLines(lines.filter((_, j) => j !== idx))}
                  hitSlop={8}
                  style={styles.trash}
                >
                  <Ionicons name="trash-outline" size={18} color="#dc2626" />
                </Pressable>
              </View>
              <TextInput
                style={styles.textArea}
                multiline
                value={row.text}
                onChangeText={(text) => {
                  const next = [...lines];
                  next[idx] = { ...row, text };
                  setLines(next);
                }}
                placeholder="Напр.: rit., повтор 2×…"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          ))}
          <Pressable
            onPress={() => setLines([...lines, { line: 0, text: '' }])}
            style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
          >
            <Ionicons name="add" size={18} color={colors.primary} />
            <Text style={styles.addBtnText}>Добавить к строке</Text>
          </Pressable>

          <Text style={styles.section}>К блоку строк</Text>
          {blocks.map((row, idx) => (
            <View key={`b-${idx}`} style={styles.noteCard}>
              <View style={styles.noteTop}>
                <Text style={styles.fieldLabel}>С</Text>
                <TextInput
                  style={styles.numInput}
                  keyboardType="number-pad"
                  value={String(row.from + 1)}
                  onChangeText={(v) => {
                    const from = Math.max(0, Math.min(lineCount - 1, (Number(v) || 1) - 1));
                    const next = [...blocks];
                    next[idx] = { ...row, from, to: Math.max(from, row.to) };
                    setBlocks(next);
                  }}
                />
                <Text style={styles.fieldLabel}>по</Text>
                <TextInput
                  style={styles.numInput}
                  keyboardType="number-pad"
                  value={String(row.to + 1)}
                  onChangeText={(v) => {
                    const to = Math.max(row.from, Math.min(lineCount - 1, (Number(v) || 1) - 1));
                    const next = [...blocks];
                    next[idx] = { ...row, to };
                    setBlocks(next);
                  }}
                />
                <Pressable
                  onPress={() => setBlocks(blocks.filter((_, j) => j !== idx))}
                  hitSlop={8}
                  style={styles.trash}
                >
                  <Ionicons name="trash-outline" size={18} color="#dc2626" />
                </Pressable>
              </View>
              <TextInput
                style={styles.textArea}
                multiline
                value={row.text}
                onChangeText={(text) => {
                  const next = [...blocks];
                  next[idx] = { ...row, text };
                  setBlocks(next);
                }}
                placeholder="Напр.: весь припев — удвоить бэк…"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          ))}
          <Pressable
            onPress={() => setBlocks([...blocks, { from: 0, to: 0, text: '' }])}
            style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
          >
            <Ionicons name="add" size={18} color={colors.primary} />
            <Text style={styles.addBtnText}>Добавить блок</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              Alert.alert('Очистить заметки?', undefined, [
                { text: 'Отмена', style: 'cancel' },
                {
                  text: 'Очистить',
                  style: 'destructive',
                  onPress: () => clearMut.mutate(),
                },
              ]);
            }}
            disabled={busy}
            style={({ pressed }) => [styles.clearBtn, pressed && styles.pressed]}
          >
            <Text style={styles.clearBtnText}>
              {clearMut.isPending ? 'Очищаем…' : 'Очистить всё'}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(28,25,23,0.08)';
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: border,
      gap: 12,
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    close: {
      color: colors.textSecondary,
      fontWeight: '600',
      fontSize: 15,
      minWidth: 70,
    },
    save: {
      color: colors.primary,
      fontWeight: '700',
      fontSize: 15,
      minWidth: 70,
      textAlign: 'right',
    },
    content: {
      padding: 16,
      gap: 10,
      paddingBottom: 40,
    },
    songTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    hint: {
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 16,
      marginBottom: 4,
    },
    section: {
      marginTop: 8,
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    noteCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      padding: 10,
      gap: 8,
    },
    noteTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    fieldLabel: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: '600',
    },
    numInput: {
      width: 52,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 6,
      fontSize: 15,
      color: colors.text,
      textAlign: 'center',
      backgroundColor: colors.surface,
    },
    trash: {
      marginLeft: 'auto',
      padding: 4,
    },
    textArea: {
      minHeight: 64,
      borderWidth: 1,
      borderColor: border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 15,
      color: colors.text,
      textAlignVertical: 'top',
      backgroundColor: colors.surface,
    },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 10,
      backgroundColor: colors.surfaceElevated,
    },
    addBtnText: {
      color: colors.primary,
      fontWeight: '700',
      fontSize: 13,
    },
    clearBtn: {
      marginTop: 12,
      alignItems: 'center',
      paddingVertical: 12,
    },
    clearBtnText: {
      color: '#dc2626',
      fontWeight: '600',
      fontSize: 14,
    },
    pressed: {
      opacity: 0.75,
    },
  });
}
