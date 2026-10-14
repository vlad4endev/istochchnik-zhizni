import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useAuthSessionReady } from '../../../hooks/useAuthSessionReady';
import { defaultPostLoginPath } from '../../../lib/appVariant';
import { useAuthStore } from '../authStore';
import { AppSplash } from '@/components/AppSplash';
import { AppButton } from '@/components/ui/AppButton';

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
    <div className="app-header-band relative flex h-full min-h-0 w-full max-w-[100vw] flex-1 flex-col overflow-y-auto overscroll-y-none text-[color:var(--surface)] [min-height:var(--app-content-height,100dvh)] [max-height:var(--app-content-height,100dvh)]">
      <span className="app-header-band__orb app-header-band__orb--wine" aria-hidden />
      <span className="app-header-band__orb app-header-band__orb--gold" aria-hidden />
      <span className="app-header-band__grain" aria-hidden />

      <div className="relative z-[2] mx-auto flex h-full min-h-0 w-full max-w-lg flex-1 flex-col pt-6 [padding-left:max(1.25rem,env(safe-area-inset-left,0px))] [padding-right:max(1.25rem,env(safe-area-inset-right,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] sm:py-6">
        <div className="flex-[2] min-h-[2rem]" />

        <div className="flex flex-col items-center">
          <div
            className="flex h-36 w-36 shrink-0 items-center justify-center rounded-[1.75rem] bg-white/10 p-2.5 text-white shadow-[0_18px_44px_rgba(0,0,0,0.28)] ring-1 ring-white/20 sm:h-44 sm:w-44 sm:p-3"
            aria-hidden
          >
            <img src="/assets/logo.svg" alt="" className="h-full w-full object-contain drop-shadow-[0_8px_22px_rgba(0,0,0,0.26)]" />
          </div>

          <h1 className="mt-9 text-center font-ui text-2xl font-extrabold tracking-tight text-[color:var(--surface)] sm:mt-10 sm:text-3xl md:text-4xl">
            {DEFAULT_APP_NAME}
          </h1>

          {DEFAULT_DESCRIPTION.trim().length > 0 && (
            <p className="app-accent-phrase mt-2.5 text-center text-base leading-snug text-[color:var(--gold)] sm:text-lg">
              {DEFAULT_DESCRIPTION}
            </p>
          )}
        </div>

        <div className="flex-[1.5] min-h-[3rem]" />

        <div className="flex flex-col gap-3 pb-2">
          <Link to={loginFormPath} state={{ mode: 'signIn' as const, from: fromQuery || undefined }} className="block">
            <AppButton fullWidth className="!bg-white !text-wine !shadow-lg h-[56px]">
              Войти
            </AppButton>
          </Link>
          <Link to={loginFormPath} state={{ mode: 'signUp' as const, from: fromQuery || undefined }} className="block">
            <AppButton
              variant="ghost"
              fullWidth
              className="!border-white/25 !bg-white/10 !text-white h-[56px] hover:!bg-white/15"
            >
              Зарегистрироваться
            </AppButton>
          </Link>
        </div>

        <div className="flex-[1] min-h-[2rem]" />
      </div>
    </div>
  );
}
