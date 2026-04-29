import { Link } from 'react-router-dom';
import { LuChevronRight, LuSettings, LuUserRound } from 'react-icons/lu';

export function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-4 sm:px-6">
      <section className="rounded-3xl border border-stone-200/80 bg-white p-5 shadow-[var(--shadow-card)]">
        <div className="mb-4">
          <h1 className="text-2xl font-extrabold tracking-tight text-stone-900">Настройки</h1>
          <p className="mt-1 text-sm font-medium text-stone-500">
            Управление параметрами приложения и профиля.
          </p>
        </div>

        <div className="space-y-2">
          <Link
            to="/profile"
            className="flex min-h-[52px] items-center justify-between rounded-2xl border border-stone-200/80 bg-stone-50/70 px-4 py-3 hover:bg-stone-100/80"
          >
            <span className="inline-flex items-center gap-3 text-sm font-semibold text-stone-800">
              <LuUserRound className="h-4 w-4" aria-hidden />
              Настройки профиля
            </span>
            <LuChevronRight className="h-4 w-4 text-stone-400" aria-hidden />
          </Link>

          <div className="flex min-h-[52px] items-center justify-between rounded-2xl border border-stone-200/80 bg-stone-50/50 px-4 py-3">
            <span className="inline-flex items-center gap-3 text-sm font-semibold text-stone-700">
              <LuSettings className="h-4 w-4" aria-hidden />
              Общие настройки
            </span>
            <span className="rounded-full bg-stone-200/80 px-2 py-0.5 text-[11px] font-bold text-stone-700">
              Скоро
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
