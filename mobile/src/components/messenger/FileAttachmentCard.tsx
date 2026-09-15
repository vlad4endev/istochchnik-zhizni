import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { resolveApiOrigin } from '../../lib/config';
import { getAuthToken } from '../../lib/storage';
import { MessengerText } from './MessengerText';
import { useTheme } from '../../theme';

interface FileAttachmentCardProps {
  messageId: string;
  fileName: string;
  fileSize?: number | null;
  mimeType?: string | null;
  isOwn: boolean;
  isPending?: boolean;
  caption?: string;
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, '_').trim();
  return cleaned.slice(0, 120) || `file-${Date.now()}`;
}

export function FileAttachmentCard({
  messageId,
  fileName,
  fileSize,
  mimeType,
  isOwn,
  isPending = false,
  caption,
}: FileAttachmentCardProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors, isOwn), [colors, isOwn]);
  const [busy, setBusy] = useState(false);

  const openFile = async () => {
    if (isPending || busy) return;
    if (!/^\d+$/.test(String(messageId))) {
      Alert.alert('Файл', 'Сообщение ещё отправляется');
      return;
    }
    const token = getAuthToken();
    if (!token) {
      Alert.alert('Ошибка', 'Нет авторизации');
      return;
    }
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) {
      Alert.alert('Ошибка', 'Открытие файлов недоступно на этом устройстве');
      return;
    }

    setBusy(true);
    try {
      const path = `/api/messenger/messages/${encodeURIComponent(messageId)}/attachment-file?download=1`;
      const url = `${resolveApiOrigin()}${path}`;
      const dest = `${FileSystem.cacheDirectory}${safeFileName(fileName)}`;
      const result = await FileSystem.downloadAsync(url, dest, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (result.status && result.status >= 400) {
        throw new Error('Не удалось скачать файл');
      }
      await Sharing.shareAsync(result.uri, {
        mimeType: mimeType || undefined,
        dialogTitle: fileName,
      });
    } catch (e) {
      Alert.alert('Файл', e instanceof Error ? e.message : 'Не удалось открыть файл');
    } finally {
      setBusy(false);
    }
  };

  const sizeLabel = typeof fileSize === 'number' ? formatBytes(fileSize) : '';

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => void openFile()}
        disabled={isPending || busy}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.88 }]}
      >
        <View style={styles.iconWrap}>
          {busy || isPending ? (
            <ActivityIndicator size="small" color={isOwn ? colors.textOnPrimary : colors.primary} />
          ) : (
            <Ionicons
              name="document-text-outline"
              size={22}
              color={isOwn ? colors.textOnPrimary : colors.primary}
            />
          )}
        </View>
        <View style={styles.meta}>
          <MessengerText numberOfLines={2} style={styles.name}>
            {fileName || 'Файл'}
          </MessengerText>
          {sizeLabel ? (
            <MessengerText bidiSafe={false} style={styles.size}>
              {sizeLabel}
            </MessengerText>
          ) : null}
        </View>
        <Ionicons
          name="download-outline"
          size={18}
          color={isOwn ? 'rgba(255,255,255,0.85)' : colors.textMuted}
        />
      </Pressable>
      {caption ? <MessengerText style={styles.caption}>{caption}</MessengerText> : null}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isOwn: boolean) {
  return StyleSheet.create({
    wrap: {
      gap: 6,
      minWidth: 200,
      maxWidth: 280,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isOwn ? 'rgba(255,255,255,0.18)' : 'rgba(139,26,26,0.1)',
    },
    meta: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontSize: 14,
      fontWeight: '700',
      color: isOwn ? colors.textOnPrimary : colors.text,
    },
    size: {
      fontSize: 11,
      marginTop: 2,
      color: isOwn ? 'rgba(255,255,255,0.75)' : colors.textMuted,
    },
    caption: {
      fontSize: 15,
      lineHeight: 20,
      color: isOwn ? colors.textOnPrimary : colors.text,
    },
  });
}
