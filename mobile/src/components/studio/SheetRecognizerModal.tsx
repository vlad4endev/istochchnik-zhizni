import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { aiRecognizeSheetMusic } from '../../api/songs';
import type { RecognizedSong } from '../../lib/sheetMusicTypes';
import { useTheme, type ThemeColors } from '../../theme';

interface SheetRecognizerModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (data: RecognizedSong) => void | Promise<void>;
}

type Status = 'idle' | 'loading' | 'done' | 'error';

export function SheetRecognizerModal({
  visible,
  onClose,
  onApply,
}: SheetRecognizerModalProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<RecognizedSong | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const reset = () => {
    setStatus('idle');
    setResult(null);
    setError(null);
    setPreview(null);
    setApplying(false);
  };

  const handleClose = () => {
    if (status === 'loading' || applying) return;
    reset();
    onClose();
  };

  const recognizeAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    const uri = asset.uri;
    const name = asset.fileName || `sheet-${Date.now()}.jpg`;
    const type = asset.mimeType || 'image/jpeg';
    setPreview(uri);
    setStatus('loading');
    setError(null);
    setResult(null);
    try {
      const data = await aiRecognizeSheetMusic({ uri, name, type });
      setResult({
        ...data,
        sections: Array.isArray(data.sections) ? data.sections : [],
        generalNotes: data.generalNotes ?? '',
      });
      setStatus('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сервера');
      setStatus('error');
    }
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Нет доступа к галерее');
      setStatus('error');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (picked.canceled || !picked.assets[0]) return;
    await recognizeAsset(picked.assets[0]);
  };

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Нет доступа к камере');
      setStatus('error');
      return;
    }
    const picked = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (picked.canceled || !picked.assets[0]) return;
    await recognizeAsset(picked.assets[0]);
  };

  const apply = async () => {
    if (!result || applying) return;
    setApplying(true);
    try {
      await onApply(result);
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось применить');
      setStatus('error');
      setApplying(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={[styles.safe, { paddingTop: insets.top || 12, paddingBottom: insets.bottom || 12 }]}>
        <View style={styles.header}>
          <Pressable onPress={handleClose} disabled={status === 'loading' || applying} hitSlop={10}>
            <Text style={styles.close}>Закрыть</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Распознать ноты</Text>
          <View style={{ width: 70 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {status === 'idle' && !preview ? (
            <View style={styles.idle}>
              <Ionicons name="camera-outline" size={48} color={colors.primary} />
              <Text style={styles.idleTitle}>Сфотографируйте партитуру</Text>
              <Text style={styles.idleHint}>JPEG, PNG, WebP · распознавание может занять до 3 минут</Text>
              <View style={styles.pickRow}>
                <Pressable
                  onPress={() => void pickFromCamera()}
                  style={({ pressed }) => [styles.pickBtn, pressed && styles.pressed]}
                >
                  <Ionicons name="camera" size={18} color={colors.textOnPrimary} />
                  <Text style={styles.pickBtnText}>Камера</Text>
                </Pressable>
                <Pressable
                  onPress={() => void pickFromLibrary()}
                  style={({ pressed }) => [styles.pickBtnSecondary, pressed && styles.pressed]}
                >
                  <Ionicons name="images-outline" size={18} color={colors.primary} />
                  <Text style={styles.pickBtnSecondaryText}>Галерея</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {preview ? (
            <View style={styles.previewWrap}>
              <Image source={{ uri: preview }} style={styles.preview} contentFit="cover" />
              {status !== 'loading' ? (
                <Pressable onPress={reset} style={styles.resetFab} hitSlop={8}>
                  <Ionicons name="close" size={18} color="#fff" />
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {status === 'loading' ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.loadingTitle}>Анализирую партитуру…</Text>
                <Text style={styles.loadingHint}>Тональность, аккорды, структура</Text>
              </View>
            </View>
          ) : null}

          {status === 'error' && error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>Не удалось распознать</Text>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={reset} style={styles.retry}>
                <Text style={styles.retryText}>Попробовать другое фото</Text>
              </Pressable>
            </View>
          ) : null}

          {status === 'done' && result ? (
            <View style={styles.resultBox}>
              <Text style={styles.resultTitle}>
                {result.title?.trim() || 'Партитура распознана'}
              </Text>
              <Text style={styles.resultMeta}>
                {[
                  result.key ? `Тон. ${result.key}` : null,
                  result.bpm != null ? `${result.bpm} BPM` : null,
                  result.timeSignature || null,
                  result.sections?.length ? `${result.sections.length} секц.` : null,
                  result.abcNotation?.trim() ? 'ABC' : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Готово к применению'}
              </Text>
              {result.sections?.slice(0, 6).map((s, i) => (
                <Text key={`${s.label}-${i}`} style={styles.sectionLine} numberOfLines={2}>
                  {s.label}
                  {s.chords?.length ? ` — ${s.chords.join(', ')}` : ''}
                </Text>
              ))}
              <Pressable
                onPress={() => void apply()}
                disabled={applying}
                style={({ pressed }) => [styles.applyBtn, pressed && styles.pressed]}
              >
                {applying ? (
                  <ActivityIndicator color={colors.textOnPrimary} />
                ) : (
                  <Text style={styles.applyBtnText}>Применить к нотной версии</Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  const border = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.1)';
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: border,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    close: {
      color: colors.textSecondary,
      fontWeight: '600',
      minWidth: 70,
    },
    content: {
      padding: 16,
      gap: 14,
      paddingBottom: 40,
    },
    idle: {
      alignItems: 'center',
      gap: 10,
      paddingVertical: 32,
      paddingHorizontal: 16,
      borderRadius: 16,
      borderWidth: 2,
      borderStyle: 'dashed',
      borderColor: border,
      backgroundColor: colors.surfaceElevated,
    },
    idleTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    idleHint: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'center',
      marginBottom: 8,
    },
    pickRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },
    pickBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 12,
    },
    pickBtnText: {
      color: colors.textOnPrimary,
      fontWeight: '700',
    },
    pickBtnSecondary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: border,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 12,
    },
    pickBtnSecondaryText: {
      color: colors.primary,
      fontWeight: '700',
    },
    previewWrap: {
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: border,
      position: 'relative',
    },
    preview: {
      width: '100%',
      height: 200,
      backgroundColor: colors.surfaceElevated,
    },
    resetFab: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingBox: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
      padding: 14,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
    },
    loadingTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    loadingHint: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    errorBox: {
      padding: 14,
      borderRadius: 12,
      backgroundColor: '#fef2f2',
      gap: 6,
    },
    errorTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: '#b91c1c',
    },
    errorText: {
      fontSize: 13,
      color: '#dc2626',
    },
    retry: {
      marginTop: 4,
    },
    retryText: {
      fontSize: 13,
      color: '#b91c1c',
      fontWeight: '600',
      textDecorationLine: 'underline',
    },
    resultBox: {
      padding: 14,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: border,
      gap: 8,
    },
    resultTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    resultMeta: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    sectionLine: {
      fontSize: 13,
      color: colors.textMuted,
    },
    applyBtn: {
      marginTop: 8,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    applyBtnText: {
      color: colors.textOnPrimary,
      fontWeight: '800',
      fontSize: 14,
    },
    pressed: {
      opacity: 0.8,
    },
  });
}
