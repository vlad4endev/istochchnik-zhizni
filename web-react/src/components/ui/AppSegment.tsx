export type AppSegmentOption<T extends string> = {
  value: T;
  label: string;
};

export type AppSegmentProps<T extends string> = {
  value: T;
  options: readonly AppSegmentOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
};

/** Segmented control (e.g. song theme Чёрная / Тёмная / Светлая). */
export function AppSegment<T extends string>({
  value,
  options,
  onChange,
  className = '',
  ariaLabel,
}: AppSegmentProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={[
        'inline-flex w-full min-h-field items-stretch gap-1 rounded-field border border-[color:var(--border)] bg-[color:var(--bg-elevated)] p-1',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(opt.value)}
            className={[
              'min-w-0 flex-1 truncate rounded-[12px] px-2 py-2 font-ui text-[13px] font-bold transition-colors tap-highlight-transparent whitespace-nowrap',
              selected
                ? 'bg-card text-ink shadow-card'
                : 'text-muted hover:text-ink',
            ].join(' ')}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
