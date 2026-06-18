import { Text, type TextProps } from 'react-native';

import { displayMessengerText } from '../../lib/messengerUtils';
import {
  messengerAndroidRoboto,
  messengerAndroidTextProps,
  messengerAndroidTimeStyle,
  messengerTextProps,
} from '../../theme/messenger';

interface MessengerTextProps extends TextProps {
  /** Apply Android BiDi normalization (LTR marks around digits). Default true. */
  bidiSafe?: boolean;
}

export function MessengerText({
  bidiSafe = true,
  style,
  children,
  ...rest
}: MessengerTextProps) {
  const content =
    bidiSafe && typeof children === 'string' ? displayMessengerText(children) : children;

  return (
    <Text
      {...messengerTextProps}
      {...messengerAndroidTextProps}
      style={[messengerAndroidRoboto, style]}
      {...rest}
    >
      {content}
    </Text>
  );
}

export function MessengerTimeText({ style, children, ...rest }: MessengerTextProps) {
  const content =
    typeof children === 'string' ? displayMessengerText(children) : children;

  return (
    <Text
      {...messengerTextProps}
      {...messengerAndroidTextProps}
      style={[messengerAndroidRoboto, messengerAndroidTimeStyle, style]}
      {...rest}
    >
      {content}
    </Text>
  );
}