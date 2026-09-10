import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createMediaPost, createTextPost, type LocalMediaAsset } from '../api/feed';
import { ScreenHeader } from '../components/ScreenHeader';
import type { RootStackParamList } from '../navigation/types';
import { useTheme, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ComposePost'>;

export function ComposePostScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<Nav>();
  const qc = useQueryClient();
  const [caption, setCaption] = useState('');
  const [assets, setAssets] = useState<LocalMediaAsset[]>([]);

  const pickImages = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Нет доступа', 'Разрешите доступ к галерее');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.85,
    });
    if (result.canceled) return;
    const next = result.assets.map((a, i) => ({
      uri: a.uri,
      name: a.fileName ?? `media-${Date.now()}-${i}.${a.type === 'video' ? 'mp4' : 'jpg'}`,
      type: a.mimeType ?? (a.type === 'video' ? 'video/mp4' : 'image/jpeg'),
    }));
    setAssets((prev) => [...prev, ...next].slice(0, 10));
  };

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (assets.length === 0) {
        await createTextPost(caption);
      } else {
        await createMediaPost({ caption, assets });
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
      navigation.goBack();
    },
    onError: (e) => Alert.alert('Ошибка', String(e)),
  });

  const canPublish = caption.trim().length > 0 || assets.length > 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Новая публикация" subtitle="Лента церкви" />
      <ScrollView contentContainerStyle={styles.content}>
        <TextInput
          style={styles.input}
          value={caption}
          onChangeText={setCaption}
          placeholder="Что нового?"
          placeholderTextColor={colors.textMuted}
          multiline
        />

        {assets.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.previewRow}>
            {assets.map((a) => (
              <Image key={a.uri} source={{ uri: a.uri }} style={styles.preview} contentFit="cover" />
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            onPress={() => void pickImages()}
            style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.9 }]}
          >
            <Ionicons name="image-outline" size={20} color={colors.primary} />
            <Text style={styles.secondaryText}>Медиа</Text>
          </Pressable>
          <Pressable
            onPress={() => publishMutation.mutate()}
            disabled={!canPublish || publishMutation.isPending}
            style={({ pressed }) => [
              styles.primaryBtn,
              pressed && { opacity: 0.9 },
              (!canPublish || publishMutation.isPending) && { opacity: 0.5 },
            ]}
          >
            <Text style={styles.primaryText}>
              {publishMutation.isPending ? 'Публикация…' : 'Опубликовать'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    content: { padding: 16, paddingBottom: 40 },
    input: {
      minHeight: 140,
      backgroundColor: colors.surfaceElevated,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.1)',
      padding: 14,
      fontSize: 16,
      color: colors.text,
      textAlignVertical: 'top',
    },
    previewRow: { marginTop: 14 },
    preview: {
      width: 96,
      height: 96,
      borderRadius: 12,
      marginRight: 8,
      backgroundColor: colors.surfaceElevated,
    },
    actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
    secondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.08)',
    },
    secondaryText: { color: colors.primary, fontWeight: '700' },
    primaryBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 12,
    },
    primaryText: { color: colors.textOnPrimary, fontWeight: '800' },
  });
}
