import { AccessibilityControls } from '@/components/accessibility/AccessibilityControls';
import { useAccessibilitySettings } from '@/lib/accessibility/AccessibilityProvider';
import { LuUndo2 } from 'react-icons/lu';

const CARD =
  'rounded-3xl bg-[color:var(--profile-card-bg)] p-5 shadow-[0_10px_30px_rgba(28,25,23,0.08)] ring-1 ring-[color:var(--profile-card-ring)] backdrop-blur';
const LABEL = 'text-[11px] font-extrabold uppercase tracking-[0.14em] text-[color:var(--profile-text-soft)]';

export function ProfileAccessibilitySection() {
  const { resetA11y } = useAccessibilitySettings();

  return (
    <section className={CARD} aria-labelledby="profile-a11y-heading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p id="profile-a11y-heading" className={LABEL}>
            Доступность
          </p>
          <p className="mt-2 text-sm font-medium leading-snug text-[color:var(--profile-text-muted)]">
            Настройте контраст, размер текста и отображение страницы. Параметры сохраняются в этом браузере. Плавающая
            панель с теми же опциями доступна на всех экранах (иконка в углу).
          </p>
        </div>
        <button
          type="button"
          onClick={() => resetA11y()}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 self-start rounded-2xl border border-[color:var(--profile-card-ring)] bg-[color:color-mix(in_srgb,var(--profile-card-bg)_75%,var(--profile-surface))] px-4 text-[13px] font-extrabold text-[color:var(--profile-text-heading)] transition hover:bg-[color:var(--profile-border-light)]"
        >
          <LuUndo2 className="h-4 w-4" strokeWidth={2} aria-hidden />
          Сбросить
        </button>
      </div>

      <div className="mt-5 rounded-2xl bg-[color:color-mix(in_srgb,var(--profile-card-bg)_65%,var(--profile-surface))] p-4 ring-1 ring-[color:var(--profile-card-ring)]">
        <AccessibilityControls dense formIdPrefix="profile-a11y" />
      </div>
    </section>
  );
}
