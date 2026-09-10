import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useMemo } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchActiveBroadcast, fetchBroadcastHistory, type BroadcastData } from '../api/broadcast';
import { ErrorView } from '../components/ErrorView';
import { LoadingView } from '../components/LoadingView';
import { ScreenHeader } from '../components/ScreenHeader';
import { useTheme, type ThemeColors } from '../theme';

const PLATFORM_LABEL: Record<BroadcastData['platform'], string> = {
  youtube: 'YouTube',
  rutube: 'Rutube',
  vk: 'VK',
  other: 'Стрим',
};

const STATUS_LABEL: Record<BroadcastData['status'], string> = {
  live: 'В эфире',
  scheduled: 'Запланировано',
  finished: 'Запись',
};

export function BroadcastScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const activeQuery = useQuery({
    queryKey: ['broadcast', 'active'],
    queryFn: fetchActiveBroadcast,
  });
  const historyQuery = useQuery({
    queryKey: ['broadcast', 'history'],
    queryFn: () => fetchBroadcastHistory(30),
  });

  const refreshing = activeQuery.isFetching || historyQuery.isFetching;
  const onRefresh = () => {
    void activeQuery.refetch();
    void historyQuery.refetch();
  };

  if ((activeQuery.isLoading || historyQuery.isLoading) && !activeQuery.data && !historyQuery.data) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Трансляция" subtitle="Прямой эфир и записи" />
        <LoadingView />
      </SafeAreaView>
    );
  }

  if (activeQuery.isError && historyQuery.isError) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScreenHeader title="Трансляция" subtitle="Прямой эфир и записи" />
        <ErrorView message={String(activeQuery.error)} onRetry={onRefresh} />
      </SafeAreaView>
    );
  }

  const active = activeQuery.data;
  const history = historyQuery.data ?? [];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <ScreenHeader title="Трансляция" subtitle="Прямой эфир и записи" />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.section}>Сейчас</Text>
        {active ? (
          <BroadcastCard item={active} colors={colors} highlight />
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="tv-outline" size={28} color={colors.textMuted} />
            <Text style={styles.emptyText}>Сейчас нет активной трансляции</Text>
          </View>
        )}

        <Text style={[styles.section, { marginTop: 20 }]}>История</Text>
        {history.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Записей пока нет</Text>
          </View>
        ) : (
          history.map((item) => (
            <BroadcastCard key={item.id} item={item} colors={colors} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function BroadcastCard({
  item,
  colors,
  highlight,
}: {
  item: BroadcastData;
  colors: ThemeColors;
  highlight?: boolean;
}) {
  const openStream = () => {
    if (item.stream_url) void Linking.openURL(item.stream_url);
  };

  return (
    <View
      style={{
        backgroundColor: colors.surfaceElevated,
        borderRadius: colors.radius,
        padding: 16,
        marginBottom: 10,
        borderWidth: highlight ? 2 : 1,
        borderColor: highlight ? colors.primary : 'rgba(28,25,23,0.06)',
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>
          {STATUS_LABEL[item.status]} · {PLATFORM_LABEL[item.platform]}
        </Text>
        {item.starts_at ? (
          <Text style={{ fontSize: 12, color: colors.textMuted }}>
            {format(parseISO(item.starts_at), 'd MMM, HH:mm', { locale: ru })}
          </Text>
        ) : null}
      </View>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>
        {item.title?.trim() || 'Трансляция'}
      </Text>
      {item.description ? (
        <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 6, lineHeight: 20 }}>
          {item.description}
        </Text>
      ) : null}
      {item.stream_url ? (
        <Pressable
          onPress={openStream}
          style={({ pressed }) => [
            {
              marginTop: 14,
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: colors.primary,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 10,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
        >
          <Ionicons name="play" size={16} color={colors.textOnPrimary} />
          <Text style={{ color: colors.textOnPrimary, fontWeight: '700' }}>Смотреть</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    content: { padding: 16, paddingBottom: 40 },
    section: {
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      color: colors.textMuted,
      marginBottom: 8,
    },
    emptyCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: colors.radius,
      padding: 24,
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: 'rgba(28,25,23,0.06)',
    },
    emptyText: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
  });
}
