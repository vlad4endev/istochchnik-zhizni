import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useAuthSessionReady } from '../../../hooks/useAuthSessionReady';
import { defaultPostLoginPath } from '../../../lib/appVariant';
import { useAuthStore } from '../authStore';
import { SkeletonBox } from '@/components/ui/SkeletonBox';

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
    return (
      <div className="flex h-full min-h-0 w-full max-w-[100vw] flex-1 items-center justify-center overflow-y-auto bg-primary text-white [min-height:var(--viewport-height,100dvh)] [max-height:var(--viewport-height,100dvh)]">
        <div className="w-full max-w-xs space-y-3 px-5">
          <SkeletonBox width="70%" height="16px" />
          <SkeletonBox width="100%" height="12px" />
        </div>
      </div>
    );
  }

  return (
      <div className="flex h-full min-h-0 w-full max-w-[100vw] flex-1 flex-col overflow-y-auto overscroll-y-none bg-[#5c2830] bg-gradient-to-b from-primary via-primary to-[#5c2830] text-white [min-height:var(--viewport-height,100dvh)] [max-height:var(--viewport-height,100dvh)]">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-lg flex-1 flex-col pt-6 [padding-left:max(1.25rem,env(safe-area-inset-left,0px))] [padding-right:max(1.25rem,env(safe-area-inset-right,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] sm:py-6">
        <div className="flex-[2] min-h-[2rem]" />

        <div className="flex flex-col items-center">
          <div
            className="flex h-40 w-40 shrink-0 items-center justify-center rounded-[2rem] bg-white/5 p-2 text-white shadow-[0_18px_44px_rgba(0,0,0,0.24)] ring-1 ring-white/15 sm:h-48 sm:w-48 sm:p-3"
            aria-hidden
          >
            <img src="/assets/logo.svg" alt="" className="h-full w-full object-contain drop-shadow-[0_8px_22px_rgba(0,0,0,0.26)]" />
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

        <div className="flex-[1.5] min-h-[3rem]" />

        <div className="flex flex-col gap-3 pb-2">
          <Link
            to={loginFormPath}
            state={{ mode: 'signIn' as const, from: fromQuery || undefined }}
            className="touch-manipulation flex h-14 w-full items-center justify-center rounded-2xl bg-white text-center text-base font-bold text-primary shadow-lg shadow-stone-900/15 transition-[transform,opacity] active:scale-[0.98] hover:opacity-95"
          >
            Войти
          </Link>
          <Link
            to={loginFormPath}
            state={{ mode: 'signUp' as const, from: fromQuery || undefined }}
            className="touch-manipulation flex h-14 w-full items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-center text-base font-bold text-white shadow-inner backdrop-blur-sm transition-[transform,opacity] active:scale-[0.98] hover:bg-white/15"
          >
            Зарегистрироваться
          </Link>
        </div>

        <div className="flex-[1] min-h-[2rem]" />
      </div>
    </div>
  );
}
