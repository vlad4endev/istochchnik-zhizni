import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
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

import {
  fetchMe,
  fetchProfileByUsername,
  patchMyProfile,
  patchPublicProfileSettings,
  uploadMyAvatar,
} from '../api/profile';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { ScreenHeader } from '../components/ScreenHeader';
import { resolvePublicUrl } from '../lib/resolvePublicUrl';
import { useAuthStore } from '../stores/authStore';
import { useTheme, type ThemeColors } from '../theme';

export function ProfileEditScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const qc = useQueryClient();
  const username = useAuthStore((s) => s.username);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const applyServerProfile = useAuthStore((s) => s.applyServerProfile);
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles);
  const registrationStatus = useAuthStore((s) => s.registrationStatus);
  const memberId = useAuthStore((s) => s.memberId);

  const meQuery = useQuery({ queryKey: ['me'], queryFn: fetchMe });
  const publicQuery = useQuery({
    queryKey: ['profile', username, 'edit'],
    queryFn: () => fetchProfileByUsername(username),
    enabled: Boolean(username),
  });

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (meQuery.data) {
      setFirstName(meQuery.data.first_name ?? '');
      setLastName(meQuery.data.last_name ?? '');
      setEmail(meQuery.data.email ?? '');
    }
  }, [meQuery.data]);

  useEffect(() => {
    if (publicQuery.data?.profile) {
      setDisplayName(publicQuery.data.profile.display_name ?? '');
      setBio(publicQuery.data.profile.bio ?? '');
    }
  }, [publicQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const me = await patchMyProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim() || null,
      });
      await patchPublicProfileSettings({
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
      });
      applyServerProfile({
        firstName: me.first_name ?? firstName.trim(),
        lastName: me.last_name ?? lastName.trim(),
        role,
        roles,
        registrationStatus,
        username: me.username ?? username,
        memberId: me.id ?? memberId,
      });
      await refreshProfile();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
      Alert.alert('Сохранено', 'Профиль обновлён');
    },
    onError: (e) => Alert.alert('Ошибка', String(e)),
  });

  const avatarMutation = useMutation({
    mutationFn: async () => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) throw new Error('Нет доступа к галерее');
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.85,
      });
      if (picked.canceled || !picked.assets[0]) return null;
      const asset = picked.assets[0];
      const name = asset.fileName ?? `avatar-${Date.now()}.jpg`;
      const type = asset.mimeType ?? 'image/jpeg';
      return uploadMyAvatar({ uri: asset.uri, name, type });
    },
    onSuccess: (data) => {
      if (!data) return;
      void qc.invalidateQueries({ queryKey: ['me'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
      Alert.alert('Готово', 'Аватар обновлён');
    },
    onError: (e) => Alert.alert('Ошибка', String(e)),
  });

  if (meQuery.isLoading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Редактирование" />
        <LoadingView />
      </SafeAreaView>
    );
  }

  if (meQuery.isError) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Редактирование" />
        <ErrorView message={String(meQuery.error)} onRetry={() => void meQuery.refetch()} />
      </SafeAreaView>
    );
  }

  const avatarUrl = resolvePublicUrl(
    publicQuery.data?.profile.avatar_url ?? meQuery.data?.avatar_url,
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Редактирование" subtitle="Профиль и аватар" />
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => avatarMutation.mutate()}
          style={({ pressed }) => [styles.avatarWrap, pressed && { opacity: 0.9 }]}
        >
          <View style={styles.avatar}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <Ionicons name="person" size={36} color={colors.textOnPrimary} />
            )}
          </View>
          <Text style={styles.avatarHint}>
            {avatarMutation.isPending ? 'Загрузка…' : 'Сменить фото'}
          </Text>
        </Pressable>

        <Field label="Имя" value={firstName} onChangeText={setFirstName} styles={styles} />
        <Field label="Фамилия" value={lastName} onChangeText={setLastName} styles={styles} />
        <Field
          label="Отображаемое имя"
          value={displayName}
          onChangeText={setDisplayName}
          styles={styles}
        />
        <Field label="Email" value={email} onChangeText={setEmail} styles={styles} keyboardType="email-address" />
        <Field
          label="О себе"
          value={bio}
          onChangeText={setBio}
          styles={styles}
          multiline
        />

        <Pressable
          onPress={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          style={({ pressed }) => [
            styles.saveBtn,
            pressed && { opacity: 0.9 },
            saveMutation.isPending && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.saveText}>
            {saveMutation.isPending ? 'Сохранение…' : 'Сохранить'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  styles,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  styles: ReturnType<typeof createStyles>;
  multiline?: boolean;
  keyboardType?: 'default' | 'email-address';
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'}
      />
    </View>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    content: { padding: 16, paddingBottom: 40 },
    avatarWrap: { alignItems: 'center', marginBottom: 20, gap: 8 },
    avatar: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarImg: { width: 88, height: 88 },
    avatarHint: { fontSize: 14, fontWeight: '700', color: colors.primary },
    label: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
      marginBottom: 6,
    },
    input: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.1)',
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
    },
    inputMultiline: { minHeight: 100, textAlignVertical: 'top' },
    saveBtn: {
      marginTop: 8,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    saveText: { color: colors.textOnPrimary, fontWeight: '800', fontSize: 16 },
  });
}
