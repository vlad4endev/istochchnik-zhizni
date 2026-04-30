import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LuShieldCheck } from 'react-icons/lu';
import { UserListSkeleton } from '@/components/skeletons/UserListSkeleton';
import { useQuery } from '@tanstack/react-query';
import { keys } from '@/lib/queryKeys';
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

export function AppSectionsAccessSection() {
  const qc = useQueryClient();
  const settingsQ = useQuery({
    queryKey: keys.sections,
    queryFn: fetchSectionVisibilitySettingsAdmin,
    staleTime: 60_000,
  });
  const saveMut = useMutation({
    mutationFn: patchSectionVisibilitySettings,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.sections }),
        qc.invalidateQueries({ queryKey: keys.sectionVisibility }),
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
        <UserListSkeleton />
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
      <div className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)]">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary">
            <LuShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-extrabold text-[var(--text)]">Видимость разделов для пользователей</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
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
                'flex flex-wrap items-center gap-4 rounded-[10px] border border-stone-200/80 bg-[var(--surface-elevated)] px-4 py-3.5 transition-opacity',
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
                  <span className="absolute inset-0 cursor-pointer rounded-[10px] bg-stone-200 transition-colors dark:bg-[var(--bg-interactive)] peer-checked:bg-[var(--primary)]" />
                  <span className="absolute left-[3px] top-[3px] h-[14px] w-[14px] rounded-full bg-[var(--surface-elevated)] transition-transform peer-checked:translate-x-4" />
                </label>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--text)]">{appSectionLabel(sectionId)}</div>
                  <div className="text-xs text-[var(--text-muted)]">Раздел «{appSectionLabel(sectionId)}»</div>
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
                          ? 'border-primary/35 bg-primary/10 text-[var(--primary)]'
                          : 'border-stone-200 bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface)]',
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

      <div className="mt-4 flex items-center justify-between rounded-[10px] border border-stone-200/80 bg-[var(--surface-elevated)] px-4 py-3">
        <span className="text-sm text-[var(--text-muted)]">Изменения сохраняются автоматически</span>
        <button
          type="button"
          className="rounded-lg bg-[var(--primary)] px-3.5 py-2 text-sm font-semibold text-[var(--text-on-primary)] transition hover:opacity-95 disabled:opacity-50"
          disabled={isBusy}
          onClick={() => void qc.invalidateQueries({ queryKey: keys.sections })}
        >
          Сохранить доступы
        </button>
      </div>
    </section>
  );
}
