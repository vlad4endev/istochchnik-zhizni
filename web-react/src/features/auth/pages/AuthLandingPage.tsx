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
      <div className="flex min-h-[100dvh] min-h-screen items-center justify-center bg-primary text-white">
        <p className="text-sm font-medium opacity-90">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] min-h-screen bg-gradient-to-b from-primary via-primary to-[#5c2830] text-white">
      <div className="mx-auto flex min-h-[100dvh] min-h-screen max-w-lg flex-col px-5 py-6 sm:px-6">
        <div className="flex-[3]" />

        <div className="flex flex-col items-center">
          <div
            className="flex h-28 w-28 items-center justify-center rounded-2xl bg-white/12 text-white"
            aria-hidden
          >
            <LatinCrossIcon className="h-14 w-14" aria-hidden />
          </div>

          <h1 className="mt-[18px] text-center text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
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
