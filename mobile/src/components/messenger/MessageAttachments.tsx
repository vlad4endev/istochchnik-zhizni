import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { MessageWithSender } from '../../api/messenger';
import { buildAttachmentFileUrl } from '../../api/messenger';
import { fetchAttachmentUrl } from '../../api/messengerUpload';
import { formatDurationSec, formatFileSize } from '../../lib/attachments';
import { resolveApiOrigin } from '../../lib/config';
import { getAuthToken } from '../../lib/storage';
import { useTheme } from '../../theme';

type Palette = { fg: string; sub: string; tint: string };

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Список фото сообщения: альбом (`images`) или одиночное фото. */
export function imageCount(payload: Record<string, unknown> | undefined): number {
  if (!payload) return 0;
  const imgs = payload.images;
  if (Array.isArray(imgs) && imgs.length > 0) return imgs.length;
  return str(payload.url) ? 1 : 0;
}

function imageSource(messageId: string, slot: number, multi: boolean) {
  const token = getAuthToken();
  const url = `${resolveApiOrigin()}${buildAttachmentFileUrl(messageId, multi ? { slot } : undefined)}`;
  return { uri: url, headers: token ? { Authorization: `Bearer ${token}` } : undefined };
}

const SCREEN_W = Dimensions.get('window').width;

function ImageGrid({ message }: { message: MessageWithSender }) {
  const [viewerAt, setViewerAt] = useState<number | null>(null);
  const count = imageCount(message.payload);
  const multi = Array.isArray(message.payload?.images) && count > 1;
  const slots = useMemo(() => Array.from({ length: Math.max(count, 1) }, (_, i) => i), [count]);
  if (count === 0) return null;

  const shown = slots.slice(0, 4);
  const extra = count - shown.length;
  const single = count === 1;
  const cell = single ? 240 : 118;

  return (
    <>
      <View style={[styles.grid, { width: single ? 240 : 240 }]}>
        {shown.map((slot, i) => (
          <Pressable
            key={slot}
            onPress={() => setViewerAt(slot)}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Фото ${slot + 1} из ${count}`}
            style={{ width: cell, height: single ? 180 : cell }}
          >
            <Image
              source={imageSource(message.id, slot, multi)}
              style={styles.fill}
              contentFit="cover"
              transition={120}
            />
            {extra > 0 && i === shown.length - 1 ? (
              <View style={styles.more}>
                <Text style={styles.moreText}>+{extra}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
      <Modal
        visible={viewerAt != null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerAt(null)}
      >
        <View style={styles.viewer}>
          <SafeAreaView style={{ flex: 1 }}>
            <Pressable
              onPress={() => setViewerAt(null)}
              accessibilityRole="button"
              accessibilityLabel="Закрыть просмотр"
              style={styles.viewerClose}
            >
              <Ionicons name="close" size={30} color="#fff" />
            </Pressable>
            <FlatList
              data={slots}
              horizontal
              pagingEnabled
              keyExtractor={(s) => String(s)}
              initialScrollIndex={viewerAt ?? 0}
              getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={{ width: SCREEN_W, flex: 1, justifyContent: 'center' }}>
                  <Image
                    source={imageSource(message.id, item, multi)}
                    style={{ width: SCREEN_W, height: '100%' }}
                    contentFit="contain"
                  />
                </View>
              )}
            />
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

/** Открыть файл/видео через временную ссылку: система сама покажет или скачает. */
function useOpenAttachment(messageId: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await Linking.openURL(await fetchAttachmentUrl(messageId));
    } catch {
      setError('Не удалось открыть файл. Проверьте соединение.');
    } finally {
      setBusy(false);
    }
  }, [busy, messageId]);
  return { open, busy, error };
}

function FileCard({
  message,
  palette,
  video,
}: {
  message: MessageWithSender;
  palette: Palette;
  video: boolean;
}) {
  const p = message.payload ?? {};
  const name = str(p.name) || (video ? 'Видео' : 'Файл');
  const size = formatFileSize(num(p.size));
  const duration = num(p.durationSec);
  const { open, busy, error } = useOpenAttachment(message.id);
  return (
    <View>
      <Pressable
        onPress={() => void open()}
        accessibilityRole="button"
        accessibilityLabel={`${video ? 'Открыть видео' : 'Открыть файл'} ${name}`}
        style={styles.fileRow}
      >
        <View style={[styles.fileIcon, { backgroundColor: palette.tint }]}>
          {busy ? (
            <ActivityIndicator color={palette.fg} />
          ) : (
            <Ionicons name={video ? 'play' : 'document-text'} size={24} color={palette.fg} />
          )}
        </View>
        <View style={{ flexShrink: 1 }}>
          <Text style={[styles.fileName, { color: palette.fg }]} numberOfLines={2}>
            {name}
          </Text>
          <Text style={[styles.fileMeta, { color: palette.sub }]}>
            {[video && duration ? formatDurationSec(duration) : '', size].filter(Boolean).join(' · ') ||
              (video ? 'Видео' : 'Файл')}
          </Text>
        </View>
      </Pressable>
      {error ? <Text style={styles.err}>{error}</Text> : null}
    </View>
  );
}

function AudioPlayerRow({
  message,
  palette,
}: {
  message: MessageWithSender;
  palette: Palette;
}) {
  const p = message.payload ?? {};
  const isVoice = str(p.kind) === 'voice';
  const title = isVoice ? 'Голосовое сообщение' : str(p.title) || str(p.name) || 'Аудио';
  const knownDuration = num(p.durationSec);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const [wantPlay, setWantPlay] = useState(false);

  useEffect(() => {
    if (url && wantPlay && status.isLoaded) {
      player.play();
      setWantPlay(false);
    }
  }, [url, wantPlay, status.isLoaded, player]);

  const toggle = async () => {
    if (status.playing) {
      player.pause();
      return;
    }
    if (url) {
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.2)) {
        await player.seekTo(0);
      }
      player.play();
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setUrl(await fetchAttachmentUrl(message.id));
      setWantPlay(true);
    } catch {
      setError('Не удалось загрузить запись.');
    } finally {
      setLoading(false);
    }
  };

  const total = status.duration > 0 ? status.duration : knownDuration;
  const ratio = total > 0 ? Math.min(1, status.currentTime / total) : 0;

  return (
    <View>
      <View style={styles.audioRow}>
        <Pressable
          onPress={() => void toggle()}
          accessibilityRole="button"
          accessibilityLabel={status.playing ? 'Пауза' : 'Воспроизвести'}
          style={[styles.playBtn, { backgroundColor: palette.fg }]}
        >
          {loading ? (
            <ActivityIndicator color={palette.tint} />
          ) : (
            <Ionicons name={status.playing ? 'pause' : 'play'} size={22} color={palette.tint} />
          )}
        </Pressable>
        <View style={{ flex: 1, minWidth: 130 }}>
          <Text style={[styles.audioTitle, { color: palette.fg }]} numberOfLines={1}>
            {title}
          </Text>
          <View style={[styles.track, { backgroundColor: palette.sub + '55' }]}>
            <View style={[styles.trackFill, { width: `${ratio * 100}%`, backgroundColor: palette.fg }]} />
          </View>
          <Text style={[styles.fileMeta, { color: palette.sub }]}>
            {formatDurationSec(status.playing || status.currentTime > 0 ? status.currentTime : total)}
            {total > 0 && (status.playing || status.currentTime > 0) ? ` / ${formatDurationSec(total)}` : ''}
          </Text>
        </View>
      </View>
      {error ? <Text style={styles.err}>{error}</Text> : null}
    </View>
  );
}

/** Вложения сообщения: фото и альбомы, видео, файлы, голосовые и аудио. */
export function MessageAttachments({
  message,
  isOwn,
}: {
  message: MessageWithSender;
  isOwn: boolean;
}) {
  const { colors } = useTheme();
  const palette: Palette = isOwn
    ? { fg: colors.textOnPrimary, sub: 'rgba(255,255,255,0.8)', tint: colors.primary }
    : { fg: colors.text, sub: colors.textSecondary, tint: colors.surfaceElevated };
  const type = message.payload_type ?? 'text';
  if (message.is_deleted) return null;

  if (type === 'image') return <ImageGrid message={message} />;
  if (type === 'audio') return <AudioPlayerRow message={message} palette={palette} />;
  if (type === 'video_note') return <FileCard message={message} palette={palette} video />;
  if (type === 'file') {
    const mime = str(message.payload?.mimeType).toLowerCase();
    const isVideo = mime.startsWith('video/');
    return <FileCard message={message} palette={palette} video={isVideo} />;
  }
  return null;
}

/** Типы сообщений, у которых есть вложение. */
export function hasAttachment(type: string | undefined): boolean {
  return type === 'image' || type === 'audio' || type === 'video_note' || type === 'file';
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, borderRadius: 12, overflow: 'hidden', marginBottom: 4 },
  fill: { width: '100%', height: '100%' },
  more: {
    ...StyleSheet.absoluteFill as object,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  viewerClose: { alignSelf: 'flex-end', width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, maxWidth: 260 },
  fileIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  fileName: { fontSize: 16, fontWeight: '700' },
  fileMeta: { fontSize: 13, marginTop: 2 },
  err: { fontSize: 13, color: '#EF4444', marginTop: 4 },
  audioRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  playBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  audioTitle: { fontSize: 15, fontWeight: '700' },
  track: { height: 4, borderRadius: 2, marginVertical: 6, overflow: 'hidden' },
  trackFill: { height: 4, borderRadius: 2 },
});
