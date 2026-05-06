import { Link } from 'react-router-dom';
import { LuChevronRight, LuSettings, LuUserRound } from 'react-icons/lu';
import { ThemeToggle } from '../components/ThemeToggle';
import { useAppearanceStore } from '../stores/useAppearanceStore';
import { useAccessibilitySettings } from '@/lib/accessibility/AccessibilityProvider';
import type { AccessibilityColorTheme } from '@/lib/accessibility/types';

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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([
                { key: 'standard', label: 'Светлая', preview: 'bg-white border-gray-200' },
                {
                  key: 'dark',
                  label: 'Тёмная',
                  preview:
                    'border-[rgba(255,255,255,0.12)] bg-[linear-gradient(145deg,#111114_0%,#15151a_62%,#1b1b20_100%)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]',
                },
                { key: 'high-contrast', label: 'Контраст', preview: 'bg-black border-yellow-300' },
                { key: 'blue', label: 'Синяя', preview: 'bg-gradient-to-br from-[#0b1628] to-[#0f2137] border-[#60a5fa]' },
              ] as const).map((t: { key: AccessibilityColorTheme; label: string; preview: string }) => (
                <button
                  key={t.key}
                  onClick={() => patchA11y({ colorTheme: t.key })}
                  className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-3 transition-all ${
                    state.colorTheme === t.key ? 'border-[var(--primary)]' : 'border-transparent bg-[var(--surface)]'
                  }`}
                >
                  <div className={`relative h-8 w-12 overflow-hidden rounded-lg border ${t.preview}`}>
                    {t.key !== 'standard' ? (
                      <>
                        <span className="absolute left-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--primary)] shadow-[0_0_8px_var(--primary)]" />
                        <span className="absolute bottom-1.5 left-2 text-[0.5rem] font-semibold text-white/95">Aa</span>
                      </>
                    ) : null}
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
