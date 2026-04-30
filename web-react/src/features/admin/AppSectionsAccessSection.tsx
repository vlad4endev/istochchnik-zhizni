import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LuLoaderCircle, LuShieldCheck } from 'react-icons/lu';
import {
  APP_ROLE_IDS,
  APP_SECTION_IDS,
  appRoleLabel,
  appSectionLabel,
  fetchSectionVisibilitySettingsAdmin,
  patchSectionVisibilitySettings,
  type AppRole,
  type AppSectionId,
} from '../settings/sectionVisibilityApi';
import { apiErrorMessage } from './api';

const Q_SECTION_VISIBILITY = ['admin', 'section-visibility'] as const;

export function AppSectionsAccessSection() {
  const qc = useQueryClient();
  const settingsQ = useQuery({
    queryKey: Q_SECTION_VISIBILITY,
    queryFn: fetchSectionVisibilitySettingsAdmin,
  });
  const saveMut = useMutation({
    mutationFn: patchSectionVisibilitySettings,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: Q_SECTION_VISIBILITY }),
        qc.invalidateQueries({ queryKey: ['settings', 'sections', 'visibility'] }),
      ]);
    },
  });

  const data = settingsQ.data;
  const isBusy = saveMut.isPending;

  async function toggleSection(sectionId: AppSectionId, enabled: boolean) {
    await saveMut.mutateAsync({ sections: { [sectionId]: { enabled } } });
  }

  async function toggleRole(sectionId: AppSectionId, role: AppRole, checked: boolean) {
    if (!data) return;
    const current = data.sections[sectionId].roles;
    const next = checked ? Array.from(new Set([...current, role])) : current.filter((r) => r !== role);
    if (next.length === 0) return;
    await saveMut.mutateAsync({ sections: { [sectionId]: { roles: next } } });
  }

  if (settingsQ.isLoading) {
    return (
      <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)]">
        <div className="flex items-center gap-2 text-sm font-medium text-stone-500">
          <LuLoaderCircle className="h-4 w-4 animate-spin" />
          Загрузка настроек доступа...
        </div>
      </section>
    );
  }

  if (settingsQ.error || !data) {
    return (
      <section className="rounded-2xl border border-red-200/80 bg-red-50/70 p-4 text-sm text-red-700 shadow-[var(--shadow)]">
        {apiErrorMessage(settingsQ.error, 'Не удалось загрузить раздел управления доступом.')}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 to-white p-4 shadow-[var(--shadow)]">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-xl bg-indigo-100 p-2 text-indigo-700">
            <LuShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-extrabold text-stone-900">Видимость разделов для пользователей</h3>
            <p className="mt-1 text-sm text-stone-600">
              Отключайте ненужные разделы и выбирайте, для каких ролей они будут доступны в меню и по прямой ссылке.
            </p>
          </div>
        </div>
      </div>

      {saveMut.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {apiErrorMessage(saveMut.error, 'Не удалось сохранить изменения.')}
        </div>
      ) : null}

      <div className="grid gap-2">
        {APP_SECTION_IDS.map((sectionId) => {
          const rule = data.sections[sectionId];
          return (
            <article
              key={sectionId}
              className={[
                'flex flex-wrap items-center gap-4 rounded-[10px] border border-[#F0E9EA] bg-white px-4 py-3.5 transition-opacity',
                rule.enabled ? '' : 'opacity-45',
              ].join(' ')}
            >
              <div className="flex min-w-[220px] items-center gap-3.5">
                <label className="relative inline-block h-5 w-9 shrink-0">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={rule.enabled}
                    disabled={isBusy}
                    onChange={() => void toggleSection(sectionId, !rule.enabled)}
                  />
                  <span className="absolute inset-0 cursor-pointer rounded-[10px] bg-stone-200 transition-colors peer-checked:bg-[#7B2D3F]" />
                  <span className="absolute left-[3px] top-[3px] h-[14px] w-[14px] rounded-full bg-white transition-transform peer-checked:translate-x-4" />
                </label>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-stone-900">{appSectionLabel(sectionId)}</div>
                  <div className="text-[11px] text-stone-400">Раздел «{appSectionLabel(sectionId)}»</div>
                </div>
              </div>

              <div className="flex flex-1 flex-wrap gap-1.5">
                {APP_ROLE_IDS.map((roleId) => {
                  const checked = rule.roles.includes(roleId);
                  return (
                    <button
                      key={roleId}
                      type="button"
                      disabled={isBusy}
                      onClick={() => void toggleRole(sectionId, roleId, !checked)}
                      className={[
                        'rounded-[14px] border px-2.5 py-1 text-xs font-medium transition',
                        checked
                          ? 'border-[#D4B8BE] bg-[#F3EEF0] text-[#7B2D3F]'
                          : 'border-stone-200 bg-transparent text-stone-500 hover:bg-stone-50',
                      ].join(' ')}
                    >
                      {appRoleLabel(roleId)}
                    </button>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-[10px] border border-[#F0E9EA] bg-white px-4 py-3">
        <span className="text-sm text-stone-400">Изменения сохраняются автоматически</span>
        <button
          type="button"
          className="rounded-lg bg-[#7B2D3F] px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-50"
          disabled={isBusy}
          onClick={() => void qc.invalidateQueries({ queryKey: Q_SECTION_VISIBILITY })}
        >
          Сохранить доступы
        </button>
      </div>
    </section>
  );
}
