import type {ReactNode} from 'react';
import {SafeAreaView, ScrollView, View, type ViewProps} from 'react-native';

interface ScreenProps extends ViewProps {
  children: ReactNode;
  scroll?: boolean;
  className?: string;
}

export function Screen({children, scroll = false, className = '', ...rest}: ScreenProps) {
  const content = scroll ? (
    <ScrollView className="flex-1" contentContainerClassName="p-4">
      {children}
    </ScrollView>
  ) : (
    <View className="flex-1 p-4">{children}</View>
  );

  return (
    <SafeAreaView className={`flex-1 bg-surface ${className}`} {...rest}>
      {content}
    </SafeAreaView>
  );
}
