import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LuArrowRight } from 'react-icons/lu';

import { useAuthSessionReady } from '../../../hooks/useAuthSessionReady';
import { defaultPostLoginPath } from '../../../lib/appVariant';
import { useAuthStore } from '../authStore';
import { AppSplash } from '@/components/AppSplash';
import { useBrandingStore } from '@/features/branding/brandingStore';

const DEFAULT_APP_NAME = 'Моя церковь';

function CrossLogoTile({ size = 34 }: { size?: number }) {
  const id = `auth-cross-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" role="img" aria-label="Логотип">
      <defs>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="0" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FFFBF6" />
          <stop offset="1" stopColor="#EDDFD0" />
        </linearGradient>
        <linearGradient id={`${id}-cross`} x1="0" y1="8" x2="0" y2="26" gradientUnits="userSpaceOnUse">
          <stop offset="0.35" stopColor="#7B1F3B" />
          <stop offset="1" stopColor="#DC9A52" />
        </linearGradient>
      </defs>
      <rect width="34" height="34" rx="11" fill={`url(#${id}-tile)`} />
      <path
        d="M17 8V26M10.5 13.5H23.5"
        stroke={`url(#${id}-cross)`}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AuthLandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const sessionReady = useAuthSessionReady();
  const token = useAuthStore((s) => s.token);
  const brandingName = useBrandingStore((s) => s.appName);
  const appName = (brandingName?.trim() || DEFAULT_APP_NAME).trim();
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
    <div className="app-auth-main">
      <span className="app-header-band__orb app-header-band__orb--wine" aria-hidden />
      <span className="app-header-band__orb app-header-band__orb--gold" aria-hidden />
      <span className="app-header-band__grain" aria-hidden />

      <div
        className="relative z-[3] flex items-center gap-2.5 px-6 pt-[max(2.5rem,env(safe-area-inset-top,0px))]"
      >
        <CrossLogoTile size={34} />
        <div className="truncate text-[17px] font-bold tracking-tight text-white">{appName}</div>
      </div>

      <div className="app-auth-main__hero-photo" aria-hidden>
        <img src="/assets/screenshot-mobile.png" alt="" />
      </div>

      <div className="app-auth-main__sheet">
        <h1 className="m-0 text-[clamp(1.75rem,7vw,1.95rem)] font-extrabold leading-[1.1] tracking-tight text-ink">
          Будьте на связи
          <br />
          <span className="app-accent-phrase text-[clamp(1.9rem,8vw,2.2rem)] text-[color:#B23A58]">
            со своей общиной
          </span>
        </h1>
        <p className="mt-3 mb-0 text-[15px] leading-normal text-muted">
          Чаты, звонки и служения вашей церкви — в одном приложении
        </p>

        <div className="mt-[22px] flex flex-col gap-2.5">
          <Link to={loginFormPath} state={{ mode: 'signIn' as const, from: fromQuery || undefined }}>
            <span className="app-auth-main__cta">
              <span>Войти</span>
              <span className="app-auth-main__cta-arrow" aria-hidden>
                <LuArrowRight className="h-5 w-5" strokeWidth={2.2} />
              </span>
            </span>
          </Link>
          <Link
            to={loginFormPath}
            state={{ mode: 'signUp' as const, from: fromQuery || undefined }}
            className="flex h-[54px] items-center justify-center rounded-[20px] border-[1.5px] border-[rgba(90,24,38,0.2)] text-base font-semibold text-[#5A1826]"
          >
            Зарегистрироваться
          </Link>
        </div>

        <p className="mx-2 mt-4 mb-0 text-center text-[11.5px] leading-normal text-[#75625F]">
          Продолжая, вы принимаете условия использования и политику конфиденциальности
        </p>
      </div>
    </div>
  );
}
