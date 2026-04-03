import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LuChevronRight, LuImage, LuLock, LuMessageSquare, LuPin, LuShield, LuUserPlus, LuX } from 'react-icons/lu';
import * as api from '../api/messengerApi';

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
  const navigate = useNavigate();
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

  const setPerm = (key: PermKey, value: boolean) => {
    if (!meta) return;
    setMeta({
      ...meta,
      default_permissions: { ...(meta.default_permissions ?? {}), [key]: value },
    });
  };

  const save = async () => {
    if (!chatId || !meta) return;
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
    <div className="mx-auto w-full max-w-xl px-4 pt-4 pb-24">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-sm font-bold text-stone-700 shadow-sm ring-1 ring-stone-200/70 backdrop-blur"
        >
          <LuChevronRight className="rotate-180" />
          Назад
        </button>
        <button
          type="button"
          onClick={() => navigate('/messenger')}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-sm font-bold text-stone-700 shadow-sm ring-1 ring-stone-200/70 backdrop-blur"
        >
          <LuX />
          Закрыть
        </button>
      </div>

      <div className="mt-6 rounded-3xl bg-white/80 p-5 shadow-[0_10px_30px_rgba(28,25,23,0.08)] ring-1 ring-stone-200/70 backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <LuLock size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold text-stone-900">Разрешения</p>
            <p className="mt-1 text-sm font-semibold text-stone-500">
              Эти настройки применяются ко всем участникам по умолчанию (кроме владельца и админов).
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <ToggleRow
          Icon={LuMessageSquare}
          title="Разрешить отправку сообщений"
          description="Обычные участники смогут писать"
          value={!!perms.can_send_messages}
          onChange={(v) => setPerm('can_send_messages', v)}
        />
        <ToggleRow
          Icon={LuImage}
          title="Разрешить медиа"
          description="Фото, файлы, голосовые (в будущем)"
          value={!!perms.can_send_media}
          onChange={(v) => setPerm('can_send_media', v)}
        />
        <ToggleRow
          Icon={LuUserPlus}
          title="Разрешить добавление участников"
          description="Кто может приглашать новых людей"
          value={!!perms.can_add_users}
          onChange={(v) => setPerm('can_add_users', v)}
        />
        <ToggleRow
          Icon={LuPin}
          title="Закреплять сообщения"
          description="Кто может закреплять сообщения в шапке чата"
          value={!!perms.can_pin_messages}
          onChange={(v) => setPerm('can_pin_messages', v)}
        />
        <ToggleRow
          Icon={LuShield}
          title="Управление чатом"
          description="Смена названия, фото, разрешений (для доверенных участников)"
          value={!!perms.can_manage_chat}
          onChange={(v) => setPerm('can_manage_chat', v)}
        />
      </div>

      {err ? <p className="mt-4 text-sm font-semibold text-red-600">{err}</p> : null}

      <div className="mt-6">
        <button
          type="button"
          disabled={!meta || saving}
          onClick={() => void save()}
          className="w-full min-h-[48px] rounded-2xl bg-primary px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-primary/25 transition active:scale-[0.99] disabled:opacity-60 motion-reduce:active:scale-100"
        >
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}

function ToggleRow({
  Icon,
  title,
  description,
  value,
  onChange,
}: {
  Icon: (p: { size?: number; className?: string }) => React.ReactNode;
  title: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-3xl bg-white/80 px-5 py-4 shadow-[0_10px_30px_rgba(28,25,23,0.07)] ring-1 ring-stone-200/70 backdrop-blur">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-stone-100 text-stone-700">
        <Icon size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-extrabold text-stone-900">{title}</p>
        <p className="mt-0.5 text-sm font-semibold text-stone-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={[
          'relative h-8 w-14 rounded-full p-1 transition',
          value ? 'bg-primary' : 'bg-stone-300',
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

