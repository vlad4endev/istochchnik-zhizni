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
      <Ionicons name="search" size={16} color="#aaa" />
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
      gap: 8,
      backgroundColor: searchBarBg,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: Platform.select({ ios: 8, android: 6, default: 8 }),
      marginHorizontal: 16,
      marginBottom: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: '#111',
      padding: 0,
      margin: 0,
    },
  });
}
