import type { UseMutationResult } from '@tanstack/react-query';
import { appRoleLabel, type AppRole } from '../settings/sectionVisibilityApi';
import type { AppUser } from './types';

const ASSIGNABLE_ROLES: AppRole[] = [
  'parishioner',
  'member',
  'minister',
  'pastor',
  'musician',
  'editor',
  'admin',
];

function currentRoles(user: AppUser): AppRole[] {
  if (Array.isArray(user.app_roles) && user.app_roles.length > 0) {
    return [...user.app_roles];
  }
  return [user.app_role];
}

export function MemberAppRolesPicker({
  editing,
  roleMut,
  onBannerClear,
}: {
  editing: AppUser;
  roleMut: UseMutationResult<AppUser, unknown, { id: number; roles: AppRole[] }, unknown>;
  onBannerClear: () => void;
}) {
  const selected = currentRoles(editing);

  function toggleRole(role: AppRole) {
    onBannerClear();
    let next: AppRole[];
    if (selected.includes(role)) {
      next = selected.filter((r) => r !== role);
      if (next.length === 0) return;
    } else if (role === 'parishioner') {
      next = ['parishioner'];
    } else {
      next = [...selected.filter((r) => r !== 'parishioner'), role];
    }
    roleMut.mutate({ id: editing.id, roles: next });
  }

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-stone-600">Роли приложения</label>
      <p className="mb-2 text-[11px] leading-snug text-stone-500">
        Можно назначить несколько ролей. Прихожанин несовместим с остальными ролями.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {ASSIGNABLE_ROLES.map((role) => {
          const checked = selected.includes(role);
          return (
            <button
              key={role}
              type="button"
              disabled={roleMut.isPending}
              onClick={() => toggleRole(role)}
              className={[
                'rounded-[14px] border px-2.5 py-1 text-xs font-medium transition',
                checked
                  ? 'border-primary/35 bg-primary/10 text-[var(--primary)]'
                  : 'border-stone-200 bg-transparent text-[var(--text-secondary)] hover:bg-stone-50',
              ].join(' ')}
            >
              {appRoleLabel(role)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
