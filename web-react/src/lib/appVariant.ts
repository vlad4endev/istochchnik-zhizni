export type AppVariant = 'full' | 'main' | 'studio';

/**
 * `full` — монолит (как раньше). `main` — только просмотр песенника на основном домене.
 * `studio` — только раздел Студия на поддомене.
 */
export function getAppVariant(): AppVariant {
  const v = String(import.meta.env.VITE_APP_VARIANT ?? 'full').trim().toLowerCase();
  if (v === 'main' || v === 'studio') return v;
  return 'full';
}

export function isMainSongbookDeploy(): boolean {
  return getAppVariant() === 'main';
}

export function isStudioDeploy(): boolean {
  return getAppVariant() === 'studio';
}

/** Куда вести после успешного входа. */
export function defaultPostLoginPath(): string {
  const v = getAppVariant();
  if (v === 'main') return '/songbook';
  if (v === 'studio') return '/studio';
  return '/dashboard';
}

/** Заявка на рассмотрении: в монолите — dashboard, в split — отдельная страница. */
export function pendingRegistrationLandingPath(): string {
  return getAppVariant() === 'full' ? '/dashboard' : '/pending-review';
}
