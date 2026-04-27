import { LuChevronRight, LuX } from 'react-icons/lu';
import { useNavigate } from 'react-router-dom';

type ManageScreenShellProps = {
  children: React.ReactNode;
  /** Например кнопка «Добавить» на экране участников */
  trailing?: React.ReactNode;
};

/**
 * Общий фон и навигация для экранов «управление чатом» (только мессенджер).
 * Не используется в основном профиле приложения (/profile).
 */
export function ManageScreenShell({ children, trailing }: ManageScreenShellProps) {
  const navigate = useNavigate();

  return (
    <div className="w-full bg-[#F2F2F7] pb-4">
      <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-3 md:max-w-2xl md:px-6 lg:max-w-3xl">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex min-h-[44px] max-w-[50%] items-center gap-0.5 rounded-lg py-2 pl-1 pr-2 text-[17px] leading-none text-blue-500 transition-colors active:bg-black/[0.04]"
          >
            <LuChevronRight className="h-[22px] w-[22px] shrink-0 rotate-180" strokeWidth={2.2} aria-hidden />
            <span className="truncate font-normal">Назад</span>
          </button>
          <div className="flex min-w-0 shrink-0 items-center gap-1.5">
            {trailing}
            <button
              type="button"
              onClick={() => navigate('/messenger')}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 py-2 text-sm font-medium text-gray-600 transition-colors active:bg-black/[0.04]"
              aria-label="Закрыть мессенджер"
            >
              <LuX className="h-5 w-5 shrink-0" strokeWidth={2.2} aria-hidden />
              <span className="hidden sm:inline">Закрыть</span>
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Белая группа строк как в iOS Settings */
export function ManageSettingsGroup({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={[
        'overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-black/[0.06]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
