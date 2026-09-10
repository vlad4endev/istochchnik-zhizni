import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
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
  deleteStory,
  markStoryViewed,
  replyToStory,
  type StoryAuthorGroup,
} from '../api/feed';
import { resolvePublicUrl } from '../lib/resolvePublicUrl';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'StoryViewer'>;

const { width } = Dimensions.get('window');
const REACTIONS = ['🙏', '❤️', '🔥', '👏', '😊'];

export function StoryViewerScreen({ route, navigation }: Props) {
  const qc = useQueryClient();
  const { groupIndex, groups: initialGroups } = route.params;
  const [groups, setGroups] = useState<StoryAuthorGroup[]>(initialGroups);
  const [gIdx, setGIdx] = useState(groupIndex);
  const [sIdx, setSIdx] = useState(0);
  const [replyText, setReplyText] = useState('');

  const group: StoryAuthorGroup | undefined = groups[gIdx];
  const story = group?.stories[sIdx];
  const mediaUrl = resolvePublicUrl(story?.media_url);

  const viewMutation = useMutation({
    mutationFn: (id: string) => markStoryViewed(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stories'] });
    },
  });

  const replyMutation = useMutation({
    mutationFn: (body: { text?: string; reaction?: string }) => {
      if (!story) throw new Error('Нет истории');
      return replyToStory(story.id, body);
    },
    onSuccess: (res) => {
      setReplyText('');
      if (res.conversationId) {
        navigation.replace('ChatThread', {
          conversationId: res.conversationId,
          title: group ? authorDisplayName(group.author) : 'Чат',
          isGroup: false,
        });
      } else {
        Alert.alert('Отправлено', 'Ответ ушёл автору в личные сообщения');
      }
    },
    onError: (e) => Alert.alert('Ошибка', String(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!story) throw new Error('Нет истории');
      return deleteStory(story.id);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stories'] });
      const storyId = story?.id;
      if (!storyId || !group) {
        navigation.goBack();
        return;
      }
      const nextGroups = groups
        .map((g, i) => {
          if (i !== gIdx) return g;
          return { ...g, stories: g.stories.filter((s) => s.id !== storyId) };
        })
        .filter((g) => g.stories.length > 0);
      if (nextGroups.length === 0) {
        navigation.goBack();
        return;
      }
      setGroups(nextGroups);
      setGIdx(Math.min(gIdx, nextGroups.length - 1));
      setSIdx(0);
    },
    onError: (e) => Alert.alert('Ошибка', String(e)),
  });

  useEffect(() => {
    if (story?.id && !story.viewed_by_me) {
      viewMutation.mutate(story.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story?.id]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        safe: { flex: 1, backgroundColor: '#0c0a09' },
        media: { width, flex: 1, backgroundColor: '#1c1917' },
        top: {
          position: 'absolute',
          top: 12,
          left: 12,
          right: 12,
          zIndex: 2,
        },
        progressRow: { flexDirection: 'row', gap: 4, marginBottom: 12 },
        bar: {
          flex: 1,
          height: 3,
          borderRadius: 2,
          backgroundColor: 'rgba(255,255,255,0.25)',
        },
        barActive: { backgroundColor: '#fff' },
        header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        name: { color: '#fff', fontWeight: '800', fontSize: 15, flex: 1 },
        headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
        caption: {
          position: 'absolute',
          bottom: 120,
          left: 16,
          right: 16,
          color: '#fff',
          fontSize: 16,
          lineHeight: 22,
          zIndex: 2,
        },
        tapZones: {
          ...StyleSheet.absoluteFill,
          flexDirection: 'row',
          zIndex: 1,
        },
        zone: { flex: 1 },
        bottom: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 3,
          paddingHorizontal: 12,
          paddingBottom: 12,
          gap: 8,
        },
        reactions: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
        reactionBtn: {
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: 'rgba(255,255,255,0.12)',
          alignItems: 'center',
          justifyContent: 'center',
        },
        reactionText: { fontSize: 20 },
        composer: {
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 8,
          backgroundColor: 'rgba(28,25,23,0.85)',
          borderRadius: 16,
          padding: 8,
        },
        input: {
          flex: 1,
          maxHeight: 90,
          color: '#fff',
          paddingHorizontal: 10,
          paddingVertical: 8,
          fontSize: 15,
        },
        sendBtn: {
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: '#7d3640',
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [],
  );

  if (!group || !story) {
    return (
      <SafeAreaView style={styles.safe}>
        <Pressable onPress={() => navigation.goBack()} style={{ padding: 24 }}>
          <Text style={{ color: '#fff' }}>Закрыть</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const goNext = () => {
    if (sIdx + 1 < group.stories.length) {
      setSIdx(sIdx + 1);
      return;
    }
    if (gIdx + 1 < groups.length) {
      setGIdx(gIdx + 1);
      setSIdx(0);
      return;
    }
    navigation.goBack();
  };

  const goPrev = () => {
    if (sIdx > 0) {
      setSIdx(sIdx - 1);
      return;
    }
    if (gIdx > 0) {
      const prevGroup = groups[gIdx - 1]!;
      setGIdx(gIdx - 1);
      setSIdx(Math.max(0, prevGroup.stories.length - 1));
    }
  };

  const onDelete = () => {
    Alert.alert('Удалить историю?', 'Это действие нельзя отменить', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {mediaUrl ? (
          <Image source={{ uri: mediaUrl }} style={styles.media} contentFit="contain" />
        ) : (
          <View style={[styles.media, { alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="image-outline" size={48} color="#a8a29e" />
          </View>
        )}

        <View style={styles.top}>
          <View style={styles.progressRow}>
            {group.stories.map((s, i) => (
              <View key={s.id} style={[styles.bar, i <= sIdx && styles.barActive]} />
            ))}
          </View>
          <View style={styles.header}>
            <Text style={styles.name} numberOfLines={1}>
              {authorDisplayName(group.author)}
            </Text>
            <View style={styles.headerActions}>
              {group.is_me ? (
                <Pressable onPress={onDelete} hitSlop={12}>
                  <Ionicons name="trash-outline" size={24} color="#fecaca" />
                </Pressable>
              ) : null}
              <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
                <Ionicons name="close" size={28} color="#fff" />
              </Pressable>
            </View>
          </View>
        </View>

        {story.caption ? <Text style={styles.caption}>{story.caption}</Text> : null}

        <View style={styles.tapZones} pointerEvents="box-none">
          <Pressable style={styles.zone} onPress={goPrev} />
          <Pressable style={styles.zone} onPress={goNext} />
        </View>

        {!group.is_me ? (
          <View style={styles.bottom}>
            <View style={styles.reactions}>
              {REACTIONS.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => replyMutation.mutate({ reaction: r })}
                  disabled={replyMutation.isPending}
                  style={({ pressed }) => [styles.reactionBtn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.reactionText}>{r}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.composer}>
              <TextInput
                style={styles.input}
                value={replyText}
                onChangeText={setReplyText}
                placeholder="Ответить…"
                placeholderTextColor="rgba(255,255,255,0.45)"
                multiline
              />
              <Pressable
                onPress={() => replyMutation.mutate({ text: replyText })}
                disabled={replyMutation.isPending || !replyText.trim()}
                style={({ pressed }) => [
                  styles.sendBtn,
                  pressed && { opacity: 0.9 },
                  (!replyText.trim() || replyMutation.isPending) && { opacity: 0.45 },
                ]}
              >
                <Ionicons name="send" size={16} color="#fff" />
              </Pressable>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
