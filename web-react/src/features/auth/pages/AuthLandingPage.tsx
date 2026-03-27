import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

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
      <div className="flex min-h-screen items-center justify-center bg-primary text-white">
        <p className="text-sm font-medium opacity-90">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-primary text-white">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col px-6 py-[18px]">
        <div className="flex-[3]" />

        <div className="flex flex-col items-center">
          <div
            className="flex h-28 w-28 items-center justify-center rounded-2xl bg-white/12"
            aria-hidden
          >
            <span className="text-5xl leading-none">✝</span>
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

        <div className="pb-[env(safe-area-inset-bottom)]">
          <Link
            to="/login/form"
            state={{ mode: 'signIn' as const }}
            className="flex h-[54px] w-full items-center justify-center rounded-xl bg-white text-center text-base font-bold text-primary shadow-sm transition-opacity hover:opacity-95"
          >
            Войти
          </Link>
          <Link
            to="/login/form"
            state={{ mode: 'signUp' as const }}
            className="mt-3 flex h-[54px] w-full items-center justify-center rounded-xl bg-[#9E4A55] text-center text-base font-bold text-white shadow-sm transition-opacity hover:opacity-95"
          >
            Зарегистрироваться
          </Link>
        </div>
      </div>
    </div>
  );
}
