import { useEffect, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useAuthSessionReady } from '../../../hooks/useAuthSessionReady';
import { defaultPostLoginPath } from '../../../lib/appVariant';
import { useAuthStore } from '../authStore';
import { AppSplash } from '@/components/AppSplash';

const DEFAULT_APP_NAME = 'МОЯ ЦЕРКОВЬ';
const DEFAULT_DESCRIPTION = 'Цифровая платформа';

export function AuthLandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const sessionReady = useAuthSessionReady();
  const token = useAuthStore((s) => s.token);
  const fromState =
    typeof (location.state as { from?: string } | null)?.from === 'string'
      ? ((location.state as { from?: string } | null)?.from ?? '').trim()
      : '';
  const fromQuery = new URLSearchParams(location.search).get('from')?.trim() ?? '';
  const returnPathRaw = fromState || fromQuery;
  const postLoginPath =
    returnPathRaw.startsWith('/') && !returnPathRaw.startsWith('/login')
      ? returnPathRaw
      : defaultPostLoginPath();
  const loginFormPath = fromQuery ? `/login/form?from=${encodeURIComponent(fromQuery)}` : '/login/form';

  useEffect(() => {
    if (!sessionReady) return;
    if (token) {
      navigate(postLoginPath, { replace: true });
    }
  }, [sessionReady, token, navigate, postLoginPath]);

  if (!sessionReady) {
    return <AppSplash variant="auth" />;
  }

  return (
    <div className="landing-bg relative flex h-full min-h-0 w-full max-w-[100vw] flex-1 flex-col overflow-hidden overflow-y-auto overscroll-y-none text-white [min-height:var(--app-content-height,100dvh)] [max-height:var(--app-content-height,100dvh)]">
      <div className="landing-orb landing-orb--gold" aria-hidden />
      <div className="landing-orb landing-orb--rose" aria-hidden />
      <div className="landing-grain" aria-hidden />

      <div className="relative mx-auto flex h-full min-h-0 w-full max-w-lg flex-1 flex-col pt-6 [padding-left:max(1.25rem,env(safe-area-inset-left,0px))] [padding-right:max(1.25rem,env(safe-area-inset-right,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] sm:py-6">
        <div className="flex-[2] min-h-[2rem]" />

        <div className="flex flex-col items-center">
          <div className="landing-rise relative" style={{ '--d': '60ms' } as CSSProperties} aria-hidden>
            <div className="landing-halo" />
            <div className="landing-logo relative flex h-36 w-36 shrink-0 items-center justify-center rounded-[2.1rem] bg-white/10 p-2 shadow-[0_24px_60px_rgba(0,0,0,0.35)] ring-1 ring-white/25 sm:h-44 sm:w-44">
              <img
                src="/assets/logo.svg"
                alt=""
                className="h-full w-full rounded-[1.6rem] object-contain"
              />
            </div>
          </div>

          <h1
            className="landing-rise mt-10 bg-gradient-to-b from-white to-white/75 bg-clip-text text-center text-3xl font-black uppercase tracking-[0.04em] text-transparent sm:text-4xl md:text-5xl"
            style={{ '--d': '200ms' } as CSSProperties}
          >
            {DEFAULT_APP_NAME}
          </h1>

          <div
            className="landing-rise mt-4 flex items-center gap-3"
            style={{ '--d': '320ms' } as CSSProperties}
            aria-hidden
          >
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-white/50" />
            <span className="h-1.5 w-1.5 rotate-45 bg-[#e8b27d]" />
            <span className="h-px w-8 bg-gradient-to-l from-transparent to-white/50" />
          </div>

          {DEFAULT_DESCRIPTION.trim().length > 0 && (
            <p
              className="landing-rise mt-4 text-center text-sm font-medium uppercase tracking-[0.28em] text-white/80 sm:text-base"
              style={{ '--d': '400ms' } as CSSProperties}
            >
              {DEFAULT_DESCRIPTION}
            </p>
          )}
        </div>

        <div className="flex-[1.5] min-h-[3rem]" />

        <div
          className="landing-rise flex flex-col gap-3 rounded-[1.75rem] bg-black/15 p-3 ring-1 ring-white/15 backdrop-blur-md"
          style={{ '--d': '520ms' } as CSSProperties}
        >
          <Link
            to={loginFormPath}
            state={{ mode: 'signIn' as const, from: fromQuery || undefined }}
            className="landing-btn-primary touch-manipulation flex h-14 w-full items-center justify-center rounded-2xl bg-white text-center text-base font-bold text-primary shadow-[0_10px_28px_rgba(0,0,0,0.28)] transition-transform active:scale-[0.97]"
          >
            Войти
          </Link>
          <Link
            to={loginFormPath}
            state={{ mode: 'signUp' as const, from: fromQuery || undefined }}
            className="touch-manipulation flex h-14 w-full items-center justify-center rounded-2xl border border-white/30 bg-white/10 text-center text-base font-bold text-white transition-[transform,background-color] active:scale-[0.97] hover:bg-white/20"
          >
            Зарегистрироваться
          </Link>
        </div>

        <div className="flex-[1] min-h-[2rem]" />
      </div>
    </div>
  );
}
