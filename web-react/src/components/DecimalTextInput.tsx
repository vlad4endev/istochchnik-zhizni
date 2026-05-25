import { useState } from 'react';

function normalizeDraft(raw: string, maxFractionDigits: number): string {
  const t = raw.replace(',', '.').replace(/[^\d.]/g, '');
  const parts = t.split('.');
  if (parts.length <= 1) return parts[0] ?? '';
  const head = parts[0] ?? '';
  const frac = (parts[1] ?? '').slice(0, maxFractionDigits);
  return frac.length > 0 ? `${head}.${frac}` : head.length > 0 ? `${head}.` : '';
}

function commitDecimal(text: string, min: number, max: number, maxFractionDigits: number): number {
  const draft = normalizeDraft(text, maxFractionDigits);
  if (draft === '' || draft === '.') return min;
  const parsed = Number(draft);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

type InnerProps = Omit<DecimalTextInputProps, 'syncKey'>;

function DecimalTextInputInner({
  id,
  value,
  onChange,
  className,
  placeholder,
  disabled,
  min = 0,
  max = 999,
  maxFractionDigits = 2,
}: InnerProps) {
  const [text, setText] = useState(() => String(value));

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      enterKeyHint="done"
      disabled={disabled}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const nextText = normalizeDraft(e.target.value, maxFractionDigits);
        setText(nextText);
        if (nextText === '' || nextText === '.') return;
        const parsed = Number(nextText);
        if (!Number.isFinite(parsed)) return;
        onChange(Math.min(max, parsed));
      }}
      onBlur={() => {
        const committed = commitDecimal(text, min, max, maxFractionDigits);
        setText(String(committed));
        if (committed !== value) onChange(committed);
      }}
      className={className}
    />
  );
}

export type DecimalTextInputProps = {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  syncKey: number | string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  maxFractionDigits?: number;
};

/** Дробное число без type="number" (temperature, проценты и т.п.). */
export function DecimalTextInput({ syncKey, ...props }: DecimalTextInputProps) {
  return <DecimalTextInputInner key={syncKey} {...props} />;
}
