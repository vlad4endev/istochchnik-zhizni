export type AppSwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
};

export function AppSwitch({ checked, onChange, label, disabled, className = '', id }: AppSwitchProps) {
  return (
    <label
      className={['inline-flex min-h-list-row cursor-pointer items-center gap-3', disabled ? 'opacity-50' : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'relative h-8 w-[52px] shrink-0 rounded-full transition-colors tap-highlight-transparent',
          checked ? 'bg-wine' : 'bg-[color:var(--border-hover)]',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[20px]' : 'translate-x-0',
          ].join(' ')}
          aria-hidden
        />
      </button>
      {label ? <span className="min-w-0 font-ui text-[15px] font-medium text-ink">{label}</span> : null}
    </label>
  );
}
