import { useState, type ReactNode } from 'react';
import { LuChevronDown, LuChevronUp } from 'react-icons/lu';

type Props = {
  title?: string;
  count?: number | null;
  defaultOpen?: boolean;
  children: ReactNode;
};

/** Сворачиваемая оболочка блока «Участники трансляции» (планировщик и share). */
export function CollapsibleBroadcastTeamShell({
  title = 'Участники трансляции',
  count = null,
  defaultOpen = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  const collapsedHint =
    count == null ? null : count > 0 ? String(count) : 'нет назначений';

  return (
    <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full min-h-[28px] items-center justify-between gap-2 text-left"
        aria-expanded={open}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-stone-600">{title}</span>
          {!open && collapsedHint ? (
            <span className="rounded-full bg-stone-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">
              {collapsedHint}
            </span>
          ) : null}
        </span>
        {open ? (
          <LuChevronUp className="h-3.5 w-3.5 shrink-0 text-stone-500" aria-hidden />
        ) : (
          <LuChevronDown className="h-3.5 w-3.5 shrink-0 text-stone-500" aria-hidden />
        )}
      </button>
      {open ? <div className="mt-1.5">{children}</div> : null}
    </div>
  );
}
