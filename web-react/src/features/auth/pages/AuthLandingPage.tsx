import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useAuthSessionReady } from '../../../hooks/useAuthSessionReady';
import { defaultPostLoginPath } from '../../../lib/appVariant';
import { isAndroidNative } from '../../../lib/androidNativeTheme';
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

  if (isAndroidNative()) {
    return (
      <div className="landing-native">
        <header className="landing-native__top">
          <span className="landing-native__brand-icon" aria-hidden>
            <img src="/assets/logo.svg" alt="" />
          </span>
          <span className="landing-native__brand-name">Моя церковь</span>
        </header>
        <div className="landing-native__hero" aria-hidden>
          <svg className="landing-native__art" viewBox="0 0 320 300" role="img" focusable="false">
            <defs>
              <radialGradient id="ln-glow" cx="50%" cy="46%" r="54%">
                <stop offset="0%" stopColor="#f2b879" stopOpacity="0.62" />
                <stop offset="55%" stopColor="#c2455f" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#c2455f" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="ln-wall" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fff7ec" />
                <stop offset="100%" stopColor="#e7cfbf" />
              </linearGradient>
              <linearGradient id="ln-roof" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a8304e" />
                <stop offset="100%" stopColor="#5a1826" />
              </linearGradient>
              <linearGradient id="ln-win" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffe3b3" />
                <stop offset="100%" stopColor="#f2a65a" />
              </linearGradient>
              <linearGradient id="ln-fade-x" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#000" />
                <stop offset="16%" stopColor="#fff" />
                <stop offset="84%" stopColor="#fff" />
                <stop offset="100%" stopColor="#000" />
              </linearGradient>
              <mask id="ln-ground-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="320" height="300">
                <rect width="320" height="300" fill="url(#ln-fade-x)" />
              </mask>
              <linearGradient id="ln-ground-back" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4a1322" />
                <stop offset="100%" stopColor="#4a1322" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="ln-ground-front" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2c0a14" />
                <stop offset="70%" stopColor="#2c0a14" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#2c0a14" stopOpacity="0" />
              </linearGradient>
              <radialGradient id="ln-cross" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ffd9a0" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#ffd9a0" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="160" cy="138" r="142" fill="url(#ln-glow)" />
            <g fill="#ffe3b3">
              <circle cx="38" cy="52" r="1.8" opacity="0.8" />
              <circle cx="276" cy="40" r="2.2" opacity="0.9" />
              <circle cx="238" cy="86" r="1.5" opacity="0.7" />
              <circle cx="70" cy="104" r="1.4" opacity="0.6" />
              <circle cx="294" cy="120" r="1.6" opacity="0.7" />
              <circle cx="104" cy="30" r="1.5" opacity="0.7" />
            </g>
            <path mask="url(#ln-ground-mask)" d="M0 246 Q80 212 160 238 T320 232 V300 H0Z" fill="url(#ln-ground-back)" />
            <circle cx="150" cy="40" r="26" fill="url(#ln-cross)" />
            <rect x="60" y="165" width="65" height="92" fill="url(#ln-wall)" />
            <rect x="175" y="165" width="65" height="92" fill="url(#ln-wall)" />
            <polygon points="50,170 92,138 134,170" fill="url(#ln-roof)" />
            <polygon points="166,170 208,138 250,170" fill="url(#ln-roof)" />
            <rect x="125" y="96" width="50" height="161" fill="url(#ln-wall)" />
            <polygon points="118,100 150,50 182,100" fill="url(#ln-roof)" />
            <rect x="147.5" y="12" width="5" height="40" rx="2" fill="#f2b879" />
            <rect x="136" y="23" width="28" height="5" rx="2" fill="#f2b879" />
            <path d="M141 134 v-15 a9 9 0 0 1 18 0 v15z" fill="url(#ln-win)" />
            <path d="M80 232 v-30 a10 10 0 0 1 20 0 v30z" fill="url(#ln-win)" />
            <path d="M200 232 v-30 a10 10 0 0 1 20 0 v30z" fill="url(#ln-win)" />
            <path d="M137 257 v-34 a13 13 0 0 1 26 0 v34z" fill="#3a0f1c" />
            <path d="M143 257 v-30 a7 7 0 0 1 14 0 v30z" fill="url(#ln-win)" opacity="0.9" />
            <rect x="128" y="257" width="44" height="6" rx="1.5" fill="#d9c3b3" />
            <path mask="url(#ln-ground-mask)" d="M0 268 Q100 244 200 260 T320 256 V300 H0Z" fill="url(#ln-ground-front)" />
            <g fill="#2c0a14" opacity="0.92">
              <rect x="22" y="236" width="5" height="26" />
              <ellipse cx="24.5" cy="228" rx="13" ry="20" />
              <rect x="292" y="240" width="4" height="22" />
              <ellipse cx="294" cy="233" rx="11" ry="17" />
            </g>
          </svg>
        </div>
        <section className="landing-native__sheet">
          <h1 className="landing-native__title">
            Будьте на связи
            <em>со своей общиной</em>
          </h1>
          <p className="landing-native__lead">Чаты, звонки и служения вашей церкви — в одном приложении</p>
          <Link
            to={loginFormPath}
            state={{ mode: 'signIn' as const, from: fromQuery || undefined }}
            className="landing-native__primary"
          >
            <span>Войти</span>
            <span className="landing-native__primary-arrow" aria-hidden>
              →
            </span>
          </Link>
          <Link
            to={loginFormPath}
            state={{ mode: 'signUp' as const, from: fromQuery || undefined }}
            className="landing-native__secondary"
          >
            Зарегистрироваться
          </Link>
          <p className="landing-native__legal">
            Продолжая, вы принимаете условия использования и политику конфиденциальности
          </p>
        </section>
      </div>
    );
  }

  return (
      <div className="app-auth-landing flex h-full min-h-0 w-full max-w-[100vw] flex-1 flex-col overflow-y-auto overscroll-y-none bg-[#5c2830] bg-gradient-to-b from-primary via-primary to-[#5c2830] text-white [min-height:var(--app-content-height,100dvh)] [max-height:var(--app-content-height,100dvh)]">
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
