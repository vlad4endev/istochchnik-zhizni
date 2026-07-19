import { LuChevronLeft } from 'react-icons/lu';
import { useLocation, useNavigate } from 'react-router-dom';

type LocationBackState = {
  backTo?: unknown;
  backLabel?: unknown;
};

/**
 * Кнопка возврата для публичных/share-страниц программы служения
 * (вне Layout — иначе пользователь «застревает» после перехода из чата).
 */
export function SharePlanBackBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state ?? null) as LocationBackState | null;
  const backTo =
    typeof state?.backTo === 'string' && state.backTo.startsWith('/') ? state.backTo : null;
  const backLabel =
    typeof state?.backLabel === 'string' && state.backLabel.trim()
      ? state.backLabel.trim()
      : 'Назад';

  function handleBack(): void {
    if (backTo) {
      navigate(backTo);
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/dashboard');
  }

  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex min-h-11 items-center gap-0.5 rounded-lg py-2 pr-2 text-sm font-semibold text-sky-700 transition-colors hover:bg-sky-50 active:bg-sky-100 dark:text-sky-400 dark:hover:bg-sky-950/40"
        aria-label={backLabel}
      >
        <LuChevronLeft className="h-5 w-5 shrink-0" strokeWidth={2.2} aria-hidden />
        <span>{backLabel}</span>
      </button>
    </div>
  );
}
