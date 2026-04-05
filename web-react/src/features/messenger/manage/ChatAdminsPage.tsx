import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LuCrown, LuShield } from 'react-icons/lu';
import * as api from '../api/messengerApi';
import { ManageScreenShell, ManageSettingsGroup } from './ManageScreenShell';

export function ChatAdminsPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const [members, setMembers] = useState<api.ConversationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!chatId) return;
    let alive = true;
    setLoading(true);
    setErr(null);
    void api
      .fetchConversationMembers(chatId)
      .then((m) => {
        if (!alive) return;
        setMembers(m);
      })
      .catch(() => {
        if (!alive) return;
        setErr('Не удалось загрузить администраторов');
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [chatId]);

  const owner = useMemo(() => members.find((m) => m.role === 'owner') ?? null, [members]);
  const admins = useMemo(() => members.filter((m) => m.role === 'admin'), [members]);

  const rows: { m: api.ConversationMember; kind: 'owner' | 'admin' }[] = [
    ...(owner ? [{ m: owner, kind: 'owner' as const }] : []),
    ...admins.map((a) => ({ m: a, kind: 'admin' as const })),
  ];

  return (
    <ManageScreenShell>
      <ManageSettingsGroup className="mt-4 divide-y divide-gray-200/70">
        <div className="p-4">
          <p className="text-[17px] font-semibold text-gray-900">Администраторы</p>
          <p className="mt-1 text-[13px] leading-snug text-gray-500">
            Владелец с полным доступом. Для админов — персональные права в списке участников.
          </p>
        </div>
        {loading ? (
          <div className="space-y-0 p-4">
            <div className="h-12 animate-pulse rounded-lg bg-gray-100" />
            <div className="mt-2 h-12 animate-pulse rounded-lg bg-gray-100" />
          </div>
        ) : err ? (
          <div className="p-4">
            <p className="text-sm font-medium text-red-600">{err}</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">Администраторов нет</div>
        ) : (
          rows.map((row) => <RoleRow key={row.m.member_id} m={row.m} kind={row.kind} />)
        )}
      </ManageSettingsGroup>
    </ManageScreenShell>
  );
}

function RoleRow({ m, kind }: { m: api.ConversationMember; kind: 'owner' | 'admin' }) {
  const displayName = (m.first_name ? `${m.first_name} ${m.last_name ?? ''}`.trim() : m.name) || `Участник ${m.member_id}`;
  const badge =
    kind === 'owner'
      ? { text: 'Владелец', Icon: LuCrown, cls: 'bg-amber-50 text-amber-700 ring-amber-200/70' }
      : { text: 'Админ', Icon: LuShield, cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200/70' };

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
        {displayName[0]?.toUpperCase() ?? 'U'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-gray-900">{displayName}</p>
        <p className="mt-0.5 text-xs text-gray-500">ID: {m.member_id}</p>
      </div>
      <div className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${badge.cls}`}>
        <badge.Icon size={14} />
        {badge.text}
      </div>
    </div>
  );
}

