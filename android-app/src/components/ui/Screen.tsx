import type {ReactNode} from 'react';
import {SafeAreaView, ScrollView, View, type ViewProps} from 'react-native';

import {OfflineBanner} from './OfflineBanner';

interface ScreenProps extends ViewProps {
  children: ReactNode;
  scroll?: boolean;
  className?: string;
  /** When false, skips the global offline/sync banner. */
  showOfflineBanner?: boolean;
  /** Inner padding; use false for full-bleed lists. */
  padded?: boolean;
}

export function Screen({
  children,
  scroll = false,
  className = '',
  showOfflineBanner = true,
  padded = true,
  ...rest
}: ScreenProps) {
  const padClass = padded ? 'p-4' : '';
  const content = scroll ? (
    <ScrollView className="flex-1" contentContainerClassName={padClass || 'pb-4'}>
      {children}
    </ScrollView>
  ) : (
    <View className={`flex-1 ${padClass}`}>{children}</View>
  );

  return (
    <SafeAreaView className={`flex-1 bg-surface ${className}`} {...rest}>
      {showOfflineBanner ? <OfflineBanner /> : null}
      {content}
    </SafeAreaView>
  );
}
