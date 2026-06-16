import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
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

import { fetchMe } from '../api/profile';
import { resolveApiOrigin } from '../lib/config';
import { roleLabelRu } from '../lib/roleLabels';
import { getApiBaseUrl, setApiBaseUrl } from '../lib/storage';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { useAuthDisplayName, useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { ScreenHeader } from '../components/ScreenHeader';
import { useMediaScheduleAccess } from '../hooks/useMediaScheduleAccess';
import { useServicePlannerAccess } from '../hooks/useServicePlannerAccess';
import { useStudioAccess } from '../hooks/useStudioAccess';
import { useTheme } from '../theme';
import type { AppSettings } from '../types';

type SettingsNav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Settings'>,
  NativeStackNavigationProp<RootStackParamList>
>;

const SCHEME_OPTIONS: { value: AppSettings['colorScheme']; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'system', label: 'Как в системе', icon: 'phone-portrait-outline' },
  { value: 'light', label: 'Светлая', icon: 'sunny-outline' },
  { value: 'dark', label: 'Тёмная', icon: 'moon-outline' },
];

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export function SettingsScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<SettingsNav>();
  const displayName = useAuthDisplayName();
  const role = useAuthStore((s) => s.role);
  const username = useAuthStore((s) => s.username);
  const logout = useAuthStore((s) => s.logout);
  const refreshProfile = useAuthStore((s) => s.refreshProfile);
  const { canView: canViewMediaSchedule } = useMediaScheduleAccess();
  const { canView: canViewServicePlanner } = useServicePlannerAccess();
  const { canView: canViewStudio } = useStudioAccess();

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: fetchMe,
  });

  const phone = meQuery.data?.phone_number?.trim() ?? '';

  const [apiUrl, setApiUrl] = useState(getApiBaseUrl());
  const scheme = useSettingsStore((s) => s.colorScheme);
  const setScheme = useSettingsStore((s) => s.setColorScheme);
  const [apiSaved, setApiSaved] = useState(false);

  const saveApiUrl = () => {
    setApiBaseUrl(apiUrl.trim());
    setApiSaved(true);
    setTimeout(() => setApiSaved(false), 2000);
  };

  const onLogout = () => {
    Alert.alert('Выход', 'Выйти из аккаунта?', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: () => void logout(),
      },
    ]);
  };

  const refreshAll = () => {
    void refreshProfile();
    void meQuery.refetch();
  };

  const initials = useMemo(() => {
    const parts = displayName.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
    }
    return (displayName[0] ?? '?').toUpperCase();
  }, [displayName]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Ещё" subtitle="Профиль и настройки приложения" />

      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={refreshAll}
          style={({ pressed }) => [styles.profileCard, pressed && { opacity: 0.92 }]}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.profileMeta}>
            <Text style={styles.profileName}>{displayName || 'Участник'}</Text>
            <Text style={styles.profileRole}>{roleLabelRu(role)}</Text>
            {username ? <Text style={styles.profileSub}>@{username}</Text> : null}
            {phone ? <Text style={styles.profileSub}>{phone}</Text> : null}
          </View>
          <Ionicons name="refresh-outline" size={20} color={colors.textMuted} />
        </Pressable>

        <SectionLabel title="Разделы" />
        <View style={styles.card}>
          <MenuRow
            icon="calendar-outline"
            label="События церкви"
            subtitle="Расписание на ближайшие недели"
            onPress={() => navigation.navigate('Events')}
            colors={colors}
          />
          <Divider />
          <MenuRow
            icon="mic-outline"
            label="Проповеди"
            subtitle="Аудио подкасты"
            onPress={() => navigation.navigate('Sermons')}
            colors={colors}
          />
          {canViewMediaSchedule ? (
            <>
              <Divider />
              <MenuRow
                icon="videocam-outline"
                label="Расписание медиа"
                subtitle="Моё расписание и команда"
                onPress={() => navigation.navigate('MediaSchedule')}
                colors={colors}
              />
            </>
          ) : null}
          {canViewServicePlanner ? (
            <>
              <Divider />
              <MenuRow
                icon="calendar-outline"
                label="Служение"
                subtitle="Планировщик собраний"
                onPress={() => navigation.navigate('ServicePlanner')}
                colors={colors}
              />
            </>
          ) : null}
          {canViewStudio ? (
            <>
              <Divider />
              <MenuRow
                icon="disc-outline"
                label="Студия"
                subtitle="Сетлисты и версии песен"
                onPress={() => navigation.navigate('Studio')}
                colors={colors}
              />
            </>
          ) : null}
        </View>

        <SectionLabel title="Подключение" />
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Адрес API</Text>
          <TextInput
            style={styles.input}
            value={apiUrl}
            onChangeText={setApiUrl}
            placeholder={resolveApiOrigin()}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={styles.hint}>
            Сейчас используется:{' '}
            <Text style={styles.hintMono}>{resolveApiOrigin()}</Text>
          </Text>
          <Text style={styles.hint}>
            На реальном устройстве укажите IP компьютера в локальной сети, например
            {' '}http://192.168.1.5:40978
          </Text>
          <Pressable
            onPress={saveApiUrl}
            style={({ pressed }) => [styles.inlineSaveBtn, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.inlineSaveText}>
              {apiSaved ? 'Сохранено ✓' : 'Сохранить адрес'}
            </Text>
          </Pressable>
        </View>

        <SectionLabel title="Оформление" />
        <View style={styles.card}>
          {SCHEME_OPTIONS.map((opt, index) => (
            <View key={opt.value}>
              {index > 0 ? <Divider /> : null}
              <Pressable
                onPress={() => setScheme(opt.value)}
                style={({ pressed }) => [styles.schemeRow, pressed && { opacity: 0.85 }]}
              >
                <View style={styles.schemeLeft}>
                  <Ionicons name={opt.icon} size={20} color={colors.primary} />
                  <Text style={styles.schemeLabel}>{opt.label}</Text>
                </View>
                {scheme === opt.value ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                ) : (
                  <Ionicons name="ellipse-outline" size={22} color={colors.textMuted} />
                )}
              </Pressable>
            </View>
          ))}
        </View>

        <Pressable
          onPress={onLogout}
          style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.9 }]}
        >
          <Ionicons name="log-out-outline" size={20} color="#b91c1c" />
          <Text style={styles.logoutText}>Выйти из аккаунта</Text>
        </Pressable>

        <Text style={styles.version}>
          Источник жизни · v{APP_VERSION} · {isDark ? 'тёмная' : 'светлая'} тема
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionLabel({ title }: { title: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        color: colors.textMuted,
        marginTop: 16,
        marginBottom: 6,
        marginLeft: 4,
      }}
    >
      {title}
    </Text>
  );
}

function Divider() {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: 'rgba(28,25,23,0.06)',
        marginVertical: 4,
      }}
    />
  );
}

function MenuRow({
  icon,
  label,
  subtitle,
  onPress,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ paddingVertical: 10 }, pressed && { opacity: 0.85 }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: `${colors.primary}12`,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>{label}</Text>
          {subtitle ? (
            <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{subtitle}</Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      padding: 16,
      paddingBottom: 40,
    },
    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      padding: 18,
      marginBottom: 4,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.06)',
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: colors.textOnPrimary,
      fontSize: 20,
      fontWeight: '800',
    },
    profileMeta: {
      flex: 1,
      gap: 2,
    },
    profileName: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
    },
    profileRole: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    profileSub: {
      fontSize: 13,
      color: colors.textMuted,
    },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      padding: 16,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.06)',
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
      marginBottom: 8,
    },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.1)',
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
    },
    hint: {
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 18,
      marginTop: 8,
    },
    hintMono: {
      fontFamily: undefined,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    inlineSaveBtn: {
      alignSelf: 'flex-start',
      marginTop: 12,
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
    },
    inlineSaveText: {
      color: colors.textOnPrimary,
      fontWeight: '700',
      fontSize: 14,
    },
    schemeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
    },
    schemeLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    schemeLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    logoutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 28,
      paddingVertical: 15,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(248,113,113,0.35)' : '#fecaca',
      backgroundColor: isDark ? 'rgba(127,29,29,0.2)' : '#fef2f2',
    },
    logoutText: {
      color: '#b91c1c',
      fontWeight: '800',
      fontSize: 16,
    },
    version: {
      textAlign: 'center',
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 24,
    },
  });
}
