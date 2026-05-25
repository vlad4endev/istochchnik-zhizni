import { IntegerTextInput, type IntegerTextInputProps } from '@/components/IntegerTextInput';

const DEFAULT_MIN = 1;
const DEFAULT_MAX = 180;

export type DurationMinutesInputProps = Omit<IntegerTextInputProps, 'min' | 'max'> & {
  min?: number;
  max?: number;
};

/** Длительность блока служения (минуты), 1–180. */
export function DurationMinutesInput({
  min = DEFAULT_MIN,
  max = DEFAULT_MAX,
  maxDigits = 3,
  ...props
}: DurationMinutesInputProps) {
  return <IntegerTextInput min={min} max={max} maxDigits={maxDigits} {...props} />;
}
