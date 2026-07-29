import type { ReactNode } from 'react';
import { LuCheck, LuCircleAlert } from 'react-icons/lu';

export function fieldClass() {
  return (
    'w-full rounded-xl border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none ' +
    'focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-stone-400'
  );
}

export function btnPrimary(className = '') {
  return `inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:opacity-95 disabled:opacity-50 ${className}`;
}

export function btnSecondary(className = '') {
  return `inline-flex items-center justify-center rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50 ${className}`;
}

export function normalizeUiString(value: string): string | null {
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export function normalizeUiOptionalUpdateString(value: string): string | undefined {
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

export function insertAtCursor(
  textarea: HTMLTextAreaElement | null,
  token: string,
  current: string,
  setValue: (next: string) => void,
) {
  if (!textarea) {
    setValue(current + token);
    return;
  }
  const start = textarea.selectionStart ?? current.length;
  const end = textarea.selectionEnd ?? current.length;
  const next = `${current.slice(0, start)}${token}${current.slice(end)}`;
  setValue(next);
  requestAnimationFrame(() => {
    textarea.focus();
    const pos = start + token.length;
    textarea.setSelectionRange(pos, pos);
  });
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-stone-900">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-stone-500">{hint}</span> : null}
      </span>
      <span className="relative inline-block h-6 w-11 shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="absolute inset-0 cursor-pointer rounded-full bg-stone-300 transition-colors peer-checked:bg-[#7B2D3F]" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function StatusNote({
  note,
}: {
  note: { type: 'ok' | 'err'; text: string } | null;
}) {
  if (!note) return null;
  return (
    <div
      role="status"
      className={
        note.type === 'ok'
          ? 'rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'
          : 'rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900'
      }
    >
      {note.text}
    </div>
  );
}

export function PanelIntro({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 max-w-2xl">
        <h3 className="text-base font-semibold text-stone-900">{title}</h3>
        {children ? <div className="mt-1 text-sm leading-relaxed text-stone-500">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function StepBlock({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start gap-3">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#7B2D3F] text-xs font-bold text-white"
          aria-hidden
        >
          {n}
        </span>
        <div className="min-w-0 pt-0.5">
          <h4 className="text-sm font-semibold text-stone-900">{title}</h4>
          {hint ? <p className="mt-0.5 text-xs leading-relaxed text-stone-500">{hint}</p> : null}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function StatusChip({
  ok,
  okLabel,
  badLabel,
  warn,
}: {
  ok: boolean;
  okLabel: string;
  badLabel: string;
  warn?: boolean;
}) {
  const tone = ok
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : warn
      ? 'border-amber-200 bg-amber-50 text-amber-900'
      : 'border-stone-200 bg-stone-50 text-stone-600';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tone}`}>
      {ok ? <LuCheck className="h-3 w-3" aria-hidden /> : warn ? <LuCircleAlert className="h-3 w-3" aria-hidden /> : null}
      {ok ? okLabel : badLabel}
    </span>
  );
}

export function SetupStepRow({
  done,
  title,
  hint,
  actionLabel,
  onAction,
}: {
  done: boolean;
  title: string;
  hint: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
        done ? 'border-emerald-200/80 bg-emerald-50/40' : 'border-stone-200 bg-white'
      }`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
            done ? 'bg-emerald-600 text-white' : 'bg-stone-200 text-stone-600'
          }`}
          aria-hidden
        >
          {done ? <LuCheck className="h-3.5 w-3.5" strokeWidth={3} /> : null}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-stone-900">{title}</p>
          <p className="mt-0.5 text-xs text-stone-500">{hint}</p>
        </div>
      </div>
      {!done && actionLabel && onAction ? (
        <button
          type="button"
          className="shrink-0 text-sm font-semibold text-[#7B2D3F] underline-offset-2 hover:underline"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
