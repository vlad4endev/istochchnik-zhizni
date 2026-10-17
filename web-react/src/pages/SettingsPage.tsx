import { Link } from 'react-router-dom';
import { LuChevronRight, LuSettings, LuUserRound } from 'react-icons/lu';
import { ThemeToggle } from '../components/ThemeToggle';
import { useAppearanceStore } from '../stores/useAppearanceStore';
import { useAccessibilitySettings } from '@/lib/accessibility/AccessibilityProvider';
import type { AccessibilityColorTheme } from '@/lib/accessibility/types';

const THEME_SWATCHES: {
  key: AccessibilityColorTheme;
  label: string;
  bg: string;
  border: string;
  dot: string;
  fg: string;
}[] = [
  { key: 'standard', label: 'Светлая', bg: '#f4f1ed', border: '#d6d3d1', dot: '#7d3640', fg: '#1c1917' },
  { key: 'sepia', label: 'Сепия', bg: '#f2e8d5', border: '#d9c9ab', dot: '#7d3640', fg: '#3d2b1f' },
  { key: 'dark', label: 'Тёмная', bg: 'linear-gradient(145deg,#111114 0%,#15151a 62%,#1b1b20 100%)', border: 'rgba(255,255,255,0.18)', dot: '#e895a0', fg: '#f4f3f7' },
  { key: 'high-contrast', label: 'Контраст', bg: '#000000', border: '#ffff00', dot: '#ffff00', fg: '#ffff00' },
  { key: 'blue', label: 'Синяя', bg: 'linear-gradient(145deg,#0b1628 0%,#0f2137 100%)', border: '#60a5fa', dot: '#93c5fd', fg: '#f8fafc' },
];

export function SettingsPage() {
  const { fontSize, setFontSize } = useAppearanceStore();
  const { state, patchA11y } = useAccessibilitySettings();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6">
      <section className="rounded-3xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4">
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--text)]">Настройки</h1>
          <p className="mt-1 text-sm font-medium text-[var(--text-secondary)]">
            Управление параметрами приложения и профиля.
          </p>
        </div>

        <div className="space-y-2 pb-2">
          <Link
            to="/profile"
            className="flex min-h-[52px] items-center justify-between rounded-2xl border border-stone-200/80 bg-[var(--surface)] px-4 py-3 hover:opacity-90"
          >
            <span className="inline-flex items-center gap-3 text-sm font-semibold text-[var(--text)]">
              <LuUserRound className="h-4 w-4" aria-hidden />
              Настройки профиля
            </span>
            <LuChevronRight className="h-4 w-4 text-[var(--text-muted)]" aria-hidden />
          </Link>

          <div className="flex min-h-[52px] items-center justify-between rounded-2xl border border-stone-200/80 bg-stone-50/50 px-4 py-3">
            <span className="inline-flex items-center gap-3 text-sm font-semibold text-[var(--text-secondary)]">
              <LuSettings className="h-4 w-4" aria-hidden />
              Общие настройки
            </span>
            <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)]">
              Скоро
            </span>
          </div>
        </div>

        <div className="space-y-6 pt-4">
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-[var(--text)]">Тема оформления</h3>
              <ThemeToggle />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {THEME_SWATCHES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => patchA11y({ colorTheme: t.key })}
                  aria-pressed={state.colorTheme === t.key}
                  className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-3 transition-all ${
                    state.colorTheme === t.key ? 'border-[var(--primary)]' : 'border-transparent bg-[var(--surface)]'
                  }`}
                >
                  {/* Превью задаём цветами напрямую: оно должно выглядеть одинаково в любой активной теме. */}
                  <div
                    className="relative h-8 w-12 overflow-hidden rounded-lg border"
                    style={{ background: t.bg, borderColor: t.border }}
                  >
                    <span
                      className="absolute left-2 top-2 h-1.5 w-1.5 rounded-full"
                      style={{ background: t.dot }}
                    />
                    <span
                      className="absolute bottom-1.5 left-2 text-[0.5rem] font-semibold"
                      style={{ color: t.fg }}
                    >
                      Aa
                    </span>
                  </div>
                  <span className="text-xs text-[var(--text-secondary)]">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-1 text-base font-semibold text-[var(--text)]">Размер текста</h3>
            <p className="mb-3 text-sm text-[var(--text-secondary)]">Влияет на весь текст в приложении</p>
            <div className="flex items-center gap-3 rounded-2xl bg-[var(--surface)] p-1">
              {([
                { key: 'small', label: 'А', textClass: 'text-xs' },
                { key: 'normal', label: 'А', textClass: 'text-sm' },
                { key: 'large', label: 'А', textClass: 'text-base' },
                { key: 'xlarge', label: 'А', textClass: 'text-lg' },
              ] as const).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFontSize(f.key)}
                  className={`flex-1 rounded-xl py-2 font-semibold transition-all ${f.textClass} ${
                    fontSize === f.key
                      ? 'bg-[var(--primary)] text-[var(--text-on-primary)] shadow-sm'
                      : 'text-[var(--text-secondary)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <p className="mt-3 rounded-xl bg-[var(--surface)] p-3 text-sm text-[var(--text-secondary)]">
              Пример текста молитвы при данном размере шрифта. Текст адаптируется по всему приложению.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
