import type { ServicePlanMailingDestinations, ServicePlanMailingMessengerChat, TelegramChatRecord } from '../api';
import { fieldClass } from './ui';

export function chatTypeBadge(type: string | null): { label: string; className: string } {
  if (type === 'channel') {
    return { label: 'Канал', className: 'bg-sky-50 text-sky-800 border-sky-200' };
  }
  if (type === 'supergroup') {
    return { label: 'Супергруппа', className: 'bg-violet-50 text-violet-800 border-violet-200' };
  }
  if (type === 'group') {
    return { label: 'Группа', className: 'bg-amber-50 text-amber-900 border-amber-200' };
  }
  if (type === 'private') {
    return { label: 'Личный', className: 'bg-stone-100 text-stone-700 border-stone-200' };
  }
  return { label: type || 'Чат', className: 'bg-stone-100 text-stone-600 border-stone-200' };
}

export function chatLabel(
  chat: Pick<TelegramChatRecord, 'chat_id' | 'title' | 'type' | 'username'>,
): string {
  const title = chat.title?.trim() || (chat.username ? `@${chat.username}` : null) || chat.chat_id;
  const typeRu =
    chat.type === 'channel'
      ? 'канал'
      : chat.type === 'supergroup'
        ? 'супергруппа'
        : chat.type === 'group'
          ? 'группа'
          : chat.type === 'private'
            ? 'личный'
            : chat.type;
  return typeRu ? `${title} · ${typeRu}` : title;
}

export function chatOptionLabel(
  chat: Pick<TelegramChatRecord, 'chat_id' | 'title' | 'type' | 'username'>,
): string {
  return `${chatLabel(chat)} (${chat.chat_id})`;
}

/** Одиночный выбор чата из реестра. */
export function ChatSelect({
  label,
  hint,
  chats,
  value,
  onChange,
  allowEmpty = true,
  emptyLabel = 'Не выбран',
  emptyHint,
}: {
  label: string;
  hint: string;
  chats: TelegramChatRecord[];
  value: string;
  onChange: (v: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  emptyHint?: string;
}) {
  const known = new Set(chats.map((c) => c.chat_id));
  const orphan = value && !known.has(value) ? value : null;
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-stone-700">{label}</label>
      <p className="mb-1.5 text-xs text-stone-500">{hint}</p>
      {chats.length === 0 && !orphan ? (
        <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50/80 px-3 py-3 text-xs text-stone-500">
          {emptyHint ?? 'Сначала добавьте чаты в раздел «Чаты».'}
        </p>
      ) : (
        <select className={fieldClass()} value={value} onChange={(e) => onChange(e.target.value)}>
          {allowEmpty ? <option value="">{emptyLabel}</option> : null}
          {orphan ? <option value={orphan}>{orphan} (нет в реестре)</option> : null}
          {chats.map((chat) => (
            <option key={chat.id} value={chat.chat_id}>
              {chatOptionLabel(chat)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/** Мультивыбор Telegram-чатов из реестра — список с галочками (вместо native multi-select). */
export function ChatMultiSelect({
  label,
  hint,
  chats,
  selectedIds,
  onChange,
  emptyHint,
}: {
  label: string;
  hint: string;
  chats: TelegramChatRecord[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyHint?: string;
}) {
  const known = new Set(chats.map((c) => c.chat_id));
  const orphans = selectedIds.filter((id) => !known.has(id));
  const selected = new Set(selectedIds);

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="min-w-0 flex-1 text-xs font-semibold text-stone-700">{label}</label>
        {selectedIds.length > 0 ? (
          <span className="shrink-0 text-[11px] font-medium text-stone-500">
            Выбрано: {selectedIds.length}
          </span>
        ) : null}
      </div>
      <p className="mb-2 text-xs text-stone-500">{hint}</p>
      {chats.length === 0 && orphans.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50/80 px-3 py-3 text-xs text-stone-500">
          {emptyHint ?? 'Сначала добавьте чаты в раздел «Чаты».'}
        </p>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto overflow-x-hidden rounded-xl border border-stone-200 bg-stone-50/50 p-2">
          {orphans.map((id) => (
            <li key={`orphan-${id}`} className="min-w-0">
              <label className="flex min-w-0 cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-white">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-300 text-[#7B2D3F] focus:ring-[#7B2D3F]/30"
                  checked={selected.has(id)}
                  onChange={(e) => {
                    onChange(
                      e.target.checked
                        ? Array.from(new Set([...selectedIds, id]))
                        : selectedIds.filter((x) => x !== id),
                    );
                  }}
                />
                <span className="min-w-0 flex-1 overflow-hidden">
                  <span className="block truncate font-mono text-sm text-stone-800">{id}</span>
                  <span className="mt-0.5 block text-[11px] text-amber-700">Нет в реестре</span>
                </span>
              </label>
            </li>
          ))}
          {chats.map((chat) => {
            const checked = selected.has(chat.chat_id);
            const badge = chatTypeBadge(chat.type);
            const title =
              chat.title?.trim() || (chat.username ? `@${chat.username}` : null) || chat.chat_id;
            return (
              <li key={chat.id} className="min-w-0">
                <label className="flex min-w-0 cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-white">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-300 text-[#7B2D3F] focus:ring-[#7B2D3F]/30"
                    checked={checked}
                    onChange={(e) => {
                      onChange(
                        e.target.checked
                          ? Array.from(new Set([...selectedIds, chat.chat_id]))
                          : selectedIds.filter((x) => x !== chat.chat_id),
                      );
                    }}
                  />
                  <span className="min-w-0 flex-1 overflow-hidden">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="min-w-0 break-words text-sm font-medium text-stone-900">
                        {title}
                      </span>
                      <span
                        className={`inline-flex shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-stone-400">
                      {chat.chat_id}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {selectedIds.length === 0 ? (
        <p className="mt-1.5 text-[11px] text-amber-700/80">
          Telegram не выбран — уйдёт только в отмеченные чаты приложения (если есть).
        </p>
      ) : null}
    </div>
  );
}

export function MailingDestinationsEditor({
  value,
  onChange,
  chats,
  chatsLoading,
  telegramChats,
  purpose,
}: {
  value: ServicePlanMailingDestinations;
  onChange: (next: ServicePlanMailingDestinations) => void;
  chats: ServicePlanMailingMessengerChat[];
  chatsLoading: boolean;
  telegramChats: TelegramChatRecord[];
  purpose: 'mailing' | 'published';
}) {
  const selected = new Set(value.messenger_conversation_ids);

  return (
    <div className="min-w-0 space-y-4">
      <ChatMultiSelect
        label="Telegram — чаты из реестра"
        hint="Отметьте один или несколько чатов."
        chats={telegramChats}
        selectedIds={value.telegram_chat_ids}
        onChange={(telegram_chat_ids) => onChange({ ...value, telegram_chat_ids })}
        emptyHint="Реестр пуст — добавьте чаты в разделе «Чаты»."
      />

      <div className="min-w-0">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="min-w-0 flex-1 text-xs font-semibold text-stone-700">
            Чаты в приложении
          </label>
          {value.messenger_conversation_ids.length > 0 ? (
            <span className="shrink-0 text-[11px] font-medium text-stone-500">
              Выбрано: {value.messenger_conversation_ids.length}
            </span>
          ) : null}
        </div>
        <p className="mb-2 text-xs text-stone-500">
          Отметьте каналы или группы проекта. Можно выбрать несколько.
        </p>
        {chatsLoading ? (
          <p className="text-xs text-stone-500">Загрузка чатов…</p>
        ) : chats.length === 0 ? (
          <p className="rounded-lg border border-dashed border-stone-200 bg-stone-50/80 px-3 py-3 text-xs text-stone-500">
            Пока нет каналов или групп в мессенджере. Создайте их в приложении — они появятся здесь.
          </p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto overflow-x-hidden rounded-xl border border-stone-200 bg-stone-50/50 p-2">
            {chats.map((chat) => {
              const checked = selected.has(chat.id);
              const recommended = chat.recommended_for.includes(purpose);
              return (
                <li key={chat.id} className="min-w-0">
                  <label className="flex min-w-0 cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-white">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-stone-300 text-[#7B2D3F] focus:ring-[#7B2D3F]/30"
                      checked={checked}
                      onChange={(e) => {
                        const nextIds = e.target.checked
                          ? Array.from(new Set([...value.messenger_conversation_ids, chat.id]))
                          : value.messenger_conversation_ids.filter((id) => id !== chat.id);
                        onChange({ ...value, messenger_conversation_ids: nextIds });
                      }}
                    />
                    <span className="min-w-0 flex-1 overflow-hidden">
                      <span className="block break-words text-sm font-medium text-stone-900">
                        {chat.title}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-stone-500">
                        {chat.type === 'group' ? 'Группа' : 'Канал'}
                        {recommended ? ' · рекомендуется' : ''}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
