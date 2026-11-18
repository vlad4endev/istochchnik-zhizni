import { Ionicons } from '@expo/vector-icons';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
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

import { formatApiError } from '../api/client';
import { fetchMessages, type MessageWithSender } from '../api/messenger';
import { fetchAttachmentUrl } from '../api/messengerUpload';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { attachmentImageSource } from '../components/messenger/MessageAttachments';
import { formatFileSize } from '../lib/attachments';
import { extractSharedMedia, type SharedPhoto } from '../lib/chatManage';
import type { RootStackParamList } from '../navigation/types';
import { useTheme, type ThemeColors } from '../theme';

const PAGE_SIZE = 50;
/** Сколько страниц истории просматриваем (≈400 последних сообщений), как на вебе. */
const MAX_PAGES = 8;
const SCREEN_W = Dimensions.get('window').width;
const GAP = 3;
const CELL = Math.floor((SCREEN_W - GAP * 4) / 3);

type Tab = 'media' | 'files' | 'links';

async function loadHistory(conversationId: string): Promise<MessageWithSender[]> {
  const acc: MessageWithSender[] = [];
  let before: string | undefined;
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const page = await fetchMessages(conversationId, { beforeId: before, limit: PAGE_SIZE });
    if (page.length === 0) break;
    acc.push(...page);
    if (page.length < PAGE_SIZE) break;
    before = String(page[0]?.id ?? '');
    if (!before) break;
  }
  return acc;
}

/** Общие фото и видео, файлы и ссылки чата — из последних сообщений. */
export function ChatMediaScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { conversationId } = useRoute<RouteProp<RootStackParamList, 'ChatMedia'>>().params;
  const [tab, setTab] = useState<Tab>('media');
  const [viewerAt, setViewerAt] = useState<number | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const history = useQuery({
    queryKey: ['messenger', 'shared-media', conversationId],
    queryFn: () => loadHistory(conversationId),
    staleTime: 60_000,
  });

  const shared = useMemo(() => extractSharedMedia(history.data ?? []), [history.data]);

  const openFile = async (messageId: string) => {
    setOpeningId(messageId);
    setOpenError(null);
    try {
      await Linking.openURL(await fetchAttachmentUrl(messageId));
    } catch {
      setOpenError('Не удалось открыть файл. Проверьте соединение.');
    } finally {
      setOpeningId(null);
    }
  };

  if (history.isPending) return <LoadingView label="Загружаем медиа…" />;
  if (history.isError) {
    return <ErrorView message={formatApiError(history.error)} onRetry={() => void history.refetch()} />;
  }

  const tabs: Array<{ id: Tab; label: string; icon: keyof typeof Ionicons.glyphMap; n: number }> = [
    { id: 'media', label: 'Фото', icon: 'image-outline', n: shared.photos.length },
    { id: 'files', label: 'Файлы', icon: 'document-outline', n: shared.files.length },
    { id: 'links', label: 'Ссылки', icon: 'link-outline', n: shared.links.length },
  ];

  return (
    <View style={styles.safe}>
      <View style={styles.tabs}>
        {tabs.map((t) => {
          const on = tab === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setTab(t.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={[styles.tab, on && styles.tabOn]}
            >
              <Ionicons name={t.icon} size={18} color={on ? colors.textOnPrimary : colors.text} />
              <Text style={[styles.tabText, on && { color: colors.textOnPrimary }]}>
                {t.label} {t.n}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {openError ? <Text style={styles.error}>{openError}</Text> : null}

      {tab === 'media' ? (
        <FlatList
          key="grid"
          data={shared.photos}
          numColumns={3}
          keyExtractor={(p, i) => `${p.messageId}-${p.slot}-${i}`}
          contentContainerStyle={{ padding: GAP }}
          columnWrapperStyle={{ gap: GAP, marginBottom: GAP }}
          ListEmptyComponent={<Text style={styles.empty}>В этом чате пока нет фото.</Text>}
          renderItem={({ item, index }) => (
            <Pressable
              onPress={() => setViewerAt(index)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Фото ${index + 1} из ${shared.photos.length}`}
            >
              <Image
                source={attachmentImageSource(item.messageId, item.slot, item.multi)}
                style={{ width: CELL, height: CELL, backgroundColor: colors.surfaceElevated }}
                contentFit="cover"
                recyclingKey={`${item.messageId}-${item.slot}`}
              />
            </Pressable>
          )}
        />
      ) : null}

      {tab === 'files' ? (
        <FlatList
          key="files"
          data={shared.files}
          keyExtractor={(f, i) => `${f.messageId}-${i}`}
          ListEmptyComponent={<Text style={styles.empty}>Файлов пока нет.</Text>}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => void openFile(item.messageId)}
              accessibilityRole="button"
              accessibilityLabel={`Открыть ${item.name}`}
              style={({ pressed }) => [styles.fileRow, pressed && { backgroundColor: colors.primary + '10' }]}
            >
              <View style={styles.fileIcon}>
                {openingId === item.messageId ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Ionicons name={item.video ? 'videocam' : 'document-text'} size={24} color={colors.primary} />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.fileName} numberOfLines={2}>
                  {item.name}
                </Text>
                {item.size > 0 ? <Text style={styles.fileSize}>{formatFileSize(item.size)}</Text> : null}
              </View>
            </Pressable>
          )}
        />
      ) : null}

      {tab === 'links' ? (
        <FlatList
          key="links"
          data={shared.links}
          keyExtractor={(l, i) => `${l.messageId}-${i}`}
          ListEmptyComponent={<Text style={styles.empty}>Ссылок пока нет.</Text>}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => void Linking.openURL(item.url)}
              accessibilityRole="link"
              style={({ pressed }) => [styles.fileRow, pressed && { backgroundColor: colors.primary + '10' }]}
            >
              <View style={styles.fileIcon}>
                <Ionicons name="link" size={22} color={colors.primary} />
              </View>
              <Text style={[styles.fileName, { color: colors.primary, flex: 1 }]} numberOfLines={2}>
                {item.url}
              </Text>
            </Pressable>
          )}
        />
      ) : null}

      <PhotoViewer photos={shared.photos} startAt={viewerAt} onClose={() => setViewerAt(null)} />
    </View>
  );
}

function PhotoViewer({
  photos,
  startAt,
  onClose,
}: {
  photos: SharedPhoto[];
  startAt: number | null;
  onClose: () => void;
}) {
  return (
    <Modal visible={startAt != null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' }}>
        <SafeAreaView style={{ flex: 1 }}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Закрыть просмотр"
            style={{ alignSelf: 'flex-end', width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="close" size={30} color="#fff" />
          </Pressable>
          {startAt != null ? (
            <FlatList
              data={photos}
              horizontal
              pagingEnabled
              initialScrollIndex={startAt}
              keyExtractor={(p, i) => `${p.messageId}-${p.slot}-${i}`}
              getItemLayout={(_, index) => ({ length: SCREEN_W, offset: SCREEN_W * index, index })}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={{ width: SCREEN_W, flex: 1, justifyContent: 'center' }}>
                  <Image
                    source={attachmentImageSource(item.messageId, item.slot, item.multi)}
                    style={{ width: SCREEN_W, height: '100%' }}
                    contentFit="contain"
                  />
                </View>
              )}
            />
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    tabs: { flexDirection: 'row', gap: 8, padding: 12 },
    tab: {
      flex: 1,
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: 14,
      backgroundColor: colors.surfaceElevated,
    },
    tabOn: { backgroundColor: colors.primary },
    tabText: { fontSize: 15, fontWeight: '700', color: colors.text },
    empty: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', padding: 32 },
    error: { fontSize: 14, color: '#B42318', paddingHorizontal: 16, paddingBottom: 6 },
    fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 68 },
    fileIcon: {
      width: 46,
      height: 46,
      borderRadius: 14,
      backgroundColor: colors.primary + '17',
      alignItems: 'center',
      justifyContent: 'center',
    },
    fileName: { fontSize: 16, fontWeight: '600', color: colors.text },
    fileSize: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  });
}
