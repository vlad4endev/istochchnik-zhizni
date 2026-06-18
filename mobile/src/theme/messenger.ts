import { Platform } from 'react-native';

export const MESSENGER_BRAND = '#8B1A1A';

export const androidRipple = {
  color: 'rgba(139,26,26,0.08)',
  borderless: false as const,
};

export const messengerTextProps = {
  allowFontScaling: false as const,
};

/** Android BiDi fix: simple line breaks, no hyphenation splitting digits. */
export const messengerAndroidTextProps =
  Platform.OS === 'android'
    ? ({
        textBreakStrategy: 'simple' as const,
        androidHyphenationFrequency: 'none' as const,
      } as const)
    : ({} as const);

export const messengerAndroidRoboto = Platform.select({
  android: { fontFamily: 'Roboto' as const, writingDirection: 'ltr' as const },
  default: {},
});

export const messengerAndroidTimeStyle = Platform.select({
  android: {
    fontFamily: 'Roboto' as const,
    writingDirection: 'ltr' as const,
    includeFontPadding: false as const,
    textAlignVertical: 'center' as const,
  },
  default: {},
});

export const searchBarBg = Platform.select({
  ios: 'rgba(0,0,0,0.07)',
  android: 'rgba(0,0,0,0.06)',
  default: 'rgba(0,0,0,0.07)',
});

export const tabInactiveBg = 'rgba(0,0,0,0.07)';
