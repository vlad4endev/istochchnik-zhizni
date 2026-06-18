import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  getUnreadForTab,
  type ChatTab,
} from '../../lib/messengerTabs';
import type { ConversationListItem } from '../../api/messenger';
import {
  androidRipple,
  MESSENGER_BRAND,
  messengerTextProps,
  tabInactiveBg,
} from '../../theme/messenger';

const TABS: { id: ChatTab; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'personal', label: 'Личные' },
  { id: 'services', label: 'Служения' },
  { id: 'notifications', label: 'Уведомления' },
];

interface ChatFilterTabsProps {
  activeTab: ChatTab;
  onChange: (tab: ChatTab) => void;
  conversations: ConversationListItem[];
}

export function ChatFilterTabs({ activeTab, onChange, conversations }: ChatFilterTabsProps) {
  const styles = useMemo(() => createStyles(), []);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        const unread = getUnreadForTab(conversations, tab.id);
        return (
          <Pressable
            key={tab.id}
            onPress={() => onChange(tab.id)}
            android_ripple={androidRipple}
            style={[
              styles.tabButton,
              isActive ? styles.tabButtonActive : styles.tabButtonInactive,
            ]}
          >
            <Text
              {...messengerTextProps}
              style={[
                styles.tabButtonText,
                isActive ? styles.tabButtonTextActive : styles.tabButtonTextInactive,
              ]}
            >
              {tab.label}
            </Text>
            {unread > 0 ? (
              <View
                style={[
                  styles.tabBadge,
                  isActive ? styles.tabBadgeActive : styles.tabBadgeInactive,
                ]}
              >
                <Text
                  {...messengerTextProps}
                  style={[
                    styles.tabBadgeText,
                    isActive ? styles.tabBadgeTextActive : styles.tabBadgeTextInactive,
                  ]}
                >
                  {unread > 99 ? '99+' : unread}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function createStyles() {
  return StyleSheet.create({
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 8,
      gap: 6,
      flexDirection: 'row',
      alignItems: 'center',
    },
    tabButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 20,
      marginRight: 6,
    },
    tabButtonActive: {
      backgroundColor: MESSENGER_BRAND,
    },
    tabButtonInactive: {
      backgroundColor: tabInactiveBg,
    },
    tabButtonText: {
      fontSize: 13,
    },
    tabButtonTextActive: {
      color: '#fff',
      fontWeight: '600',
    },
    tabButtonTextInactive: {
      color: '#555',
      fontWeight: '400',
    },
    tabBadge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabBadgeActive: {
      backgroundColor: 'rgba(255,255,255,0.25)',
    },
    tabBadgeInactive: {
      backgroundColor: MESSENGER_BRAND,
    },
    tabBadgeText: {
      fontSize: 11,
      fontWeight: '700',
    },
    tabBadgeTextActive: {
      color: '#fff',
    },
    tabBadgeTextInactive: {
      color: '#fff',
    },
  });
}
