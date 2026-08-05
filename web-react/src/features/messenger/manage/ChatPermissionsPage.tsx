import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LuImage, LuLock, LuMessageSquare, LuPin, LuShield, LuUserPlus } from 'react-icons/lu';
import * as api from '../api/messengerApi';
import { useAuthStore } from '../../auth/authStore';
import { ManageScreenShell, ManageSettingsGroup } from './ManageScreenShell';
import { canManageGroupMessenger, isAppAdministratorRole } from './messengerManageAccess';

type PermKey = 'can_send_messages' | 'can_send_media' | 'can_add_users' | 'can_pin_messages' | 'can_manage_chat';

function axiosMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { error?: string } } }).response?.data;
    if (data?.error && typeof data.error === 'string' && data.error.trim()) return data.error.trim();
  }
  return 'Произошла ошибка';
}

const DEFAULTS: Record<PermKey, boolean> = {
  can_send_messages: true,
  can_send_media: true,
  can_add_users: false,
  can_pin_messages: false,
  can_manage_chat: false,
};

export function ChatPermissionsPage() {
  const { chatId } = useParams<{ chatId: string }>();
  const authRole = useAuthStore((s) => s.role);
  const authRoles = useAuthStore((s) => s.roles);
  const isAppAdministrator = useMemo(
    () => isAppAdministratorRole(authRole, authRoles),
    [authRole, authRoles],
  );
  const [meta, setMeta] = useState<api.ConversationMeta | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!chatId) return;
    let alive = true;
    setErr(null);
    void api
      .fetchConversationMeta(chatId)
      .then((m) => {
        if (!alive) return;
        setMeta(m);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(`Не удалось загрузить разрешения: ${axiosMessage(e)}`);
      });
    return () => {
      alive = false;
    };
  }, [chatId]);

  const perms = useMemo(() => {
    const p = (meta?.default_permissions ?? {}) as Record<string, boolean>;
    return { ...DEFAULTS, ...p } as Record<PermKey, boolean>;
  }, [meta]);

  const canEdit = canManageGroupMessenger(meta?.my_effective_permissions, isAppAdministrator);

  const setPerm = (key: PermKey, value: boolean) => {
    if (!canEdit || !meta) return;
    setMeta({
      ...meta,
      default_permissions: { ...(meta.default_permissions ?? {}), [key]: value },
    });
  };

  const save = async () => {
    if (!canEdit || !chatId || !meta) return;
    setSaving(true);
    setErr(null);
    try {
      await api.patchConversationPermissions(chatId, {
        default_permissions: (meta.default_permissions ?? {}) as Record<string, boolean>,
      });
    } catch (e) {
      setErr(`Не удалось сохранить: ${axiosMessage(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ManageScreenShell>
      <ManageSettingsGroup className="mt-4 divide-y divide-stone-200/70 dark:divide-[var(--border)]">
        <div className="flex items-start gap-3 p-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <LuLock size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-[var(--text)]">Разрешения</p>
            <p className="mt-1 text-sm leading-snug text-[var(--text-secondary)]">
              По умолчанию для участников (кроме владельца и админов).
            </p>
            {!canEdit && meta ? (
              <p className="mt-2 rounded-xl bg-amber-50/95 p-3 text-sm font-medium leading-snug text-amber-950 ring-1 ring-amber-200/80 dark:bg-primary/10 dark:text-[var(--text)] dark:ring-[var(--border-hover)]">
                Изменять разрешения могут только администраторы приложения или участники с правом «Управление чатом».
              </p>
            ) : null}
          </div>
        </div>
        <ToggleRow
          Icon={LuMessageSquare}
          title="Отправка сообщений"
          description="Обычные участники смогут писать"
          value={!!perms.can_send_messages}
          disabled={!canEdit}
          onChange={(v) => setPerm('can_send_messages', v)}
        />
        <ToggleRow
          Icon={LuImage}
          title="Медиа"
          description="Фото, файлы, голосовые и аудио"
          value={!!perms.can_send_media}
          disabled={!canEdit}
          onChange={(v) => setPerm('can_send_media', v)}
        />
        <ToggleRow
          Icon={LuUserPlus}
          title="Добавление участников"
          description="Кто может приглашать людей"
          value={!!perms.can_add_users}
          disabled={!canEdit}
          onChange={(v) => setPerm('can_add_users', v)}
        />
        <ToggleRow
          Icon={LuPin}
          title="Закрепление сообщений"
          description="В шапке чата"
          value={!!perms.can_pin_messages}
          disabled={!canEdit}
          onChange={(v) => setPerm('can_pin_messages', v)}
        />
        <ToggleRow
          Icon={LuShield}
          title="Управление чатом"
          description="Название, фото, разрешения (у новых участников по умолчанию выкл.)"
          value={!!perms.can_manage_chat}
          disabled={!canEdit}
          onChange={(v) => setPerm('can_manage_chat', v)}
        />
      </ManageSettingsGroup>

      {err ? <p className="mt-3 text-sm font-medium text-red-600 dark:text-rose-300">{err}</p> : null}

      <div className="mt-5 px-0.5">
        <button
          type="button"
          disabled={!meta || saving || !canEdit}
          onClick={() => void save()}
          className="w-full min-h-[48px] rounded-xl bg-primary px-5 py-3 text-base font-semibold text-white shadow-sm transition active:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
    </ManageScreenShell>
  );
}

function ToggleRow({
  Icon,
  title,
  description,
  value,
  disabled,
  onChange,
}: {
  Icon: (p: { size?: number; className?: string }) => React.ReactNode;
  title: string;
  description: string;
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className={[
        'flex items-center gap-3 px-4 py-3',
        disabled ? 'opacity-55' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--surface)] text-[var(--text-secondary)]">
        <Icon size={18} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-normal text-[var(--text)]">{title}</p>
        <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onChange(!value);
        }}
        className={[
          'relative h-8 w-14 rounded-full p-1 transition',
          value ? 'bg-primary shadow-[0_0_20px_var(--primary-glow)]' : 'bg-stone-300 dark:bg-[var(--bg-interactive)]',
          disabled ? 'cursor-not-allowed' : '',
        ].join(' ')}
      >
        <span
          className={[
            'block h-6 w-6 rounded-full bg-white shadow transition',
            value ? 'translate-x-6' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </div>
  );
}

