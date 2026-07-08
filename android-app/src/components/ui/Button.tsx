import {Pressable, Text, type PressableProps} from 'react-native';

interface ButtonProps extends PressableProps {
  title: string;
  variant?: 'primary' | 'ghost';
}

export function Button({title, variant = 'primary', disabled, ...rest}: ButtonProps) {
  const base = 'rounded-lg px-4 py-3 items-center';
  const variantClass =
    variant === 'primary'
      ? 'bg-primary active:opacity-90'
      : 'bg-stone-200 active:opacity-80';
  const textClass = variant === 'primary' ? 'text-white font-semibold' : 'text-stone-800 font-medium';

  return (
    <Pressable
      className={`${base} ${variantClass} ${disabled ? 'opacity-50' : ''}`}
      disabled={disabled}
      {...rest}>
      <Text className={textClass}>{title}</Text>
    </Pressable>
  );
}
