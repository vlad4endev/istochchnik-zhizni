import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  fetchDispatchPreview,
  fetchDispatchRecipients,
  fetchDispatchSettings,
  fetchTelegramBotEnabled,
  humanizeTelegramError,
  patchDispatchSettings,
  runDispatchNow,
  testTelegramBot,
  type DispatchSettings,
} from '../../api/prayerAdmin';
import { useTheme, type ThemeColors } from '../../theme';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const EMPTY: DispatchSettings = {
  enabled: false,
  kind: 'daily',
  time_hhmm: '09:00',
  once_at_local: null,
  target: 'all',
  member_ids: [],
  server_timezone: 'UTC',
  last_sent_label: null,
};

type Props = { visible: boolean; onClose: () => void; dateYmd: string };

/** Рассылка молитвы в Telegram (только админ): предпросмотр, расписание, получатели, отправка сейчас. */
export function TelegramDispatchModal({ visible, onClose, dateYmd }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const qc = useQueryClient();
  const [form, setForm] = useState<DispatchSettings>(EMPTY);
  const [onceDate, setOnceDate] = useState('');
  const [onceTime, setOnceTime] = useState('');
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);

  const preview = useQuery({
    queryKey: ['prayer', 'telegram', 'preview', dateYmd],
    queryFn: () => fetchDispatchPreview(dateYmd),
    enabled: visible,
  });
  const settings = useQuery({
    queryKey: ['prayer', 'telegram', 'settings'],
    queryFn: fetchDispatchSettings,
    enabled: visible,
  });
  const recipients = useQuery({
    queryKey: ['prayer', 'telegram', 'recipients'],
    queryFn: fetchDispatchRecipients,
    enabled: visible,
  });
  const botEnabled = useQuery({
    queryKey: ['prayer', 'telegram', 'bot-enabled'],
    queryFn: fetchTelegramBotEnabled,
    enabled: visible,
  });

  useEffect(() => {
    if (!settings.data) return;
    setForm(settings.data);
    const [d, t] = (settings.data.once_at_local ?? '').split('T');
    setOnceDate(d ?? '');
    setOnceTime(t?.slice(0, 5) ?? '');
  }, [settings.data]);

  const validation = useMemo(() => {
    if (form.kind === 'daily' && !TIME_RE.test(form.time_hhmm ?? '')) {
      return 'Время укажите в формате ЧЧ:ММ, например 09:00.';
    }
    if (form.kind === 'once') {
      if (!DATE_RE.test(onceDate)) return 'Дату укажите в формате ГГГГ-ММ-ДД.';
      if (!TIME_RE.test(onceTime)) return 'Время укажите в формате ЧЧ:ММ.';
    }
    if (form.target === 'selected' && form.member_ids.length === 0) {
      return 'Выберите хотя бы одного получателя.';
    }
    return null;
  }, [form, onceDate, onceTime]);

  const saveMut = useMutation({
    mutationFn: () =>
      patchDispatchSettings({
        enabled: form.enabled,
        kind: form.kind,
        time_hhmm: form.time_hhmm,
        target: form.target,
        member_ids: form.member_ids,
        once_at_local: form.kind === 'once' ? `${onceDate}T${onceTime}` : null,
      }),
    onSuccess: (next) => {
      setForm(next);
      setNote({ text: 'Настройки рассылки сохранены.', error: false });
      void qc.invalidateQueries({ queryKey: ['prayer', 'telegram', 'settings'] });
    },
    onError: (e) =>
      setNote({ text: humanizeTelegramError(e, 'Не удалось сохранить настройки.'), error: true }),
  });

  const runMut = useMutation({
    mutationFn: () => runDispatchNow(dateYmd),
    onSuccess: (r) => {
      setNote({ text: `Рассылка отправлена: ${r.sent_count}.`, error: false });
      void qc.invalidateQueries({ queryKey: ['prayer', 'telegram', 'settings'] });
    },
    onError: (e) =>
      setNote({ text: humanizeTelegramError(e, 'Не удалось запустить рассылку.'), error: true }),
  });

  const testMut = useMutation({
    mutationFn: testTelegramBot,
    onSuccess: (r) =>
      setNote({
        text: `Проверка бота: всё в порядке (${r.username ? `@${r.username}` : `id ${r.id}`}).`,
        error: false,
      }),
    onError: (e) =>
      setNote({ text: humanizeTelegramError(e, 'Не удалось проверить Telegram.'), error: true }),
  });

  const confirmRun = () => {
    const count =
      form.target === 'all'
        ? 'всем участникам с Telegram ID'
        : `выбранным получателям (${form.member_ids.length})`;
    Alert.alert('Отправить сейчас?', `Молитва на ${dateYmd} уйдёт ${count}. Отменить отправку будет нельзя.`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Отправить', onPress: () => runMut.mutate() },
    ]);
  };

  const toggleMember = (id: number) =>
    setForm((s) => ({
      ...s,
      member_ids: s.member_ids.includes(id)
        ? s.member_ids.filter((x) => x !== id)
        : [...s.member_ids, id],
    }));

  const loading = settings.isPending || recipients.isPending;
  const busy = saveMut.isPending || runMut.isPending || testMut.isPending;

  const Segment = ({
    value,
    options,
    onChange,
  }: {
    value: string;
    options: Array<{ id: string; label: string }>;
    onChange: (id: string) => void;
  }) => (
    <View style={styles.segment}>
      {options.map((o) => (
        <Pressable
          key={o.id}
          onPress={() => onChange(o.id)}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === o.id }}
          style={[styles.segBtn, value === o.id && styles.segBtnOn]}
        >
          <Text style={[styles.segText, value === o.id && styles.segTextOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Рассылка молитвы в Telegram</Text>
            <Text style={styles.sub}>Часовой пояс сервера: {form.server_timezone}</Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            style={styles.close}
          >
            <Text style={styles.closeText}>Закрыть</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : (
            <>
              {botEnabled.data === false ? (
                <Text style={[styles.notice, styles.noticeWarn]}>
                  Telegram-бот выключен в настройках админки. Включите его, чтобы рассылка работала.
                </Text>
              ) : null}
              {note ? (
                <Text style={[styles.notice, note.error ? styles.noticeErr : styles.noticeOk]}>
                  {note.text}
                </Text>
              ) : null}

              <Text style={styles.label}>Предпросмотр · {preview.data?.date ?? dateYmd}</Text>
              <View style={styles.previewBox}>
                {preview.isError ? (
                  <Text style={styles.noticeErr}>
                    {humanizeTelegramError(preview.error, 'Не удалось загрузить предпросмотр.')}
                  </Text>
                ) : (
                  <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
                    <Text selectable style={styles.previewText}>
                      {preview.data?.text ?? 'Загрузка…'}
                    </Text>
                  </ScrollView>
                )}
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Включить авторассылку</Text>
                <Switch
                  value={form.enabled}
                  onValueChange={(v) => setForm((s) => ({ ...s, enabled: v }))}
                  accessibilityLabel="Включить авторассылку"
                />
              </View>

              <Text style={styles.label}>Режим</Text>
              <Segment
                value={form.kind}
                options={[
                  { id: 'daily', label: 'Ежедневно' },
                  { id: 'once', label: 'Разово' },
                ]}
                onChange={(id) => setForm((s) => ({ ...s, kind: id as 'daily' | 'once' }))}
              />

              {form.kind === 'daily' ? (
                <>
                  <Text style={styles.label}>Время (по серверу), ЧЧ:ММ</Text>
                  <TextInput
                    value={form.time_hhmm ?? ''}
                    onChangeText={(v) => setForm((s) => ({ ...s, time_hhmm: v }))}
                    placeholder="09:00"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    style={styles.input}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.label}>Дата, ГГГГ-ММ-ДД</Text>
                  <TextInput
                    value={onceDate}
                    onChangeText={setOnceDate}
                    placeholder="2026-11-22"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={10}
                    style={styles.input}
                  />
                  <Text style={styles.label}>Время, ЧЧ:ММ</Text>
                  <TextInput
                    value={onceTime}
                    onChangeText={setOnceTime}
                    placeholder="09:00"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    style={styles.input}
                  />
                </>
              )}

              <Text style={styles.label}>Кому отправлять</Text>
              <Segment
                value={form.target}
                options={[
                  { id: 'all', label: 'Всем с Telegram ID' },
                  { id: 'selected', label: 'Выбранным' },
                ]}
                onChange={(id) => setForm((s) => ({ ...s, target: id as 'all' | 'selected' }))}
              />

              {form.target === 'selected' ? (
                <View style={{ gap: 6 }}>
                  {(recipients.data ?? []).length === 0 ? (
                    <Text style={styles.sub}>Нет участников с заполненным Telegram ID.</Text>
                  ) : null}
                  {(recipients.data ?? []).map((u) => {
                    const on = form.member_ids.includes(u.id);
                    return (
                      <Pressable
                        key={u.id}
                        onPress={() => toggleMember(u.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        style={[styles.person, on && styles.personOn]}
                      >
                        <View style={[styles.box, on && styles.boxOn]} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.personName} numberOfLines={1}>
                            {u.name}
                          </Text>
                          {u.telegram_delivery_blocked ? (
                            <Text style={styles.blocked}>Бот заблокирован пользователем</Text>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {form.last_sent_label ? (
                <Text style={styles.sub}>Последняя отправка: {form.last_sent_label}</Text>
              ) : null}
              {validation ? <Text style={styles.noticeErr}>{validation}</Text> : null}
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={() => testMut.mutate()}
            disabled={busy}
            accessibilityRole="button"
            style={[styles.btn, styles.btnGhost]}
          >
            {testMut.isPending ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.btnGhostText}>Проверить бота</Text>
            )}
          </Pressable>
          <Pressable
            onPress={confirmRun}
            disabled={busy || (form.target === 'selected' && form.member_ids.length === 0)}
            accessibilityRole="button"
            style={[styles.btn, styles.btnGhost]}
          >
            {runMut.isPending ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.btnGhostText}>Отправить сейчас</Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => saveMut.mutate()}
            disabled={busy || validation != null}
            accessibilityRole="button"
            style={[styles.btn, styles.btnPrimary, (busy || validation != null) && { opacity: 0.55 }]}
          >
            {saveMut.isPending ? (
              <ActivityIndicator color={colors.textOnPrimary} />
            ) : (
              <Text style={styles.btnPrimaryText}>Сохранить</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
    title: { fontSize: 20, fontWeight: '800', color: colors.text },
    sub: { fontSize: 14, color: colors.textSecondary, marginTop: 2, lineHeight: 20 },
    close: { minHeight: 48, justifyContent: 'center' },
    closeText: { fontSize: 16, fontWeight: '700', color: colors.primary },
    content: { padding: 16, gap: 8 },
    label: { fontSize: 14, fontWeight: '800', color: colors.textSecondary, marginTop: 10 },
    notice: { fontSize: 15, lineHeight: 22, padding: 12, borderRadius: 12, overflow: 'hidden' },
    noticeWarn: { backgroundColor: '#FEF3C7', color: '#78350F' },
    noticeOk: { backgroundColor: '#DCFCE7', color: '#14532D' },
    noticeErr: { color: '#B42318', fontSize: 15, lineHeight: 22 },
    previewBox: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.textMuted + '66',
      backgroundColor: colors.surfaceElevated,
      padding: 12,
    },
    previewText: { fontSize: 15, lineHeight: 22, color: colors.text },
    switchRow: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginTop: 8,
    },
    switchLabel: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
    segment: { flexDirection: 'row', gap: 8 },
    segBtn: {
      flex: 1,
      minHeight: 48,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.textMuted + '77',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
      backgroundColor: colors.surfaceElevated,
    },
    segBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    segText: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' },
    segTextOn: { color: colors.textOnPrimary },
    input: {
      minHeight: 52,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.textMuted + '88',
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: 14,
      fontSize: 18,
      color: colors.text,
    },
    person: {
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
    },
    personOn: { backgroundColor: colors.primary + '14' },
    box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.textMuted },
    boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    personName: { fontSize: 16, fontWeight: '600', color: colors.text },
    blocked: { fontSize: 13, color: '#B42318' },
    footer: { flexDirection: 'row', gap: 8, padding: 12, flexWrap: 'wrap' },
    btn: {
      flexGrow: 1,
      minHeight: 52,
      minWidth: 110,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    btnGhost: { borderWidth: 1, borderColor: colors.primary },
    btnGhostText: { fontSize: 15, fontWeight: '800', color: colors.primary, textAlign: 'center' },
    btnPrimary: { backgroundColor: colors.primary },
    btnPrimaryText: { fontSize: 16, fontWeight: '800', color: colors.textOnPrimary },
  });
}
