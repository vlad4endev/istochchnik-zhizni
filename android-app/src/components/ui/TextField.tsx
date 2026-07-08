import {TextInput as RNTextInput, type TextInputProps} from 'react-native';

export function TextField(props: TextInputProps) {
  return (
    <RNTextInput
      className="rounded-lg border border-stone-300 bg-white px-3 py-3 text-base text-stone-900"
      placeholderTextColor="#a8a29e"
      {...props}
    />
  );
}
