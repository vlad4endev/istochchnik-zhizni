import { Platform } from 'react-native';

export const MESSENGER_BRAND = '#8B1A1A';

export const androidRipple = {
  color: 'rgba(139,26,26,0.08)',
  borderless: false as const,
};

export const messengerTextProps = {
  allowFontScaling: false as const,
};

export const searchBarBg = Platform.select({
  ios: 'rgba(0,0,0,0.07)',
  android: 'rgba(0,0,0,0.06)',
  default: 'rgba(0,0,0,0.07)',
});

export const tabInactiveBg = 'rgba(0,0,0,0.07)';
