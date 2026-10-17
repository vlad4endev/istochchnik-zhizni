import { useEffect, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useAuthSessionReady } from '../../../hooks/useAuthSessionReady';
import { defaultPostLoginPath } from '../../../lib/appVariant';
import { useAuthStore } from '../authStore';
import { AppSplash } from '@/components/AppSplash';

const DEFAULT_APP_NAME = 'Моя церковь';
const DEFAULT_DESCRIPTION = 'Чаты, звонки и служения вашей церкви — в одном приложении';

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
    <div className="flex h-full min-h-0 w-full max-w-[100vw] flex-1 flex-col overflow-hidden bg-[#fbf5ef] [min-height:var(--app-content-height,100dvh)] [max-height:var(--app-content-height,100dvh)]">
      <div className="landing-hero relative min-h-[8rem] flex-1 overflow-hidden text-white">
        <img
          src="/assets/landing-hero.webp"
          alt=""
          aria-hidden
          fetchPriority="high"
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full select-none object-cover [object-position:50%_62%]"
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#3a0f20]/70 to-transparent"
          aria-hidden
        />

        <div
          className="landing-rise relative flex items-center gap-3 px-6 [padding-top:max(1.5rem,calc(env(safe-area-inset-top,0px)+0.75rem))]"
          style={{ '--d': '40ms' } as CSSProperties}
        >
          <img
            src="/assets/logo.svg"
            alt=""
            aria-hidden
            className="h-11 w-11 rounded-xl shadow-[0_6px_18px_rgba(0,0,0,0.3)]"
          />
          <span className="text-xl font-extrabold tracking-tight">{DEFAULT_APP_NAME}</span>
        </div>
      </div>

      <div
        className="landing-sheet landing-rise relative -mt-8 shrink-0 rounded-t-[2rem] px-6 pt-8 [padding-bottom:max(1.25rem,env(safe-area-inset-bottom,0px))]"
        style={{ '--d': '180ms' } as CSSProperties}
      >
        <div className="mx-auto w-full max-w-lg">
          <h1 className="text-[2rem] font-extrabold leading-[1.1] tracking-tight text-[#2b0d16] sm:text-4xl">
            Будьте на связи
            <span className="landing-accent block text-[2.15rem] sm:text-[2.5rem]">со своей общиной</span>
          </h1>

          <p className="mt-4 text-base leading-snug text-[#6b5a5e]">{DEFAULT_DESCRIPTION}</p>

          <div className="mt-6 flex flex-col gap-3">
            <Link
              to={loginFormPath}
              state={{ mode: 'signIn' as const, from: fromQuery || undefined }}
              className="landing-btn-primary touch-manipulation flex h-16 w-full items-center justify-between rounded-[1.4rem] pl-6 pr-2.5 text-base font-bold text-white transition-transform active:scale-[0.98]"
            >
              Войти
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f2b479] text-[#6b1a30]">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </Link>
            <Link
              to={loginFormPath}
              state={{ mode: 'signUp' as const, from: fromQuery || undefined }}
              className="touch-manipulation flex h-14 w-full items-center justify-center rounded-[1.4rem] border border-[#e3d3cc] bg-white/60 text-center text-base font-bold text-[#5a1830] transition-[transform,background-color] active:scale-[0.98] hover:bg-white"
            >
              Зарегистрироваться
            </Link>
          </div>

          <p className="mt-5 text-center text-xs leading-snug text-[#7a6a6e]">
            Продолжая, вы принимаете условия использования и политику конфиденциальности
          </p>
        </div>
      </div>
    </div>
  );
}
