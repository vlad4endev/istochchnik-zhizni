import { LuCheck, LuCircle, LuLoader, LuMusic2 } from 'react-icons/lu';

import {
  PHOTO_AI_BUSY_TITLE,
  PHOTO_AI_DONE_MESSAGE,
  PHOTO_AI_PROGRESS_STEPS,
} from './photoAiProgress';

type Phase = 'idle' | 'running' | 'done';

type Props = {
  phase: Phase;
  /** Активный шаг (0 … steps-1) во время running; при done — steps.length */
  activeStep: number;
};

export function PhotoAiProgressPanel({ phase, activeStep }: Props) {
  if (phase === 'idle') return null;

  const steps = PHOTO_AI_PROGRESS_STEPS;
  const total = steps.length;
  const isDone = phase === 'done';
  const progressPct = isDone
    ? 100
    : Math.min(95, Math.round(((activeStep + 0.55) / total) * 100));

  const currentMessage = isDone
    ? PHOTO_AI_DONE_MESSAGE
    : (steps[Math.min(activeStep, total - 1)]?.message ?? '');

  return (
    <div
      className="rounded-xl border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] p-4 shadow-sm"
      role="status"
      aria-live="polite"
      aria-busy={phase === 'running'}
    >
      <div className="mb-3 flex items-start gap-3">
        <span
          className={[
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            isDone
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : 'bg-[color-mix(in_srgb,var(--studio-editor-accent)_18%,transparent)] text-[var(--studio-editor-accent)]',
          ].join(' ')}
          aria-hidden
        >
          {isDone ? <LuCheck className="h-5 w-5" /> : <LuMusic2 className="h-5 w-5 animate-pulse" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--studio-editor-text)]">
            {isDone ? 'Готово!' : PHOTO_AI_BUSY_TITLE}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--studio-editor-mute)]">{currentMessage}</p>
        </div>
      </div>

      <div
        className="mb-4 h-2 overflow-hidden rounded-full bg-[var(--studio-editor-bg)]"
        aria-hidden
      >
        <div
          className={[
            'h-full rounded-full transition-[width] duration-700 ease-out',
            isDone ? 'bg-emerald-500' : 'bg-[var(--studio-editor-accent)]',
          ].join(' ')}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <ol className="space-y-2">
        {steps.map((step, idx) => {
          const completed = isDone || idx < activeStep;
          const current = !isDone && idx === activeStep;
          return (
            <li
              key={step.id}
              className={[
                'flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors',
                current ? 'bg-[color-mix(in_srgb,var(--studio-editor-accent)_10%,transparent)]' : '',
              ].join(' ')}
            >
              <span className="mt-0.5 shrink-0" aria-hidden>
                {completed ? (
                  <LuCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                ) : current ? (
                  <LuLoader className="h-4 w-4 animate-spin text-[var(--studio-editor-accent)]" />
                ) : (
                  <LuCircle className="h-4 w-4 text-[var(--studio-editor-mute)] opacity-40" />
                )}
              </span>
              <span className="min-w-0">
                <span
                  className={[
                    'font-medium',
                    completed
                      ? 'text-[var(--studio-editor-text)]'
                      : current
                        ? 'text-[var(--studio-editor-accent)]'
                        : 'text-[var(--studio-editor-mute)]',
                  ].join(' ')}
                >
                  {step.label}
                </span>
                {current ? (
                  <span className="mt-0.5 block text-xs leading-snug text-[var(--studio-editor-mute)]">
                    {step.message}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
