import type { UseMutationResult } from '@tanstack/react-query';
import { LuCheck } from 'react-icons/lu';
import { appRoleLabel, type AppRole } from '../settings/sectionVisibilityApi';
import { memberAppRoles } from './memberListQuery';
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
  return memberAppRoles(user);
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
      <h4 className="text-[13px] font-extrabold tracking-tight text-stone-900 sm:text-sm">Роли приложения</h4>
      <p className="mt-0.5 mb-3 text-[12px] leading-snug text-stone-500">
        Можно назначить несколько ролей. Прихожанин несовместим с остальными.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ASSIGNABLE_ROLES.map((role) => {
          const checked = selected.includes(role);
          return (
            <button
              key={role}
              type="button"
              disabled={roleMut.isPending}
              onClick={() => toggleRole(role)}
              className={[
                'inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl border px-3 text-[13px] font-semibold transition disabled:opacity-60',
                checked
                  ? 'border-primary bg-primary text-white shadow-sm shadow-primary/20'
                  : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50',
              ].join(' ')}
            >
              {checked ? <LuCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden /> : null}
              {appRoleLabel(role)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
