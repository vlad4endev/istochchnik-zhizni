import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  createChatMeeting,
  createStandaloneMeeting,
  formatInviteText,
  type CallMediaType,
  type CreatedCall,
} from '../../api/calls';
import { formatApiError } from '../../api/client';
import { sendMessage } from '../../api/messenger';
import { usePrayerPlanAccess } from '../../hooks/usePrayerPlanAccess';
import { createClientMsgId } from '../../lib/messengerUtils';
import { openGroupCall } from '../../lib/openCall';
import { useTheme, type ThemeColors } from '../../theme';

const MAX_TITLE = 80;

const PRAYER_TEMPLATES = [
  { id: 'morning', title: 'Утренняя молитвенная стража', short: 'Утро', icon: 'sunny-outline' as const },
  { id: 'evening', title: 'Вечерняя молитвенная стража', short: 'Вечер', icon: 'moon-outline' as const },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  initialType?: CallMediaType;
  /** Если задан — созвон создаётся в этом чате, а ссылка отправляется участникам в чат. */
  conversationId?: string;
  conversationTitle?: string;
};

/** Создание группового созвона: видео или аудио, своё название или шаблон молитвенной стражи. */
export function CreateMeetingSheet({
  visible,
  onClose,
  initialType = 'video',
  conversationId,
  conversationTitle,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const qc = useQueryClient();
  const { canManageNotes } = usePrayerPlanAccess();
  const navigation = useNavigation<{ navigate: (screen: 'Call') => void }>();
  const [mediaType, setMediaType] = useState<CallMediaType>(initialType);
  const [title, setTitle] = useState('');
  const [created, setCreated] = useState<CreatedCall | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (visible) {
      setMediaType(initialType);
      setTitle('');
      setCreated(null);
      setCopied(false);
    }
  }, [visible, initialType]);

  const createMut = useMutation({
    mutationFn: async (rawTitle: string) => {
      const name = rawTitle.trim().slice(0, MAX_TITLE) || undefined;
      const call = conversationId
        ? await createChatMeeting({ conversationId, mediaType, title: name })
        : await createStandaloneMeeting({ mediaType, title: name });
      // В чате ссылку получают все участники сразу, как на вебе.
      if (conversationId && call.inviteUrl) {
        const text = formatInviteText(
          call.title ?? name ?? (mediaType === 'video' ? 'Видеоконференция' : 'Аудиоконференция'),
          call.inviteUrl,
        );
        await sendMessage(conversationId, text, createClientMsgId(), null).catch(() => undefined);
        void qc.invalidateQueries({ queryKey: ['messenger', 'messages', conversationId] });
        void qc.invalidateQueries({ queryKey: ['messenger', 'conversations'] });
      }
      return call;
    },
    onSuccess: (call) => setCreated(call),
  });

  const isVideo = mediaType === 'video';
  const shownTitle =
    created?.title ?? (title.trim() || (isVideo ? 'Видеовстреча' : 'Аудиовстреча'));
  const inviteText = created?.inviteUrl ? formatInviteText(shownTitle, created.inviteUrl) : '';

  const copy = async () => {
    if (!inviteText) return;
    await Clipboard.setStringAsync(inviteText);
    setCopied(true);
  };

  const share = async () => {
    if (!inviteText) return;
    try {
      await Share.share({ message: inviteText, title: shownTitle });
    } catch {
      /* пользователь закрыл меню «Поделиться» */
    }
  };

  const open = () => {
    if (!created?.inviteUrl) return;
    const how = openGroupCall(navigation, {
      inviteUrl: created.inviteUrl,
      title: shownTitle,
      mediaType: created.mediaType,
      callId: created.id,
      asHost: true,
    });
    if (how === 'in-app') onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {created ? 'Встреча создана' : conversationId ? 'Групповой созвон' : 'Новая встреча'}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Закрыть"
              style={styles.close}
            >
              <Text style={styles.closeText}>{created ? 'Готово' : 'Закрыть'}</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {created ? (
              <>
                <View style={styles.badge}>
                  <Ionicons
                    name={isVideo ? 'videocam' : 'call'}
                    size={34}
                    color={colors.textOnPrimary}
                  />
                </View>
                <Text style={styles.resultTitle}>{shownTitle}</Text>
                <Text style={styles.hint}>
                  {conversationId
                    ? `Ссылка отправлена в чат${conversationTitle ? ` «${conversationTitle}»` : ''}. Откройте встречу и дождитесь участников.`
                    : 'Отправьте ссылку участникам и откройте встречу сами. Она откроется в браузере.'}
                </Text>
                {created.inviteUrl ? (
                  <Text selectable style={styles.link}>
                    {created.inviteUrl}
                  </Text>
                ) : (
                  <Text style={styles.error}>Сервер не вернул ссылку-приглашение.</Text>
                )}
                <Pressable
                  onPress={open}
                  disabled={!created.inviteUrl}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
                >
                  <Ionicons name="open-outline" size={22} color={colors.textOnPrimary} />
                  <Text style={styles.primaryText}>Открыть встречу</Text>
                </Pressable>
                <View style={styles.row2}>
                  <Pressable
                    onPress={() => void share()}
                    disabled={!created.inviteUrl}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.8 }]}
                  >
                    <Ionicons name="share-outline" size={20} color={colors.primary} />
                    <Text style={styles.ghostText}>Поделиться</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void copy()}
                    disabled={!created.inviteUrl}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.8 }]}
                  >
                    <Ionicons
                      name={copied ? 'checkmark' : 'copy-outline'}
                      size={20}
                      color={colors.primary}
                    />
                    <Text style={styles.ghostText}>{copied ? 'Скопировано' : 'Скопировать'}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.hint}>
                  {conversationId
                    ? 'Созвон по ссылке для участников этого чата. Ссылка сразу уйдёт в чат.'
                    : 'Создаётся только созвон по ссылке — без группы в чатах. После завершения всё закрывается.'}
                </Text>

                <View style={styles.segment}>
                  {(['video', 'audio'] as const).map((t) => {
                    const on = mediaType === t;
                    return (
                      <Pressable
                        key={t}
                        onPress={() => setMediaType(t)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        style={[styles.segBtn, on && styles.segBtnOn]}
                      >
                        <Ionicons
                          name={t === 'video' ? 'videocam-outline' : 'call-outline'}
                          size={22}
                          color={on ? colors.textOnPrimary : colors.text}
                        />
                        <Text style={[styles.segText, on && styles.segTextOn]}>
                          {t === 'video' ? 'Видео' : 'Аудио'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {canManageNotes ? (
                  <>
                    <Text style={styles.label}>Молитвенная стража</Text>
                    <View style={styles.row2}>
                      {PRAYER_TEMPLATES.map((tpl) => (
                        <Pressable
                          key={tpl.id}
                          disabled={createMut.isPending}
                          onPress={() => createMut.mutate(tpl.title)}
                          accessibilityRole="button"
                          accessibilityLabel={`Создать: ${tpl.title}`}
                          style={({ pressed }) => [styles.tpl, pressed && { opacity: 0.85 }]}
                        >
                          <Ionicons name={tpl.icon} size={26} color={colors.primary} />
                          <Text style={styles.tplShort}>{tpl.short}</Text>
                          <Text style={styles.tplTitle} numberOfLines={2}>
                            {tpl.title}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text style={styles.or}>или своё название</Text>
                  </>
                ) : null}

                <Text style={styles.label}>Название (необязательно)</Text>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  maxLength={MAX_TITLE}
                  placeholder={isVideo ? 'Видеовстреча' : 'Аудиовстреча'}
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  accessibilityLabel="Название встречи"
                  returnKeyType="done"
                />

                {createMut.isError ? (
                  <Text style={styles.error}>
                    Не удалось создать встречу: {formatApiError(createMut.error)}
                  </Text>
                ) : null}

                <Pressable
                  onPress={() => createMut.mutate(title)}
                  disabled={createMut.isPending}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.primaryBtn,
                    (pressed || createMut.isPending) && { opacity: 0.8 },
                  ]}
                >
                  {createMut.isPending ? (
                    <ActivityIndicator color={colors.textOnPrimary} />
                  ) : (
                    <>
                      <Ionicons
                        name={isVideo ? 'videocam' : 'call'}
                        size={22}
                        color={colors.textOnPrimary}
                      />
                      <Text style={styles.primaryText}>
                        {isVideo ? 'Создать видеовстречу' : 'Создать аудиовстречу'}
                      </Text>
                    </>
                  )}
                </Pressable>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.surface },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 12,
    },
    headerTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: colors.text },
    close: { minHeight: 48, justifyContent: 'center' },
    closeText: { fontSize: 16, fontWeight: '700', color: colors.primary },
    content: { padding: 16, gap: 12 },
    hint: { fontSize: 16, lineHeight: 24, color: colors.textSecondary },
    label: { fontSize: 14, fontWeight: '800', color: colors.textSecondary, marginTop: 6 },
    segment: { flexDirection: 'row', gap: 10 },
    segBtn: {
      flex: 1,
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.textMuted + '77',
      backgroundColor: colors.surfaceElevated,
    },
    segBtnOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    segText: { fontSize: 17, fontWeight: '700', color: colors.text },
    segTextOn: { color: colors.textOnPrimary },
    row2: { flexDirection: 'row', gap: 10 },
    tpl: {
      flex: 1,
      minHeight: 110,
      padding: 12,
      gap: 4,
      borderRadius: 16,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.primary + '44',
    },
    tplShort: { fontSize: 17, fontWeight: '800', color: colors.text },
    tplTitle: { fontSize: 14, color: colors.textSecondary, lineHeight: 19 },
    or: { textAlign: 'center', fontSize: 14, color: colors.textSecondary },
    input: {
      minHeight: 54,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.textMuted + '88',
      backgroundColor: colors.surfaceElevated,
      paddingHorizontal: 14,
      fontSize: 18,
      color: colors.text,
    },
    primaryBtn: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      borderRadius: 16,
      backgroundColor: colors.primary,
      marginTop: 6,
    },
    primaryText: { fontSize: 17, fontWeight: '800', color: colors.textOnPrimary },
    ghostBtn: {
      flex: 1,
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.primary + '66',
    },
    ghostText: { fontSize: 16, fontWeight: '700', color: colors.primary },
    error: { fontSize: 15, lineHeight: 22, color: '#B42318' },
    badge: {
      alignSelf: 'center',
      width: 76,
      height: 76,
      borderRadius: 38,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    resultTitle: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
    link: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.primary,
      textAlign: 'center',
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
      overflow: 'hidden',
    },
  });
}
