import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { LatinCrossIcon } from '../../../components/LatinCrossIcon';
import { useAuthHydrated } from '../../../hooks/useAuthHydrated';
import { useAuthStore } from '../authStore';

const DEFAULT_APP_NAME = 'МОЯ ЦЕРКОВЬ';
const DEFAULT_DESCRIPTION = 'Молитвенный календарь церкви';

export function AuthLandingPage() {
  const navigate = useNavigate();
  const hydrated = useAuthHydrated();
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!hydrated) return;
    if (token) {
      navigate('/', { replace: true });
    }
  }, [hydrated, token, navigate]);

  if (!hydrated) {
    return (
      <div className="flex min-h-[100dvh] min-h-screen w-full max-w-[100vw] items-center justify-center bg-primary text-white">
        <p className="text-sm font-medium opacity-90">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] min-h-screen w-full max-w-[100vw] bg-gradient-to-b from-primary via-primary to-[#5c2830] text-white">
      <div className="mx-auto flex min-h-[100dvh] min-h-screen w-full max-w-lg flex-col py-6 [padding-left:max(1.25rem,env(safe-area-inset-left,0px))] [padding-right:max(1.25rem,env(safe-area-inset-right,0px))] sm:py-6">
        <div className="flex-[3]" />

        <div className="flex flex-col items-center">
          <div
            className="flex h-44 w-44 shrink-0 items-center justify-center rounded-3xl bg-white/15 p-3 text-white shadow-[0_12px_40px_rgba(0,0,0,0.2)] ring-1 ring-white/25 sm:h-52 sm:w-52 sm:p-4"
            aria-hidden
          >
            <LatinCrossIcon className="h-[9.5rem] w-[9.5rem] sm:h-44 sm:w-44" aria-hidden />
          </div>

          <h1 className="mt-9 text-center text-2xl font-extrabold tracking-tight text-white sm:mt-10 sm:text-3xl md:text-4xl">
            {DEFAULT_APP_NAME}
          </h1>

          {DEFAULT_DESCRIPTION.trim().length > 0 && (
            <p className="mt-2.5 text-center text-sm leading-snug text-white/88 sm:text-base">
              {DEFAULT_DESCRIPTION}
            </p>
          )}
        </div>

        <div className="flex-[4]" />

        <div className="pb-1">
          <Link
            to="/login/form"
            state={{ mode: 'signIn' as const }}
            className="touch-manipulation flex h-14 w-full items-center justify-center rounded-2xl bg-white text-center text-base font-bold text-primary shadow-lg shadow-stone-900/15 transition-[transform,opacity] active:scale-[0.98] hover:opacity-95"
          >
            Войти
          </Link>
          <Link
            to="/login/form"
            state={{ mode: 'signUp' as const }}
            className="touch-manipulation mt-3 flex h-14 w-full items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-center text-base font-bold text-white shadow-inner backdrop-blur-sm transition-[transform,opacity] active:scale-[0.98] hover:bg-white/15"
          >
            Зарегистрироваться
          </Link>
        </div>
      </div>
    </div>
  );
}
