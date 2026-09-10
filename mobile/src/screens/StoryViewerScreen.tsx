import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authorDisplayName, markStoryViewed, type StoryAuthorGroup } from '../api/feed';
import { resolvePublicUrl } from '../lib/resolvePublicUrl';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'StoryViewer'>;

const { width } = Dimensions.get('window');

export function StoryViewerScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const { groupIndex, groups } = route.params;
  const [gIdx, setGIdx] = useState(groupIndex);
  const [sIdx, setSIdx] = useState(0);

  const group: StoryAuthorGroup | undefined = groups[gIdx];
  const story = group?.stories[sIdx];
  const mediaUrl = resolvePublicUrl(story?.media_url);

  const viewMutation = useMutation({
    mutationFn: (id: string) => markStoryViewed(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stories'] });
    },
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
        name: { color: '#fff', fontWeight: '800', fontSize: 15 },
        caption: {
          position: 'absolute',
          bottom: 40,
          left: 16,
          right: 16,
          color: '#fff',
          fontSize: 16,
          lineHeight: 22,
        },
        tapZones: {
          ...StyleSheet.absoluteFill,
          flexDirection: 'row',
        },
        zone: { flex: 1 },
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

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
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
          <Text style={styles.name}>{authorDisplayName(group.author)}</Text>
          <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
        </View>
      </View>

      {story.caption ? <Text style={styles.caption}>{story.caption}</Text> : null}

      <View style={styles.tapZones}>
        <Pressable style={styles.zone} onPress={goPrev} />
        <Pressable style={styles.zone} onPress={goNext} />
      </View>
    </SafeAreaView>
  );
}
