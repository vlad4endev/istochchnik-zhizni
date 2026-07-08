import type { ReactNode } from 'react';

import '/app-splash.css';

const APP_NAME = 'Моя церковь';
const APP_TAGLINE = 'Цифровая платформа';

export type AppSplashVariant = 'launch' | 'auth';

type AppSplashProps = {
  variant?: AppSplashVariant;
  title?: string;
  tagline?: string;
};

export function AppSplash({
  variant = 'launch',
  title = APP_NAME,
  tagline = APP_TAGLINE,
}: AppSplashProps): ReactNode {
  const rootClass = variant === 'auth' ? 'app-splash app-splash--auth' : 'app-splash';

  return (
    <div className={rootClass} role="status" aria-live="polite" aria-label="Загрузка приложения">
      <div className="app-splash__bg" aria-hidden>
        <div className="app-splash__orb app-splash__orb--1" />
        <div className="app-splash__orb app-splash__orb--2" />
        <div className="app-splash__orb app-splash__orb--3" />
        <div className="app-splash__grain" />
      </div>

      <div className="app-splash__center">
        <div className="app-splash__logo-shell">
          <span className="app-splash__ring" />
          <span className="app-splash__ring app-splash__ring--2" />
          <div className="app-splash__logo-card">
            <img src="/assets/logo.svg" alt="" className="app-splash__logo" decoding="async" />
          </div>
        </div>

        <h1 className="app-splash__title">{title}</h1>
        {tagline.trim().length > 0 ? <p className="app-splash__tagline">{tagline}</p> : null}
      </div>

      <div className="app-splash__loader" aria-hidden>
        <div className="app-splash__loader-bar" />
      </div>

      <div className="app-splash__dots" aria-hidden>
        <span className="app-splash__dot" />
        <span className="app-splash__dot" />
        <span className="app-splash__dot" />
      </div>
    </div>
  );
}