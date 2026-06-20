import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { messengerTextProps, searchBarBg } from '../../theme/messenger';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  const styles = useMemo(() => createStyles(), []);

  return (
    <View style={styles.searchContainer}>
      <Ionicons name="search" size={14} color="#aaa" />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Поиск"
        placeholderTextColor="#aaa"
        {...messengerTextProps}
        style={styles.searchInput}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
    </View>
  );
}

function createStyles() {
  return StyleSheet.create({
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: searchBarBg,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: Platform.select({ ios: 6, android: 4, default: 6 }),
      minHeight: 32,
      marginHorizontal: 16,
      marginBottom: 6,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      lineHeight: 18,
      color: '#111',
      padding: 0,
      margin: 0,
    },
  });
}
