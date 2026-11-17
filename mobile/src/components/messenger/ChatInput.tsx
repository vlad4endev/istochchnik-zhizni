import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { formatApiError } from '../../api/client';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import {
  MAX_ALBUM_ITEMS,
  formatDurationSec,
  type AttachmentDraft,
} from '../../lib/attachments';
import { pickFiles, pickFromCamera, pickFromGallery } from '../../lib/pickAttachments';
import { sendRealtimeJson } from '../../lib/realtimeWs';
import { androidRipple, messengerTextProps } from '../../theme/messenger';
import { useTheme } from '../../theme';
import { AttachSheet, type AttachSource } from './AttachSheet';
import { PendingAttachments } from './PendingAttachments';

interface ChatInputProps {
  onSend: (text: string) => Promise<void>;
  /** Отправка выбранных фото/файлов с подписью; `onProgress` — 0–100. */
  onSendAttachments?: (
    items: AttachmentDraft[],
    caption: string,
    onProgress: (pct: number) => void,
  ) => Promise<void>;
  onSendVoice?: (file: AttachmentDraft, durationSec: number) => Promise<void>;
  disabled?: boolean;
  conversationId?: string;
  /** Режим правки: текст подставляется в поле; `token` меняется при каждой новой правке. */
  prefill?: { token: number; text: string } | null;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  onSendAttachments,
  onSendVoice,
  disabled = false,
  conversationId,
  prefill = null,
  placeholder = 'Сообщение...',
}: ChatInputProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [pending, setPending] = useState<AttachmentDraft[]>([]);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);
  const voiceFinishRef = useRef<() => void>(() => undefined);

  const voice = useVoiceRecorder(() => voiceFinishRef.current());
  const editing = prefill != null;
  const canAttach = !editing && onSendAttachments != null;
  const hasContent = text.trim().length > 0 || pending.length > 0;
  const canSend = hasContent && !disabled && !sending;
  const showMic = !hasContent && !editing && onSendVoice != null;

  useEffect(() => {
    if (prefill) setText(prefill.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.token]);

  const sendTypingStop = useCallback(() => {
    if (!conversationId) return;
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    sendRealtimeJson({ type: 'typing:stop', conversationId });
    lastTypingSentRef.current = 0;
  }, [conversationId]);

  const sendTypingStart = useCallback(() => {
    if (!conversationId) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > 1500) {
      sendRealtimeJson({ type: 'typing:start', conversationId });
      lastTypingSentRef.current = now;
    }
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      sendTypingStop();
    }, 3000);
  }, [conversationId, sendTypingStop]);

  useEffect(() => {
    return () => {
      sendTypingStop();
    };
  }, [sendTypingStop]);

  const handleTextChange = (value: string) => {
    setText(value);
    if (value.trim().length > 0) {
      sendTypingStart();
    } else {
      sendTypingStop();
    }
  };

  const addPicked = (res: { items: AttachmentDraft[]; error: string | null }) => {
    setNotice(res.error);
    if (res.items.length === 0) return;
    setPending((prev) => {
      const next = [...prev, ...res.items];
      if (next.length > MAX_ALBUM_ITEMS) {
        setNotice(`Можно прикрепить не больше ${MAX_ALBUM_ITEMS} файлов за раз.`);
        return next.slice(0, MAX_ALBUM_ITEMS);
      }
      return next;
    });
  };

  const handlePick = async (source: AttachSource) => {
    try {
      const res =
        source === 'camera'
          ? await pickFromCamera()
          : source === 'gallery'
            ? await pickFromGallery(MAX_ALBUM_ITEMS - pending.length || 1)
            : await pickFiles();
      addPicked(res);
    } catch (e) {
      setNotice(`Не удалось выбрать файл: ${formatApiError(e)}`);
    }
  };

  const handleSend = async () => {
    const value = text.trim();
    if (!canSend) return;
    setSending(true);
    setNotice(null);
    sendTypingStop();
    try {
      if (pending.length > 0 && onSendAttachments) {
        setUploadPct(0);
        await onSendAttachments(pending, value, setUploadPct);
        setPending([]);
        setText('');
      } else {
        setText('');
        await onSend(value);
      }
    } catch (e) {
      // Вложения и текст сохраняем: пользователь может повторить без повторного выбора.
      if (pending.length > 0) {
        setNotice(`Не удалось отправить: ${formatApiError(e)}. Нажмите отправить ещё раз.`);
      } else {
        setText(value);
        setNotice(`Не удалось отправить: ${formatApiError(e)}`);
      }
    } finally {
      setSending(false);
      setUploadPct(null);
    }
  };

  const startVoice = async () => {
    setNotice(null);
    const err = await voice.start();
    if (err) setNotice(err);
  };

  const finishVoice = async () => {
    const result = await voice.finish();
    if (!result) {
      setNotice('Запись слишком короткая — удерживайте дольше секунды.');
      return;
    }
    if (!onSendVoice) return;
    setSending(true);
    try {
      await onSendVoice(result.file, result.durationSec);
    } catch (e) {
      setNotice(`Не удалось отправить голосовое: ${formatApiError(e)}`);
    } finally {
      setSending(false);
    }
  };
  voiceFinishRef.current = () => void finishVoice();

  const cancelVoice = () =>
    Alert.alert('Удалить запись?', undefined, [
      { text: 'Продолжить запись', style: 'cancel' },
      { text: 'Удалить', style: 'destructive', onPress: () => void voice.cancel() },
    ]);

  if (voice.recording) {
    return (
      <View style={styles.bar}>
        <Pressable
          onPress={cancelVoice}
          accessibilityRole="button"
          accessibilityLabel="Удалить запись"
          style={styles.iconBtn}
        >
          <Ionicons name="trash-outline" size={26} color="#DC2626" />
        </Pressable>
        <View style={styles.recInfo} accessibilityLiveRegion="polite">
          <View style={styles.recDot} />
          <Text style={styles.recTime}>{formatDurationSec(voice.seconds)}</Text>
          <Text style={styles.recHint}>Идёт запись…</Text>
        </View>
        <Pressable
          onPress={() => void finishVoice()}
          accessibilityRole="button"
          accessibilityLabel="Отправить голосовое"
          style={[styles.sendBtn, { backgroundColor: colors.primary }]}
        >
          <Ionicons name="send" size={20} color={colors.textOnPrimary} />
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      {notice ? (
        <Pressable onPress={() => setNotice(null)} accessibilityRole="button" style={styles.notice}>
          <Text style={styles.noticeText}>{notice}</Text>
        </Pressable>
      ) : null}
      <View style={styles.pendingWrap}>
        <PendingAttachments
          items={pending}
          disabled={sending}
          onRemove={(i) => setPending((prev) => prev.filter((_, idx) => idx !== i))}
        />
        {uploadPct != null ? (
          <View style={styles.progressTrack} accessibilityLabel={`Загрузка ${uploadPct}%`}>
            <View style={[styles.progressFill, { width: `${uploadPct}%` }]} />
          </View>
        ) : null}
      </View>
      <View style={styles.bar}>
        {canAttach ? (
          <Pressable
            onPress={() => setAttachOpen(true)}
            disabled={disabled || sending}
            accessibilityRole="button"
            accessibilityLabel="Прикрепить"
            android_ripple={androidRipple}
            style={styles.iconBtn}
          >
            <Ionicons name="attach" size={28} color={colors.textSecondary} />
          </Pressable>
        ) : null}
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={handleTextChange}
          onBlur={sendTypingStop}
          placeholder={pending.length > 0 ? 'Добавить подпись…' : placeholder}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={8000}
          editable={!disabled && !sending}
          {...messengerTextProps}
        />
        {showMic ? (
          <Pressable
            onPress={() => void startVoice()}
            disabled={disabled || sending}
            accessibilityRole="button"
            accessibilityLabel="Записать голосовое сообщение"
            android_ripple={androidRipple}
            style={[styles.sendBtn, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="mic" size={22} color={colors.textOnPrimary} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void handleSend()}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Отправить"
            android_ripple={androidRipple}
            style={({ pressed }) => [
              styles.sendBtn,
              { backgroundColor: canSend ? colors.primary : colors.textMuted },
              pressed && canSend ? { opacity: 0.85 } : null,
            ]}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.textOnPrimary} />
            ) : (
              <Ionicons name="send" size={20} color={colors.textOnPrimary} />
            )}
          </Pressable>
        )}
      </View>
      <AttachSheet
        visible={attachOpen}
        onClose={() => setAttachOpen(false)}
        onPick={(s) => void handlePick(s)}
      />
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 6,
      paddingHorizontal: 8,
      paddingTop: 8,
      paddingBottom: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(28,25,23,0.1)',
      backgroundColor: colors.surfaceElevated,
    },
    iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 140,
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 17,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pendingWrap: { backgroundColor: colors.surfaceElevated },
    progressTrack: {
      height: 4,
      marginHorizontal: 12,
      marginTop: 6,
      borderRadius: 2,
      backgroundColor: colors.textMuted + '44',
      overflow: 'hidden',
    },
    progressFill: { height: 4, backgroundColor: colors.primary },
    notice: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: '#FEE2E2',
    },
    noticeText: { fontSize: 14, lineHeight: 20, color: '#7F1D1D' },
    recInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
    recDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#DC2626' },
    recTime: {
      fontSize: 19,
      fontWeight: '700',
      color: colors.text,
      fontVariant: ['tabular-nums'],
    },
    recHint: { fontSize: 14, color: colors.textSecondary },
  });
}
