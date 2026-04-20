import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LuLoaderCircle, LuShieldCheck, LuToggleLeft, LuToggleRight } from 'react-icons/lu';
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

      <div className="grid gap-3">
        {APP_SECTION_IDS.map((sectionId) => {
          const rule = data.sections[sectionId];
          return (
            <article
              key={sectionId}
              className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-extrabold text-stone-900">{appSectionLabel(sectionId)}</h4>
                  <p className="text-xs text-stone-500">
                    {rule.enabled ? 'Раздел виден пользователям' : 'Раздел скрыт для всех обычных ролей'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void toggleSection(sectionId, !rule.enabled)}
                  className={[
                    'inline-flex min-h-[42px] items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition',
                    rule.enabled
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                      : 'border-stone-300 bg-stone-100 text-stone-700 hover:bg-stone-200',
                  ].join(' ')}
                >
                  {rule.enabled ? <LuToggleRight className="h-4 w-4" /> : <LuToggleLeft className="h-4 w-4" />}
                  {rule.enabled ? 'Включено' : 'Отключено'}
                </button>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {APP_ROLE_IDS.map((roleId) => {
                  const checked = rule.roles.includes(roleId);
                  return (
                    <label
                      key={roleId}
                      className={[
                        'flex min-h-[42px] items-center gap-2 rounded-xl border px-3 py-2 text-sm',
                        checked ? 'border-primary/35 bg-primary/5 text-stone-900' : 'border-stone-200 text-stone-700',
                      ].join(' ')}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={checked}
                        disabled={isBusy}
                        onChange={(e) => void toggleRole(sectionId, roleId, e.target.checked)}
                      />
                      <span>{appRoleLabel(roleId)}</span>
                    </label>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
