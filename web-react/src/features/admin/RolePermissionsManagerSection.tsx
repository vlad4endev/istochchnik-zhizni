import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LuLayoutGrid, LuList, LuRotateCcw, LuShield } from 'react-icons/lu';
import { UserListSkeleton } from '@/components/skeletons/UserListSkeleton';
import { keys } from '@/lib/queryKeys';
import {
  fetchRolePermissionsAdmin,
  isPermissionLocked,
  patchRolePermissions,
  resetRolePermissions,
  type AppPermissionId,
  type PermissionCategory,
  type PermissionDef,
  type RolePermissionsSettingsAdmin,
} from '../settings/rolePermissionsApi';
import { APP_ROLE_IDS, appRoleLabel, type AppRole } from '../settings/sectionVisibilityApi';
import { apiErrorMessage } from './api';

type ViewMode = 'by_role' | 'matrix';

function countEnabledForRole(roles: RolePermissionsSettingsAdmin['roles'] | undefined, role: AppRole): number {
  if (!roles) return 0;
  const map = roles[role];
  if (!map) return 0;
  return Object.values(map).filter(Boolean).length;
}

export function RolePermissionsManagerSection() {
  const qc = useQueryClient();
  const [view, setView] = useState<ViewMode>('by_role');
  const [activeRole, setActiveRole] = useState<AppRole>('member');

  const settingsQ = useQuery({
    queryKey: keys.rolePermissions,
    queryFn: fetchRolePermissionsAdmin,
    staleTime: 60_000,
  });

  const saveMut = useMutation({
    mutationFn: patchRolePermissions,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.rolePermissions }),
        qc.invalidateQueries({ queryKey: keys.sections }),
        qc.invalidateQueries({ queryKey: keys.sectionVisibility }),
      ]);
    },
  });

  const resetMut = useMutation({
    mutationFn: resetRolePermissions,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: keys.rolePermissions }),
        qc.invalidateQueries({ queryKey: keys.sections }),
        qc.invalidateQueries({ queryKey: keys.sectionVisibility }),
      ]);
    },
  });

  const data = settingsQ.data;
  const isBusy = saveMut.isPending || resetMut.isPending;

  const defsByCategory = useMemo(() => {
    if (!data) return new Map<string, PermissionDef[]>();
    const map = new Map<string, PermissionDef[]>();
    for (const def of data.permission_defs) {
      const list = map.get(def.category) ?? [];
      list.push(def);
      map.set(def.category, list);
    }
    return map;
  }, [data]);

  async function togglePermission(role: AppRole, permissionId: AppPermissionId, next: boolean) {
    if (isPermissionLocked(role, permissionId) && !next) return;
    await saveMut.mutateAsync({
      roles: { [role]: { [permissionId]: next } },
    });
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
        {apiErrorMessage(settingsQ.error, 'Не удалось загрузить права ролей.')}
      </section>
    );
  }

  const activeRoleMeta = data.role_options.find((r) => r.id === activeRole);

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow)]">
        <RolePermissionsHeader />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ViewToggle view={view} onChange={setView} disabled={isBusy} />
        <button
          type="button"
          disabled={isBusy}
          onClick={() => {
            if (window.confirm('Сбросить все права ролей к заводским настройкам?')) {
              void resetMut.mutateAsync();
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface)] disabled:opacity-50"
        >
          <LuRotateCcw className="h-4 w-4" />
          Сбросить по умолчанию
        </button>
      </div>

      {saveMut.error || resetMut.error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {apiErrorMessage(saveMut.error ?? resetMut.error, 'Не удалось сохранить права.')}
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {data.role_options.map((role) => {
          const enabled = countEnabledForRole(data.roles, role.id);
          const selected = view === 'by_role' && activeRole === role.id;
          return (
            <button
              key={role.id}
              type="button"
              disabled={isBusy}
              onClick={() => {
                setActiveRole(role.id);
                if (view === 'matrix') setView('by_role');
              }}
              className={[
                'rounded-xl border px-3 py-2.5 text-left transition',
                selected
                  ? 'border-primary/40 bg-primary/10 shadow-sm'
                  : 'border-stone-200/80 bg-[var(--surface-elevated)] hover:border-stone-300',
              ].join(' ')}
            >
              <div className={`text-sm font-semibold ${selected ? 'text-[var(--primary)]' : 'text-[var(--text)]'}`}>
                {role.label}
              </div>
              <div className="mt-0.5 text-xs text-[var(--text-muted)]">{enabled} прав включено</div>
            </button>
          );
        })}
      </div>

      {view === 'by_role' ? (
        <ByRoleView
          data={data}
          activeRole={activeRole}
          activeRoleMeta={activeRoleMeta}
          defsByCategory={defsByCategory}
          isBusy={isBusy}
          onToggle={togglePermission}
        />
      ) : (
        <MatrixView
          data={data}
          defsByCategory={defsByCategory}
          categories={data.categories}
          isBusy={isBusy}
          onToggle={togglePermission}
        />
      )}

      <p className="text-xs text-[var(--text-muted)]">
        Изменения разделов синхронизируются с вкладкой «Разделы приложения». Права студии и планировщика
        проверяются на сервере при каждом запросе.
      </p>
    </section>
  );
}

function RolePermissionsHeader() {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary">
        <LuShield className="h-5 w-5" />
      </span>
      <div>
        <h3 className="text-base font-extrabold text-[var(--text)]">Права ролей</h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Настройте, какие функции доступны каждой роли. Используйте матрицу для сравнения или режим по роли
          для подробного описания каждого права.
        </p>
      </div>
    </div>
  );
}

function ViewToggle({
  view,
  onChange,
  disabled,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
  disabled: boolean;
}) {
  return (
    <div className="inline-flex rounded-lg border border-stone-200 bg-[var(--surface-elevated)] p-0.5">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('by_role')}
        className={[
          'inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition',
          view === 'by_role' ? 'bg-primary text-[var(--text-on-primary)]' : 'text-[var(--text-secondary)]',
        ].join(' ')}
      >
        <LuList className="h-3.5 w-3.5" />
        По роли
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange('matrix')}
        className={[
          'inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition',
          view === 'matrix' ? 'bg-primary text-[var(--text-on-primary)]' : 'text-[var(--text-secondary)]',
        ].join(' ')}
      >
        <LuLayoutGrid className="h-3.5 w-3.5" />
        Матрица
      </button>
    </div>
  );
}

function ByRoleView({
  data,
  activeRole,
  activeRoleMeta,
  defsByCategory,
  isBusy,
  onToggle,
}: {
  data: RolePermissionsSettingsAdmin;
  activeRole: AppRole;
  activeRoleMeta: { description: string } | undefined;
  defsByCategory: Map<string, PermissionDef[]>;
  isBusy: boolean;
  onToggle: (role: AppRole, id: AppPermissionId, next: boolean) => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      {activeRoleMeta ? (
        <p className="rounded-xl border border-stone-200/80 bg-stone-50/80 px-3 py-2 text-sm text-[var(--text-secondary)] dark:bg-[var(--surface)]">
          {activeRoleMeta.description}
        </p>
      ) : null}
      {data.categories.map((cat) => (
        <CategoryBlock
          key={cat.id}
          category={cat}
          defs={defsByCategory.get(cat.id) ?? []}
          role={activeRole}
          roleMap={data.roles[activeRole]}
          isBusy={isBusy}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

function MatrixView({
  data,
  defsByCategory,
  categories,
  isBusy,
  onToggle,
}: {
  data: RolePermissionsSettingsAdmin;
  defsByCategory: Map<string, PermissionDef[]>;
  categories: PermissionCategory[];
  isBusy: boolean;
  onToggle: (role: AppRole, id: AppPermissionId, next: boolean) => Promise<void>;
}) {
  return (
    <div className="space-y-4 overflow-x-auto">
      {categories.map((cat) => {
        const defs = defsByCategory.get(cat.id) ?? [];
        if (defs.length === 0) return null;
        return (
          <MatrixCategoryTable key={cat.id} cat={cat} defs={defs} data={data} isBusy={isBusy} onToggle={onToggle} />
        );
      })}
    </div>
  );
}

function MatrixCategoryTable({
  cat,
  defs,
  data,
  isBusy,
  onToggle,
}: {
  cat: PermissionCategory;
  defs: PermissionDef[];
  data: RolePermissionsSettingsAdmin;
  isBusy: boolean;
  onToggle: (role: AppRole, id: AppPermissionId, next: boolean) => Promise<void>;
}) {
  return (
    <div className="min-w-[720px] rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] shadow-[var(--shadow)]">
      <div className="border-b border-stone-200/80 px-4 py-3">
        <h4 className="text-sm font-bold text-[var(--text)]">{cat.label}</h4>
        <p className="text-xs text-[var(--text-muted)]">{cat.description}</p>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-stone-200/80 bg-stone-50/50 dark:bg-[var(--surface)]">
            <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--text-muted)]">Функция</th>
            {APP_ROLE_IDS.map((roleId) => (
              <th
                key={roleId}
                className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]"
                title={appRoleLabel(roleId)}
              >
                {appRoleLabel(roleId).slice(0, 4)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {defs.map((def) => (
            <tr key={def.id} className="border-b border-stone-100 last:border-0">
              <td className="px-3 py-2">
                <div className="font-medium text-[var(--text)]">{def.label}</div>
                <div className="text-[10px] text-[var(--text-muted)]">{def.description}</div>
              </td>
              {APP_ROLE_IDS.map((roleId) => {
                const checked = Boolean(data.roles[roleId]?.[def.id]);
                const locked = isPermissionLocked(roleId, def.id);
                return (
                  <td key={roleId} className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 rounded border-stone-300 text-primary focus:ring-primary disabled:opacity-40"
                      checked={checked}
                      disabled={isBusy || locked}
                      title={locked ? 'Обязательное право администратора' : def.label}
                      onChange={() => void onToggle(roleId, def.id, !checked)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategoryBlock({
  category,
  defs,
  role,
  roleMap,
  isBusy,
  onToggle,
}: {
  category: PermissionCategory;
  defs: PermissionDef[];
  role: AppRole;
  roleMap: Record<AppPermissionId, boolean> | undefined;
  isBusy: boolean;
  onToggle: (role: AppRole, id: AppPermissionId, next: boolean) => Promise<void>;
}) {
  if (defs.length === 0) return null;
  return (
    <article className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] shadow-[var(--shadow)]">
      <div className="border-b border-stone-200/80 px-4 py-3">
        <h4 className="text-sm font-bold text-[var(--text)]">{category.label}</h4>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{category.description}</p>
      </div>
      <ul className="divide-y divide-stone-100">
        {defs.map((def) => {
          const checked = Boolean(roleMap?.[def.id]);
          const locked = isPermissionLocked(role, def.id);
          return (
            <li key={def.id} className="flex items-start gap-3 px-4 py-3">
              <label className="relative mt-0.5 inline-block h-5 w-9 shrink-0">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={checked}
                  disabled={isBusy || locked}
                  onChange={() => void onToggle(role, def.id, !checked)}
                />
                <span className="absolute inset-0 cursor-pointer rounded-[10px] bg-stone-200 transition-colors peer-checked:bg-[var(--primary)] peer-disabled:opacity-40" />
                <span className="absolute left-[3px] top-[3px] h-[14px] w-[14px] rounded-full bg-[var(--surface-elevated)] transition-transform peer-checked:translate-x-4" />
              </label>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[var(--text)]">
                  {def.label}
                  {locked ? (
                    <span className="ml-2 text-[10px] font-normal uppercase text-[var(--text-muted)]">
                      обязательно
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs leading-snug text-[var(--text-secondary)]">{def.description}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
