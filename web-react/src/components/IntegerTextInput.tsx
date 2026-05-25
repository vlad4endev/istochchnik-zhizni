import { useState } from 'react';

function digitsOnly(raw: string, maxDigits: number): string {
  return raw.replace(/\D/g, '').slice(0, maxDigits);
}

function commitInteger(text: string, min: number, max: number): number {
  const digits = digitsOnly(text, 12);
  if (digits === '') return min;
  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

type InnerProps = Omit<IntegerTextInputProps, 'syncKey'>;

function IntegerTextInputInner({
  id,
  value,
  onChange,
  className,
  placeholder,
  disabled,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  maxDigits = 6,
  inputClassName,
}: InnerProps) {
  const [text, setText] = useState(() => String(value));

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      enterKeyHint="done"
      disabled={disabled}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const nextText = digitsOnly(e.target.value, maxDigits);
        setText(nextText);
        if (nextText === '') return;
        const parsed = Number(nextText);
        if (!Number.isFinite(parsed)) return;
        onChange(Math.min(max, parsed));
      }}
      onBlur={() => {
        const committed = commitInteger(text, min, max);
        setText(String(committed));
        if (committed !== value) onChange(committed);
      }}
      className={inputClassName ?? className}
    />
  );
}

export type IntegerTextInputProps = {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  /** Сброс локального текста при смене сущности (id блока, индекс строки и т.д.). */
  syncKey: number | string;
  className?: string;
  /** Алиас className для полей в сетке с отдельным label. */
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  maxDigits?: number;
};

/**
 * Целое число без type="number": при value={n} и Number('') || 1 первая цифра «залипает»,
 * нельзя нормально набрать, например, 145.
 */
export function IntegerTextInput({ syncKey, ...props }: IntegerTextInputProps) {
  return <IntegerTextInputInner key={syncKey} {...props} />;
}
