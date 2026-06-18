import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { sendRealtimeJson } from '../../lib/realtimeWs';
import { androidRipple, messengerTextProps } from '../../theme/messenger';
import { useTheme } from '../../theme';

interface ChatInputProps {
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
  conversationId?: string;
}

export function ChatInput({ onSend, disabled = false, conversationId }: ChatInputProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  const canSend = text.trim().length > 0 && !disabled && !sending;

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

  const handleSend = async () => {
    const value = text.trim();
    if (!value || disabled || sending) return;
    setSending(true);
    setText('');
    sendTypingStop();
    try {
      await onSend(value);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.bar}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={handleTextChange}
        onBlur={sendTypingStop}
        placeholder="Сообщение..."
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={8000}
        editable={!disabled && !sending}
        {...messengerTextProps}
      />
      <Pressable
        onPress={() => void handleSend()}
        disabled={!canSend}
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
          <Ionicons name="send" size={18} color={colors.textOnPrimary} />
        )}
      </Pressable>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(28,25,23,0.1)',
      backgroundColor: colors.surfaceElevated,
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
