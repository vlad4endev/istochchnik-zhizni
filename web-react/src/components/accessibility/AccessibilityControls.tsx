import {
  A11Y_FONT_MAX,
  A11Y_FONT_MIN,
  A11Y_FONT_STEP,
  A11Y_LINE_MAX,
  A11Y_LINE_MIN,
  A11Y_LINE_STEP,
} from '@/lib/accessibility/constants';
import { useAccessibilitySettings } from '@/lib/accessibility/AccessibilityProvider';
import type { AccessibilityColorTheme } from '@/lib/accessibility/types';
import {
  LuCircle,
  LuContrast,
  LuImageOff,
  LuMinus,
  LuMoon,
  LuMousePointer2,
  LuPalette,
  LuPlus,
  LuSun,
  LuType,
} from 'react-icons/lu';

const THEMES: { id: AccessibilityColorTheme; label: string; hint: string }[] = [
  { id: 'standard', label: 'Стандарт', hint: 'Светлая тема приложения' },
  { id: 'dark', label: 'Тёмная', hint: 'Приглушённые фоны' },
  { id: 'high-contrast', label: 'Контраст', hint: 'Жёлтый текст на чёрном' },
  { id: 'blue', label: 'Синяя', hint: 'Светлый текст на тёмно-синем' },
];

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function roundStep(n: number, step: number): number {
  return Math.round(n / step) * step;
}

type Props = {
  /** Компактная раскладка для страницы профиля */
  dense?: boolean;
  /** Темы в один столбец (узкие шапки / мобильный sheet) */
  stackThemes?: boolean;
  /** id префикс для связи label/inputs */
  formIdPrefix?: string;
};

export function AccessibilityControls({ dense, stackThemes, formIdPrefix = 'a11y' }: Props) {
  const { state, patchA11y } = useAccessibilitySettings();
  const gid = (s: string) => `${formIdPrefix}-${s}`;

  const fontPct = Math.round(state.fontScale * 100);

  const themeGridClass = dense
    ? 'grid grid-cols-2 gap-2 sm:grid-cols-4'
    : stackThemes
      ? 'grid grid-cols-1 gap-2 sm:grid-cols-2'
      : 'grid grid-cols-1 min-[340px]:grid-cols-2 gap-2';

  return (
    <div className={dense ? 'grid min-w-0 gap-5' : 'grid min-w-0 gap-4'}>
      <div className="grid min-w-0 gap-2">
        <p id={gid('theme-label')} className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-stone-500">
          Тема оформления
        </p>
        <div className={themeGridClass} role="radiogroup" aria-labelledby={gid('theme-label')}>
          {THEMES.map((t) => {
            const selected = state.colorTheme === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={selected}
                title={t.hint}
                onClick={() => patchA11y({ colorTheme: t.id })}
                className={[
                  'flex min-h-[44px] w-full min-w-0 items-center justify-center gap-2 rounded-2xl border px-2.5 py-2.5 text-left text-[13px] font-bold transition sm:px-3',
                  selected
                    ? 'border-[color:var(--primary)] bg-[color:color-mix(in_srgb,var(--primary)_12%,var(--surface-elevated))] text-[color:var(--text)] shadow-sm'
                    : 'border-stone-200/90 bg-white/50 text-stone-700 hover:bg-white/80',
                ].join(' ')}
              >
                {t.id === 'standard' ? (
                  <LuSun className="h-4 w-4 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
                ) : t.id === 'dark' ? (
                  <LuMoon className="h-4 w-4 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
                ) : t.id === 'high-contrast' ? (
                  <LuCircle className="h-4 w-4 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
                ) : (
                  <LuPalette className="h-4 w-4 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
                )}
                <span className="min-w-0 leading-tight">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid min-w-0 gap-2">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <label id={gid('font-label')} htmlFor={gid('font-range')} className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-stone-500">
            <LuType className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Размер текста
          </label>
          <span className="text-sm font-extrabold tabular-nums text-stone-800" aria-live="polite">
            {fontPct}%
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-stone-200/90 bg-white/70 text-stone-800 shadow-sm backdrop-blur transition hover:bg-white"
            aria-label="Уменьшить размер текста"
            onClick={() =>
              patchA11y({
                fontScale: roundStep(
                  clamp(state.fontScale - A11Y_FONT_STEP, A11Y_FONT_MIN, A11Y_FONT_MAX),
                  A11Y_FONT_STEP,
                ),
              })
            }
          >
            <LuMinus className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
          <input
            id={gid('font-range')}
            type="range"
            min={A11Y_FONT_MIN}
            max={A11Y_FONT_MAX}
            step={A11Y_FONT_STEP}
            value={state.fontScale}
            aria-labelledby={gid('font-label')}
            aria-valuemin={A11Y_FONT_MIN}
            aria-valuemax={A11Y_FONT_MAX}
            aria-valuenow={state.fontScale}
            aria-valuetext={`${fontPct} процентов`}
            onChange={(e) => patchA11y({ fontScale: Number(e.target.value) })}
            className="h-2 min-h-[44px] w-full flex-1 cursor-pointer accent-[color:var(--primary)]"
          />
          <button
            type="button"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-stone-200/90 bg-white/70 text-stone-800 shadow-sm backdrop-blur transition hover:bg-white"
            aria-label="Увеличить размер текста"
            onClick={() =>
              patchA11y({
                fontScale: roundStep(
                  clamp(state.fontScale + A11Y_FONT_STEP, A11Y_FONT_MIN, A11Y_FONT_MAX),
                  A11Y_FONT_STEP,
                ),
              })
            }
          >
            <LuPlus className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>

      <div className="grid gap-2">
        <label htmlFor={gid('line-range')} className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-stone-500">
          Межстрочный интервал ({state.lineHeight.toFixed(2)})
        </label>
        <input
          id={gid('line-range')}
          type="range"
          min={A11Y_LINE_MIN}
          max={A11Y_LINE_MAX}
          step={A11Y_LINE_STEP}
          value={state.lineHeight}
          aria-valuemin={A11Y_LINE_MIN}
          aria-valuemax={A11Y_LINE_MAX}
          aria-valuenow={state.lineHeight}
          onChange={(e) => patchA11y({ lineHeight: Number(e.target.value) })}
          className="h-2 min-h-[44px] w-full cursor-pointer accent-[color:var(--primary)]"
        />
      </div>

      <div className={dense ? 'grid grid-cols-1 gap-2 sm:grid-cols-3' : 'grid gap-2'}>
        <button
          type="button"
          aria-pressed={state.monochrome}
          onClick={() => patchA11y({ monochrome: !state.monochrome })}
          className={[
            'flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-[13px] font-bold transition',
            state.monochrome
              ? 'border-[color:var(--primary)] bg-[color:color-mix(in_srgb,var(--primary)_14%,var(--surface-elevated))]'
              : 'border-stone-200/90 bg-white/55 backdrop-blur hover:bg-white/80',
          ].join(' ')}
        >
          <LuContrast className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Монохром
        </button>
        <button
          type="button"
          aria-pressed={state.largeCursor}
          onClick={() => patchA11y({ largeCursor: !state.largeCursor })}
          className={[
            'flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-[13px] font-bold transition',
            state.largeCursor
              ? 'border-[color:var(--primary)] bg-[color:color-mix(in_srgb,var(--primary)_14%,var(--surface-elevated))]'
              : 'border-stone-200/90 bg-white/55 backdrop-blur hover:bg-white/80',
          ].join(' ')}
        >
          <LuMousePointer2 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Крупный курсор
        </button>
        <button
          type="button"
          aria-pressed={state.hideImages}
          onClick={() => patchA11y({ hideImages: !state.hideImages })}
          className={[
            'flex min-h-[48px] items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-[13px] font-bold transition',
            state.hideImages
              ? 'border-[color:var(--primary)] bg-[color:color-mix(in_srgb,var(--primary)_14%,var(--surface-elevated))]'
              : 'border-stone-200/90 bg-white/55 backdrop-blur hover:bg-white/80',
          ].join(' ')}
        >
          <LuImageOff className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Без картинок
        </button>
      </div>
    </div>
  );
}
