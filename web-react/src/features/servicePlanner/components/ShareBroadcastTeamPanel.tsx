import type { PublicBroadcastAssignment } from '../api';

type Props = {
  assignments: PublicBroadcastAssignment[];
};

/** Компактный read-only блок «Участники трансляции» в стиле публичной share-страницы. */
export function ShareBroadcastTeamPanel({ assignments }: Props) {
  if (assignments.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5">
      <h3 className="mb-1.5 text-xs font-semibold text-stone-600">Участники трансляции</h3>
      <ul className="space-y-1">
        {assignments.map((a, index) => (
          <li
            key={`${a.role_name}-${a.member_name}-${index}`}
            className="flex min-w-0 items-center gap-1.5 text-xs leading-snug text-stone-700"
          >
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: a.role_color }}
              aria-hidden
            />
            <span className="shrink-0 font-semibold text-stone-500">{a.role_name}</span>
            <span className="shrink-0 text-stone-400" aria-hidden>
              —
            </span>
            <span className="min-w-0 truncate font-medium">{a.member_name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
