import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

type Common = {
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
  trailing?: ReactNode;
};

export type AppFieldProps = Common &
  InputHTMLAttributes<HTMLInputElement> & {
    multiline?: false;
  };

export type AppTextAreaProps = Common &
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    multiline: true;
  };

export function AppField(props: AppFieldProps | AppTextAreaProps) {
  const { label, hint, error, className = '', trailing, multiline, ...rest } = props;
  const id = 'id' in rest && typeof rest.id === 'string' ? rest.id : undefined;

  return (
    <label className={['flex w-full flex-col gap-1.5', className].filter(Boolean).join(' ')}>
      {label ? (
        <span className="font-ui text-[13px] font-semibold text-ink">{label}</span>
      ) : null}
      <span className="relative block w-full">
        {multiline ? (
          <textarea
            className="app-field w-full min-h-[96px] resize-y py-3"
            aria-invalid={Boolean(error)}
            {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <input
            className={['app-field w-full', trailing ? 'pr-11' : ''].filter(Boolean).join(' ')}
            aria-invalid={Boolean(error)}
            {...(rest as InputHTMLAttributes<HTMLInputElement>)}
          />
        )}
        {trailing ? (
          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">{trailing}</span>
        ) : null}
      </span>
      {error ? (
        <span className="font-ui text-[12px] font-medium text-wine" id={id ? `${id}-error` : undefined}>
          {error}
        </span>
      ) : hint ? (
        <span className="font-ui text-[12px] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}
