import { Ionicons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { sendRealtimeJson } from '../../lib/realtimeWs';
import { androidRipple, messengerTextProps } from '../../theme/messenger';
import { useTheme } from '../../theme';

const MAX_FILE_BYTES = 20 * 1024 * 1024;

export type PendingChatImage = {
  uri: string;
  name: string;
  type: string;
};

export type PendingChatVoice = {
  uri: string;
  name: string;
  type: string;
  durationSec: number;
};

export type PendingChatFile = {
  uri: string;
  name: string;
  type: string;
  size?: number;
};

interface ChatInputProps {
  onSend: (text: string) => Promise<void>;
  onSendImage?: (input: {
    caption: string;
    asset: PendingChatImage;
  }) => Promise<void>;
  onSendFile?: (input: {
    caption: string;
    asset: PendingChatFile;
  }) => Promise<void>;
  onSendVoice?: (input: PendingChatVoice) => Promise<void>;
  disabled?: boolean;
  conversationId?: string;
  onOpenPoll?: () => void;
}

function formatRecTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function ChatInput({
  onSend,
  onSendImage,
  onSendFile,
  onSendVoice,
  disabled = false,
  conversationId,
  onOpenPoll,
}: ChatInputProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [text, setText] = useState('');
  const [pendingImage, setPendingImage] = useState<PendingChatImage | null>(null);
  const [pendingFile, setPendingFile] = useState<PendingChatFile | null>(null);
  const [sending, setSending] = useState(false);
  const [recordingUi, setRecordingUi] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 200);

  const canSendText =
    text.trim().length > 0 &&
    !disabled &&
    !sending &&
    !pendingImage &&
    !pendingFile &&
    !recordingUi;
  const canSendImage = pendingImage != null && !disabled && !sending && Boolean(onSendImage);
  const canSendFile = pendingFile != null && !disabled && !sending && Boolean(onSendFile);

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
      if (recorder.isRecording) {
        void recorder.stop().catch(() => undefined);
      }
    };
  }, [sendTypingStop, recorder]);

  const handleTextChange = (value: string) => {
    setText(value);
    if (value.trim().length > 0) {
      sendTypingStart();
    } else {
      sendTypingStop();
    }
  };

  const pickImage = async () => {
    if (!onSendImage || disabled || sending || recordingUi) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Нет доступа', 'Разрешите доступ к галерее, чтобы отправить фото');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsMultipleSelection: false,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const uri = asset.uri;
    const name =
      asset.fileName?.trim() ||
      `photo-${Date.now()}.${(asset.mimeType || 'image/jpeg').includes('png') ? 'png' : 'jpg'}`;
    const type = asset.mimeType || 'image/jpeg';
    setPendingFile(null);
    setPendingImage({ uri, name, type });
  };

  const pickFile = async () => {
    if (!onSendFile || disabled || sending || recordingUi) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'text/plain',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          '*/*',
        ],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const size = asset.size ?? 0;
      if (size > MAX_FILE_BYTES) {
        Alert.alert('Файл слишком большой', 'Максимум 20 МБ для документов');
        return;
      }
      setPendingImage(null);
      setPendingFile({
        uri: asset.uri,
        name: asset.name || `file-${Date.now()}`,
        type: asset.mimeType || 'application/octet-stream',
        size: asset.size,
      });
    } catch (e) {
      Alert.alert('Ошибка', e instanceof Error ? e.message : 'Не удалось выбрать файл');
    }
  };

  const startRecording = async () => {
    if (!onSendVoice || disabled || sending || recordingUi) return;
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Нет доступа', 'Разрешите доступ к микрофону для голосовых сообщений');
      return;
    }
    try {
      sendTypingStop();
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecordingUi(true);
    } catch (e) {
      Alert.alert('Ошибка', e instanceof Error ? e.message : 'Не удалось начать запись');
      setRecordingUi(false);
    }
  };

  const cancelRecording = async () => {
    try {
      if (recorder.isRecording) await recorder.stop();
    } catch {
      // ignore
    }
    setRecordingUi(false);
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  };

  const stopAndSendRecording = async () => {
    if (!onSendVoice || !recordingUi) return;
    setSending(true);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      const durationSec = Math.max(1, Math.round(recorderState.durationMillis / 1000 || recorder.currentTime || 1));
      setRecordingUi(false);
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (!uri) {
        throw new Error('Запись не найдена');
      }
      if (durationSec < 1) {
        throw new Error('Слишком короткая запись');
      }
      await onSendVoice({
        uri,
        name: `voice-${Date.now()}.m4a`,
        type: 'audio/mp4',
        durationSec,
      });
    } catch (e) {
      Alert.alert('Ошибка', e instanceof Error ? e.message : 'Не удалось отправить голосовое');
      setRecordingUi(false);
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    if (disabled || sending) return;

    if (pendingImage && onSendImage) {
      const caption = text.trim();
      const asset = pendingImage;
      setSending(true);
      setText('');
      setPendingImage(null);
      sendTypingStop();
      try {
        await onSendImage({ caption, asset });
      } catch (e) {
        setPendingImage(asset);
        setText(caption);
        Alert.alert('Ошибка', e instanceof Error ? e.message : 'Не удалось отправить фото');
      } finally {
        setSending(false);
      }
      return;
    }

    if (pendingFile && onSendFile) {
      const caption = text.trim();
      const asset = pendingFile;
      setSending(true);
      setText('');
      setPendingFile(null);
      sendTypingStop();
      try {
        await onSendFile({ caption, asset });
      } catch (e) {
        setPendingFile(asset);
        setText(caption);
        Alert.alert('Ошибка', e instanceof Error ? e.message : 'Не удалось отправить файл');
      } finally {
        setSending(false);
      }
      return;
    }

    const value = text.trim();
    if (!value) return;
    setSending(true);
    setText('');
    sendTypingStop();
    try {
      await onSend(value);
    } finally {
      setSending(false);
    }
  };

  if (recordingUi) {
    return (
      <View style={styles.wrap}>
        <View style={styles.recordingBar}>
          <View style={styles.recDot} />
          <Text style={styles.recLabel}>
            Запись {formatRecTime((recorderState.durationMillis || 0) / 1000 || recorder.currentTime)}
          </Text>
          <Pressable
            onPress={() => void cancelRecording()}
            disabled={sending}
            style={styles.recCancel}
          >
            <Text style={styles.recCancelText}>Отмена</Text>
          </Pressable>
          <Pressable
            onPress={() => void stopAndSendRecording()}
            disabled={sending}
            style={({ pressed }) => [
              styles.sendBtn,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.85 },
            ]}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.textOnPrimary} />
            ) : (
              <Ionicons name="send" size={18} color={colors.textOnPrimary} />
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {pendingImage ? (
        <View style={styles.previewRow}>
          <Image source={{ uri: pendingImage.uri }} style={styles.preview} />
          <Pressable
            onPress={() => setPendingImage(null)}
            disabled={sending}
            hitSlop={8}
            style={styles.previewRemove}
          >
            <Ionicons name="close-circle" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}
      {pendingFile ? (
        <View style={styles.previewRow}>
          <View style={styles.filePreview}>
            <Ionicons name="document-text-outline" size={20} color={colors.primary} />
            <Text style={styles.filePreviewName} numberOfLines={1}>
              {pendingFile.name}
            </Text>
          </View>
          <Pressable
            onPress={() => setPendingFile(null)}
            disabled={sending}
            hitSlop={8}
            style={styles.previewRemove}
          >
            <Ionicons name="close-circle" size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : null}
      <View style={styles.bar}>
        {onSendImage ? (
          <Pressable
            onPress={() => void pickImage()}
            disabled={disabled || sending}
            android_ripple={androidRipple}
            hitSlop={8}
            style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="image-outline" size={22} color={colors.primary} />
          </Pressable>
        ) : null}
        {onSendFile ? (
          <Pressable
            onPress={() => void pickFile()}
            disabled={disabled || sending}
            android_ripple={androidRipple}
            hitSlop={8}
            style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="attach-outline" size={22} color={colors.primary} />
          </Pressable>
        ) : null}
        {onOpenPoll ? (
          <Pressable
            onPress={onOpenPoll}
            disabled={disabled || sending}
            android_ripple={androidRipple}
            hitSlop={8}
            style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="stats-chart-outline" size={22} color={colors.primary} />
          </Pressable>
        ) : null}
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={handleTextChange}
          onBlur={sendTypingStop}
          placeholder={pendingImage || pendingFile ? 'Подпись…' : 'Сообщение...'}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={8000}
          editable={!disabled && !sending}
          {...messengerTextProps}
        />
        {canSendText || canSendImage || canSendFile || !onSendVoice ? (
          <Pressable
            onPress={() => void handleSend()}
            disabled={!(canSendText || canSendImage || canSendFile)}
            android_ripple={androidRipple}
            style={({ pressed }) => [
              styles.sendBtn,
              {
                backgroundColor:
                  canSendText || canSendImage || canSendFile
                    ? colors.primary
                    : colors.textMuted,
              },
              pressed && (canSendText || canSendImage || canSendFile) ? { opacity: 0.85 } : null,
            ]}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.textOnPrimary} />
            ) : (
              <Ionicons name="send" size={18} color={colors.textOnPrimary} />
            )}
          </Pressable>
        ) : (
          <Pressable
            onPress={() => void startRecording()}
            disabled={disabled || sending}
            android_ripple={androidRipple}
            style={({ pressed }) => [
              styles.sendBtn,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="mic" size={20} color={colors.textOnPrimary} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    wrap: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(28,25,23,0.1)',
      backgroundColor: colors.surfaceElevated,
    },
    previewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingTop: 10,
      gap: 8,
    },
    preview: {
      width: 72,
      height: 72,
      borderRadius: 10,
      backgroundColor: colors.surface,
    },
    filePreview: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.surface,
    },
    filePreviewName: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    previewRemove: {
      padding: 4,
    },
    bar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 4,
      paddingHorizontal: 8,
      paddingTop: 8,
      paddingBottom: 8,
    },
    recordingBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    recDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#dc2626',
    },
    recLabel: {
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    recCancel: {
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    recCancelText: {
      color: colors.textMuted,
      fontWeight: '600',
    },
    toolBtn: {
      width: 36,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    input: {
      flex: 1,
      minHeight: 40,
      maxHeight: 120,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 10,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
