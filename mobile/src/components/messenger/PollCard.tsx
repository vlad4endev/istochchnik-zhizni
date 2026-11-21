import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatApiError } from '../../api/client';
import { fetchPollVoters, votePoll, type MessageWithSender } from '../../api/messenger';
import { parsePoll, votePercent, votesWord, voterPreviewLine } from '../../lib/polls';
import { resolvePublicUrl } from '../../lib/resolvePublicUrl';
import { useTheme } from '../../theme';
import { ChatAvatar } from './ChatAvatar';

type Props = { message: MessageWithSender; isOwn: boolean };

/** Опрос внутри сообщения: выбор ответа, результаты с процентами, список проголосовавших. */
export function PollCard({ message, isOwn }: Props) {
  const { colors } = useTheme();
  const poll = useMemo(() => parsePoll(message), [message]);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [multiEdit, setMultiEdit] = useState(false);
  const [pick, setPick] = useState<Set<number>>(() => new Set());
  const [votersOpen, setVotersOpen] = useState(false);

  const optimistic = !/^\d+$/.test(message.id);
  const hasVote = (poll?.mine.size ?? 0) > 0;
  const showMultiPicker = !!poll && !optimistic && poll.allowsMultiple && (!hasVote || multiEdit);
  const showSinglePicker = !!poll && !optimistic && !poll.allowsMultiple && !hasVote;
  const showResults = !!poll && !optimistic && !showMultiPicker && !showSinglePicker;

  const voters = useQuery({
    queryKey: ['messenger', 'poll-voters', message.id, poll?.tallies.join(',')],
    queryFn: () => fetchPollVoters(message.id),
    enabled: showResults && !poll?.anonymous,
    staleTime: 30_000,
  });

  if (!poll) return null;

  const fg = isOwn ? colors.textOnPrimary : colors.text;
  const sub = isOwn ? 'rgba(255,255,255,0.8)' : colors.textSecondary;
  const accent = isOwn ? colors.textOnPrimary : colors.primary;
  const onAccent = isOwn ? colors.primary : colors.textOnPrimary;
  const track = isOwn ? 'rgba(255,255,255,0.16)' : colors.primary + '14';
  const trackPicked = isOwn ? 'rgba(255,255,255,0.32)' : colors.primary + '30';

  const vote = async (indexes: number[]) => {
    if (voting) return;
    setVoting(true);
    setError(null);
    try {
      await votePoll(message.id, indexes);
      setMultiEdit(false);
    } catch (e) {
      setError(`Не удалось проголосовать: ${formatApiError(e)}`);
    } finally {
      setVoting(false);
    }
  };

  const Mark = ({ on, square }: { on: boolean; square: boolean }) => (
    <View
      style={[
        styles.mark,
        square ? styles.markSquare : styles.markRound,
        { borderColor: on ? accent : sub },
        on && { backgroundColor: accent },
      ]}
    >
      {on ? <Ionicons name="checkmark" size={14} color={onAccent} /> : null}
    </View>
  );

  const byOption = new Map((voters.data?.options ?? []).map((o) => [o.index, o.voters]));
  const canSeeVoters = !poll.anonymous && showResults && poll.total > 0;

  return (
    <View style={styles.wrap} accessibilityLabel={`Опрос: ${poll.question}`}>
      <Text style={[styles.question, { color: fg }]}>{poll.question || '—'}</Text>
      <Text style={[styles.kind, { color: sub }]}>
        {poll.anonymous ? 'Анонимный опрос' : 'Опрос'}
        {poll.allowsMultiple ? ' · несколько ответов' : ''}
      </Text>

      {poll.options.map((label, i) => {
        const text = label || `Вариант ${i + 1}`;
        const picked = poll.mine.has(i);
        if (!showResults) {
          const checked = showMultiPicker ? pick.has(i) : false;
          return (
            <Pressable
              key={i}
              disabled={optimistic || voting}
              onPress={() => {
                if (showMultiPicker) {
                  setPick((prev) => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    return next;
                  });
                } else void vote([i]);
              }}
              accessibilityRole={showMultiPicker ? 'checkbox' : 'radio'}
              accessibilityState={{ checked, disabled: optimistic || voting }}
              accessibilityLabel={text}
              style={({ pressed }) => [styles.option, pressed && { opacity: 0.7 }]}
            >
              <Mark on={checked} square={poll.allowsMultiple} />
              <Text style={[styles.optionText, { color: fg }]}>{text}</Text>
            </Pressable>
          );
        }
        const count = poll.tallies[i] ?? 0;
        const pct = votePercent(count, poll.total);
        const vs = byOption.get(i) ?? [];
        return (
          <Pressable
            key={i}
            disabled={poll.allowsMultiple || voting}
            onPress={() => void vote([i])}
            accessibilityRole="button"
            accessibilityLabel={`${text}: ${pct}%, ${votesWord(count)}${picked ? ', ваш голос' : ''}`}
            style={styles.result}
          >
            <View style={[styles.bar, { backgroundColor: picked ? trackPicked : track, width: `${pct}%` }]} />
            <View style={styles.resultRow}>
              <Mark on={picked} square={poll.allowsMultiple} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.optionText, { color: fg }]}>{text}</Text>
                {!poll.anonymous && vs.length > 0 ? (
                  <Text style={[styles.voters, { color: sub }]} numberOfLines={1}>
                    {voterPreviewLine(vs)}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.pct, { color: fg }]}>{pct}%</Text>
            </View>
          </Pressable>
        );
      })}

      {showMultiPicker ? (
        <View style={styles.actions}>
          {hasVote && multiEdit ? (
            <Pressable onPress={() => setMultiEdit(false)} accessibilityRole="button" style={styles.ghost}>
              <Text style={[styles.ghostText, { color: sub }]}>Отмена</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => void vote([...pick].sort((a, b) => a - b))}
            disabled={pick.size === 0 || voting}
            accessibilityRole="button"
            style={[styles.cta, { backgroundColor: accent }, (pick.size === 0 || voting) && { opacity: 0.45 }]}
          >
            {voting ? (
              <ActivityIndicator size="small" color={onAccent} />
            ) : (
              <Text style={[styles.ctaText, { color: onAccent }]}>{hasVote ? 'Сохранить' : 'Голосовать'}</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      <Pressable
        disabled={!canSeeVoters}
        onPress={() => setVotersOpen(true)}
        accessibilityRole={canSeeVoters ? 'button' : undefined}
        accessibilityLabel={canSeeVoters ? 'Кто проголосовал' : undefined}
        style={styles.footer}
      >
        <Text style={[styles.total, { color: sub }]}>
          {votesWord(poll.total)}
          {canSeeVoters ? ' · кто проголосовал' : ''}
        </Text>
      </Pressable>

      {showResults && poll.allowsMultiple && hasVote ? (
        <Pressable
          onPress={() => {
            setPick(new Set(poll.mine));
            setMultiEdit(true);
          }}
          accessibilityRole="button"
          style={styles.ghost}
        >
          <Text style={[styles.ghostText, { color: accent }]}>Изменить голос</Text>
        </Pressable>
      ) : null}
      {showResults && hasVote ? (
        <Pressable
          onPress={() => void vote([])}
          disabled={voting}
          accessibilityRole="button"
          style={styles.ghost}
        >
          <Text style={[styles.ghostText, { color: sub }]}>Отменить голос</Text>
        </Pressable>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <VotersSheet
        visible={votersOpen}
        onClose={() => setVotersOpen(false)}
        options={poll.options}
        data={voters.data?.options ?? []}
        loading={voters.isPending}
        error={voters.isError ? formatApiError(voters.error) : null}
      />
    </View>
  );
}

function VotersSheet({
  visible,
  onClose,
  options,
  data,
  loading,
  error,
}: {
  visible: boolean;
  onClose: () => void;
  options: string[];
  data: Array<{ index: number; voters: Array<{ member_id: number; display_name: string; avatar_url: string | null }> }>;
  loading: boolean;
  error: string | null;
}) {
  const { colors } = useTheme();
  const sections = data
    .filter((o) => o.voters.length > 0)
    .map((o) => ({
      title: `${options[o.index] || `Вариант ${o.index + 1}`} · ${votesWord(o.voters.length)}`,
      data: o.voters,
    }));
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}>
          <Text style={{ flex: 1, fontSize: 20, fontWeight: '800', color: colors.text }}>Кто проголосовал</Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            style={{ minHeight: 48, justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.primary }}>Закрыть</Text>
          </Pressable>
        </View>
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={{ padding: 24, fontSize: 16, color: '#B42318' }}>{error}</Text>
        ) : sections.length === 0 ? (
          <Text style={{ padding: 24, fontSize: 16, color: colors.textSecondary }}>Пока никто не проголосовал.</Text>
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={(v, i) => `${v.member_id}-${i}`}
            renderSectionHeader={({ section }) => (
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '800',
                  color: colors.textSecondary,
                  paddingHorizontal: 16,
                  paddingTop: 16,
                  paddingBottom: 6,
                  backgroundColor: colors.surface,
                }}
              >
                {section.title}
              </Text>
            )}
            renderItem={({ item }) => (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 60 }}>
                <ChatAvatar
                  name={item.display_name}
                  imageUrl={resolvePublicUrl(item.avatar_url)}
                  seed={String(item.member_id)}
                  size={42}
                />
                <Text style={{ flex: 1, fontSize: 17, fontWeight: '600', color: colors.text }}>{item.display_name}</Text>
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { minWidth: 250, maxWidth: 300, gap: 4 },
  question: { fontSize: 17, fontWeight: '800', lineHeight: 24 },
  kind: { fontSize: 13, marginBottom: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingVertical: 4 },
  optionText: { flexShrink: 1, fontSize: 16, lineHeight: 22 },
  mark: { width: 22, height: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  markRound: { borderRadius: 11 },
  markSquare: { borderRadius: 6 },
  result: { minHeight: 48, borderRadius: 10, overflow: 'hidden', justifyContent: 'center', marginVertical: 2 },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 10 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 6 },
  voters: { fontSize: 13, marginTop: 1 },
  pct: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
  cta: { minHeight: 44, minWidth: 124, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  ctaText: { fontSize: 15, fontWeight: '800' },
  ghost: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, alignSelf: 'flex-start' },
  ghostText: { fontSize: 15, fontWeight: '700' },
  footer: { minHeight: 36, justifyContent: 'center' },
  total: { fontSize: 14 },
  error: { fontSize: 13, color: '#EF4444' },
});
