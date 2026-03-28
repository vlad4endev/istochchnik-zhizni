import { useCallback, useEffect, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../auth/authStore';
import { brandingDefaults, useBrandingStore, type BrandingStateSnapshot } from '../../branding/brandingStore';
import { fileToDataUrl } from '../../branding/logoProcessing';
import { fetchMe, type MeResponse } from '../api';

function displayName(user: MeResponse): string {
  const fn = (user.first_name ?? '').trim();
  const ln = (user.last_name ?? '').trim();
  const combined = `${fn} ${ln}`.trim();
  if (combined) return combined;
  return (user.name ?? '').trim() || 'Профиль';
}

function roleLabel(role: string): string {
  const r = role.trim().toLowerCase();
  if (r === 'admin') return 'Администратор';
  return 'Участник';
}

function formatPhone(phone: string | null): string {
  if (!phone || !phone.trim()) return '—';
  return phone.trim();
}

export function ProfilePage() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const applyServerProfile = useAuthStore((s) => s.applyServerProfile);

  const branding = useBrandingStore();
  const updateBranding = useBrandingStore((s) => s.updateBranding);
  const resetBrandingDefaults = useBrandingStore((s) => s.resetBrandingDefaults);
  const applyCustomLogoDataUrl = useBrandingStore((s) => s.applyCustomLogoDataUrl);

  const brandingFormId = useId();
  const appNameId = `${brandingFormId}-app-name`;
  const descId = `${brandingFormId}-desc`;
  const scaleId = `${brandingFormId}-scale`;
  const fileInputId = `${brandingFormId}-logo-file`;

  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const [draft, setDraft] = useState<BrandingStateSnapshot>(() => ({
    appName: branding.appName,
    description: branding.description,
    logoAssetPath: branding.logoAssetPath,
    removeLightBackground: branding.removeLightBackground,
    logoScalePercent: branding.logoScalePercent,
    customLogoDataUrl: branding.customLogoDataUrl,
  }));

  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [clearCustomLogo, setClearCustomLogo] = useState(false);

  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingMessage, setBrandingMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(
    null,
  );

  useEffect(() => {
    setDraft({
      appName: branding.appName,
      description: branding.description,
      logoAssetPath: branding.logoAssetPath,
      removeLightBackground: branding.removeLightBackground,
      logoScalePercent: branding.logoScalePercent,
      customLogoDataUrl: branding.customLogoDataUrl,
    });
  }, [
    branding.appName,
    branding.description,
    branding.logoAssetPath,
    branding.removeLightBackground,
    branding.logoScalePercent,
    branding.customLogoDataUrl,
  ]);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const me = await fetchMe();
      setUser(me);
      applyServerProfile({
        firstName: me.first_name ?? '',
        lastName: me.last_name ?? '',
        role: me.app_role ?? 'member',
      });
    } catch (e) {
      setError(e);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [applyServerProfile]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    };
  }, [pendingPreviewUrl]);

  async function handleLogout() {
    const ok = window.confirm('Завершить текущую сессию?');
    if (!ok) return;
    await logout();
    navigate('/login', { replace: true });
  }

  function onPickLogo(f: FileList | null) {
    const file = f?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setClearCustomLogo(false);
    setPendingLogoFile(file);
    setPendingPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setBrandingMessage(null);
  }

  async function handleSaveBranding() {
    setBrandingSaving(true);
    setBrandingMessage(null);
    try {
      updateBranding({
        appName: draft.appName.trim() || brandingDefaults.appName,
        description: draft.description.trim(),
        removeLightBackground: draft.removeLightBackground,
        logoScalePercent: draft.logoScalePercent,
      });

      if (clearCustomLogo) {
        await applyCustomLogoDataUrl(null, true);
        setPendingLogoFile(null);
        setPendingPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
        setClearCustomLogo(false);
      } else if (pendingLogoFile) {
        const dataUrl = await fileToDataUrl(pendingLogoFile);
        await applyCustomLogoDataUrl(dataUrl, false);
        setPendingLogoFile(null);
        setPendingPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return null;
        });
      }

      setDraft((d) => ({
        ...d,
        appName: useBrandingStore.getState().appName,
        description: useBrandingStore.getState().description,
        customLogoDataUrl: useBrandingStore.getState().customLogoDataUrl,
      }));
      setBrandingMessage({ kind: 'ok', text: 'Настройки сохранены' });
    } catch {
      setBrandingMessage({
        kind: 'err',
        text: 'Не удалось сохранить (возможно, файл слишком большой для хранилища).',
      });
    } finally {
      setBrandingSaving(false);
    }
  }

  function handleResetBranding() {
    const ok = window.confirm('Сбросить название, описание и логотип к значениям по умолчанию?');
    if (!ok) return;
    resetBrandingDefaults();
    setPendingLogoFile(null);
    setPendingPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setClearCustomLogo(false);
    setBrandingMessage({ kind: 'ok', text: 'Восстановлены настройки по умолчанию' });
  }

  const previewSrc = clearCustomLogo
    ? null
    : pendingPreviewUrl ?? draft.customLogoDataUrl ?? branding.customLogoDataUrl;

  return (
    <div className="min-h-full bg-[var(--surface)] pb-28 shell:pb-8">
      <header className="bg-primary px-5 py-5 text-white shadow-sm">
        <h1 className="text-[22px] font-extrabold tracking-tight">Профиль</h1>
      </header>

      <div className="px-4 py-8 shell:px-8">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-stone-500">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="mt-4 text-sm font-semibold">Загрузка…</p>
          </div>
        ) : error ? (
          <div className="mx-auto max-w-md rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-8 text-center shadow-[var(--shadow)]">
            <p className="font-semibold text-stone-900">Не удалось загрузить профиль</p>
            <button
              type="button"
              onClick={() => void loadProfile()}
              className="mt-4 rounded-xl border-2 border-primary px-5 py-2.5 text-sm font-bold text-primary transition hover:bg-primary/5"
            >
              Повторить
            </button>
          </div>
        ) : user ? (
          <div className="mx-auto flex max-w-lg flex-col gap-8">
            <section className="rounded-3xl border border-stone-200/80 bg-[var(--surface-elevated)] p-8 shadow-[var(--shadow)]">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/[0.08] text-5xl text-primary/70">
                  👤
                </div>
                <h2 className="mt-5 text-[22px] font-extrabold tracking-tight text-stone-900">
                  {displayName(user)}
                </h2>
                <p className="mt-1 text-base text-stone-500">Роль: {roleLabel(user.app_role)}</p>
                {user.app_role?.toLowerCase() === 'admin' ? (
                  <Link
                    to="/admin"
                    className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-white/15 px-5 text-sm font-bold text-white ring-1 ring-white/40 transition hover:bg-white/25"
                  >
                    Админ-панель
                  </Link>
                ) : null}
                <p className="mt-3 text-[15px] text-stone-600">
                  <span className="font-semibold text-stone-500">Телефон:</span>{' '}
                  {formatPhone(user.phone_number)}
                </p>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="mt-6 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border-2 border-primary px-6 text-sm font-bold text-primary transition hover:bg-primary/5"
                >
                  Выйти из аккаунта
                </button>
              </div>
            </section>

            <section className="rounded-3xl border border-stone-200/80 bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow)] shell:p-8">
              <h2 className="text-lg font-extrabold text-stone-900">Оформление</h2>
              <p className="mt-1 text-sm text-stone-500">
                Название и логотип в боковой панели сохраняются в этом браузере (как в мобильном
                приложении).
              </p>

              <div className="mt-6 space-y-5">
                <div>
                  <label htmlFor={appNameId} className="block text-sm font-semibold text-stone-700">
                    Название проекта
                  </label>
                  <input
                    id={appNameId}
                    type="text"
                    value={draft.appName}
                    onChange={(e) => setDraft((d) => ({ ...d, appName: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-[15px] text-stone-900 outline-none ring-primary/20 transition placeholder:text-stone-400 focus:border-primary focus:ring-2"
                    placeholder="МОЯ ЦЕРКОВЬ"
                    autoComplete="organization"
                  />
                </div>

                <div>
                  <label htmlFor={descId} className="block text-sm font-semibold text-stone-700">
                    Подзаголовок
                  </label>
                  <input
                    id={descId}
                    type="text"
                    value={draft.description}
                    onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-[15px] text-stone-900 outline-none ring-primary/20 transition placeholder:text-stone-400 focus:border-primary focus:ring-2"
                    placeholder="Молитвенный календарь"
                  />
                </div>

                <div>
                  <label htmlFor={scaleId} className="block text-sm font-semibold text-stone-700">
                    Масштаб логотипа: {draft.logoScalePercent}%
                  </label>
                  <input
                    id={scaleId}
                    type="range"
                    min={80}
                    max={160}
                    step={1}
                    value={draft.logoScalePercent}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, logoScalePercent: Number(e.target.value) }))
                    }
                    className="mt-2 w-full accent-primary"
                  />
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-stone-100 bg-stone-50/80 p-4">
                  <input
                    id={`${brandingFormId}-remove-bg`}
                    type="checkbox"
                    checked={draft.removeLightBackground}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, removeLightBackground: e.target.checked }))
                    }
                    className="mt-1 h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary"
                  />
                  <label htmlFor={`${brandingFormId}-remove-bg`} className="text-sm text-stone-700">
                    <span className="font-semibold text-stone-900">Убрать светлый фон</span>
                    <span className="mt-0.5 block text-stone-500">
                      Делает почти белые пиксели прозрачными при загрузке логотипа (как в приложении).
                    </span>
                  </label>
                </div>

                <div>
                  <p className="text-sm font-semibold text-stone-700">Логотип</p>
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-stone-200 bg-white">
                      {previewSrc ? (
                        <img
                          src={previewSrc}
                          alt=""
                          className="max-h-full max-w-full object-contain"
                          style={{ transform: `scale(${draft.logoScalePercent / 100})` }}
                        />
                      ) : (
                        <span className="text-2xl text-stone-300">✝</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <input
                        id={fileInputId}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => onPickLogo(e.target.files)}
                      />
                      <button
                        type="button"
                        onClick={() => document.getElementById(fileInputId)?.click()}
                        className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 hover:bg-primary-dark"
                      >
                        Загрузить изображение
                      </button>
                      {(draft.customLogoDataUrl || pendingLogoFile) && !clearCustomLogo ? (
                        <button
                          type="button"
                          onClick={() => {
                            setClearCustomLogo(true);
                            setPendingLogoFile(null);
                            setPendingPreviewUrl((prev) => {
                              if (prev) URL.revokeObjectURL(prev);
                              return null;
                            });
                          }}
                          className="text-sm font-semibold text-stone-600 underline decoration-stone-300 underline-offset-2 hover:text-primary"
                        >
                          Убрать свой логотип
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>

                {brandingMessage ? (
                  <p
                    className={`text-sm font-medium ${brandingMessage.kind === 'ok' ? 'text-teal-700' : 'text-red-600'}`}
                    role="status"
                  >
                    {brandingMessage.text}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="button"
                    disabled={brandingSaving}
                    onClick={() => void handleSaveBranding()}
                    className="min-h-[48px] rounded-xl bg-primary px-6 text-sm font-bold text-white shadow-md shadow-primary/25 transition hover:bg-primary-dark disabled:opacity-60"
                  >
                    {brandingSaving ? 'Сохранение…' : 'Сохранить настройки'}
                  </button>
                  <button
                    type="button"
                    disabled={brandingSaving}
                    onClick={handleResetBranding}
                    className="min-h-[48px] rounded-xl border border-stone-300 px-5 text-sm font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-60"
                  >
                    Сбросить по умолчанию
                  </button>
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
