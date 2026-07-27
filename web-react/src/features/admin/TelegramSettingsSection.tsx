import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useEffect, useMemo, useState } from 'react';
import { LuCheck, LuCircleAlert, LuClock, LuSend } from 'react-icons/lu';

import {
  apiErrorMessage,
  fetchTelegramDispatchRecipients,
  fetchTelegramDispatchSettings,
  fetchTelegramSettings,
  humanizeTelegramError,
  patchTelegramDispatchSettings,
  patchTelegramSettings,
  runServicePlanMondayMailing,
  runTelegramDispatchNow,
  sendTelegramMessage,
  testTelegramConnection,
  type TelegramDispatchRecipient,
  type TelegramDispatchSettingsResponse,
  type TelegramSettingsResponse,
} from './api';

const Q_TG = ['admin', 'telegram', 'settings'] as const;
const Q_TG_DISPATCH = ['admin', 'telegram', 'dispatch-settings'] as const;
const Q_TG_RECIPIENTS = ['admin', 'telegram', 'recipients'] as const;

type TgTab = 'bot' | 'chats' | 'prayer' | 'program' | 'dispatch';

const TABS: { id: TgTab; label: string }[] = [
  { id: 'bot', label: 'Бот' },
  { id: 'chats', label: 'Чаты' },
  { id: 'prayer', label: 'Молитва' },
  { id: 'program', label: 'Программа' },
  { id: 'dispatch', label: 'Рассылка' },
];

const PRAYER_PLACEHOLDERS = [
  '{{date}}',
  '{{member_name}}',
  '{{member_prayer_request}}',
  '{{member_prayer_request_bullets}}',
  '{{theme_title}}',
  '{{theme_bible_verse}}',
  '{{theme_prayer_points}}',
  '{{ministry_title}}',
  '{{ministry_prayer_points}}',
  '{{backslider_name}}',
  '{{all_themes_block}}',
  '{{all_ministries_block}}',
  '{{all_backsliders_inline}}',
];

const PROGRAM_PLACEHOLDERS = [
  '{{sunday_heading}}',
  '{{date}}',
  '{{preacher}}',
  '{{music}}',
  '{{poem}}',
  '{{leader}}',
  '{{choir_line}}',
  '{{sermon_topic}}',
  '{{sermon_scripture}}',
  '{{sermon_topic_block}}',
  '{{sermon_scripture_block}}',
  '{{share_url}}',
];

function fieldClass() {
  return (
    'w-full rounded-xl border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none ' +
    'focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-stone-400'
  );
}

function btnPrimary(className = '') {
  return `rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:opacity-95 disabled:opacity-50 ${className}`;
}

function btnSecondary(className = '') {
  return `rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50 ${className}`;
}

function normalizeUiString(value: string): string | null {
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function normalizeUiOptionalUpdateString(value: string): string | undefined {
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50/70 px-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-stone-900">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-stone-500">{hint}</span> : null}
      </span>
      <span className="relative inline-block h-6 w-11 shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="absolute inset-0 cursor-pointer rounded-full bg-stone-300 transition-colors peer-checked:bg-[#7B2D3F]" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

function PlaceholderHelp({ items }: { items: string[] }) {
  return (
    <details className="rounded-lg border border-stone-100 bg-stone-50/80 px-3 py-2">
      <summary className="cursor-pointer text-xs font-semibold text-stone-700">Подстановки</summary>
      <p className="mt-2 flex flex-wrap gap-1.5">
        {items.map((v) => (
          <code
            key={v}
            className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-stone-700 shadow-sm"
          >
            {v}
          </code>
        ))}
      </p>
    </details>
  );
}

function ChatField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-stone-700">{label}</label>
      <p className="mb-1.5 text-xs text-stone-500">{hint}</p>
      <input
        className={fieldClass()}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="-100…"
        inputMode="numeric"
      />
    </div>
  );
}

export function TelegramSettingsSection() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: Q_TG,
    queryFn: fetchTelegramSettings,
  });
  const dispatchQ = useQuery({
    queryKey: Q_TG_DISPATCH,
    queryFn: fetchTelegramDispatchSettings,
  });
  const recipientsQ = useQuery({
    queryKey: Q_TG_RECIPIENTS,
    queryFn: fetchTelegramDispatchRecipients,
  });

  const [tab, setTab] = useState<TgTab>('bot');
  const [form, setForm] = useState({
    enabled: false,
    bot_token: '',
    prayer_chat_id: '',
    coordinator_chat_id: '',
    default_chat_id: '',
    prayer_template: '',
    service_plan_chat_id: '',
    service_plan_template: '',
  });
  const [customText, setCustomText] = useState('');
  const [customChatId, setCustomChatId] = useState('');
  const [dispatchForm, setDispatchForm] = useState<TelegramDispatchSettingsResponse>({
    enabled: false,
    kind: 'daily',
    time_hhmm: '09:00',
    once_at_iso: null,
    once_at_local: null,
    target: 'all',
    member_ids: [],
    last_sent_at_iso: null,
    server_timezone:
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
        : 'UTC',
    last_sent_label: null,
  });
  const [note, setNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      enabled: data.enabled,
      bot_token: '',
      prayer_chat_id: data.prayer_chat_id ?? '',
      coordinator_chat_id: data.coordinator_chat_id ?? '',
      default_chat_id: data.default_chat_id ?? '',
      prayer_template: data.prayer_template ?? '',
      service_plan_chat_id: data.service_plan_chat_id ?? '',
      service_plan_template: data.service_plan_template ?? '',
    });
  }, [data]);

  useEffect(() => {
    if (!dispatchQ.data) return;
    setDispatchForm(dispatchQ.data);
  }, [dispatchQ.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      patchTelegramSettings({
        enabled: form.enabled,
        bot_token: normalizeUiOptionalUpdateString(form.bot_token),
        prayer_chat_id: normalizeUiString(form.prayer_chat_id),
        coordinator_chat_id: normalizeUiString(form.coordinator_chat_id),
        default_chat_id: normalizeUiString(form.default_chat_id),
        prayer_template: normalizeUiString(form.prayer_template),
        service_plan_chat_id: normalizeUiString(form.service_plan_chat_id),
        service_plan_template: normalizeUiString(form.service_plan_template),
      }),
    onSuccess: (next) => {
      setNote({ type: 'ok', text: 'Настройки сохранены.' });
      qc.setQueryData(Q_TG, next);
      setForm((prev) => ({ ...prev, bot_token: '' }));
    },
    onError: (e) =>
      setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить настройки.') }),
  });

  const sendMut = useMutation({
    mutationFn: (payload: {
      kind: 'prayer_today' | 'next_week' | 'custom' | 'prayer_today_all_members';
      text?: string;
      chat_id?: string;
    }) => sendTelegramMessage(payload),
    onSuccess: (r) => {
      if (r.kind === 'prayer_today_all_members') {
        setNote({
          type: 'ok',
          text: `Рассылка выполнена. Отправлено: ${r.sent_count ?? 0}.`,
        });
        return;
      }
      setNote({ type: 'ok', text: `Отправлено в чат ${r.chat_id}.` });
    },
    onError: (e) =>
      setNote({ type: 'err', text: humanizeTelegramError(e, 'Ошибка отправки в Telegram.') }),
  });

  const saveDispatchMut = useMutation({
    mutationFn: () =>
      patchTelegramDispatchSettings({
        enabled: dispatchForm.enabled,
        kind: dispatchForm.kind,
        time_hhmm: dispatchForm.time_hhmm,
        target: dispatchForm.target,
        member_ids: dispatchForm.member_ids,
        once_at_local: dispatchForm.kind === 'once' ? dispatchForm.once_at_local : null,
      }),
    onSuccess: (next) => {
      setDispatchForm(next);
      qc.setQueryData(Q_TG_DISPATCH, next);
      setNote({ type: 'ok', text: 'Планировщик сохранён.' });
    },
    onError: (e) =>
      setNote({ type: 'err', text: humanizeTelegramError(e, 'Не удалось сохранить планировщик.') }),
  });

  const runDispatchNowMut = useMutation({
    mutationFn: () => runTelegramDispatchNow(),
    onSuccess: (r) => {
      setNote({
        type: 'ok',
        text: `Рассылка отправлена (${r.mode === 'all' ? 'всем' : 'выбранным'}): ${r.sent_count}.`,
      });
      void qc.invalidateQueries({ queryKey: Q_TG_DISPATCH });
    },
    onError: (e) =>
      setNote({ type: 'err', text: humanizeTelegramError(e, 'Не удалось запустить рассылку.') }),
  });

  const testConnectionMut = useMutation({
    mutationFn: () =>
      testTelegramConnection(form.bot_token.trim() ? { bot_token: form.bot_token.trim() } : undefined),
    onSuccess: (r) => {
      const handle = r.username ? `@${r.username}` : `id ${r.id}`;
      const name = r.first_name?.trim() ? r.first_name : 'бот';
      setNote({ type: 'ok', text: `Подключение OK: ${handle}, ${name}.` });
    },
    onError: (e) =>
      setNote({
        type: 'err',
        text: humanizeTelegramError(e, 'Не удалось проверить подключение к Telegram.'),
      }),
  });

  const programMailingMut = useMutation({
    mutationFn: () => runServicePlanMondayMailing({ force: true }),
    onSuccess: (r) => {
      const res = r.result;
      if (res.skipped && res.reason === 'no_service_plan') {
        setNote({
          type: 'err',
          text: `Нет программы на ${res.service_date ?? 'ближайшее воскресенье'}.`,
        });
        return;
      }
      if (!res.ok) {
        setNote({
          type: 'err',
          text: `Не удалось отправить (${res.reason ?? 'ошибка'}).`,
        });
        return;
      }
      setNote({
        type: 'ok',
        text: `Программа отправлена (${res.service_date ?? '—'}): мессенджер ${res.messenger_ok ? '✓' : '—'}, Telegram ${res.telegram_ok ? '✓' : '—'}.`,
      });
    },
    onError: (e) =>
      setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось отправить программу.') }),
  });

  const lastDispatchLabel = useMemo(() => {
    if (dispatchForm.last_sent_label) return dispatchForm.last_sent_label;
    const iso = dispatchForm.last_sent_at_iso;
    if (!iso) return null;
    try {
      return format(new Date(iso), "d MMMM yyyy 'в' HH:mm", { locale: ru });
    } catch {
      return null;
    }
  }, [dispatchForm.last_sent_label, dispatchForm.last_sent_at_iso]);

  if (isLoading || dispatchQ.isLoading || recipientsQ.isLoading) {
    return <div className="h-44 animate-pulse rounded-2xl bg-stone-200/50" />;
  }

  if (error || dispatchQ.error || recipientsQ.error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/80 p-6 text-center">
        <p className="font-semibold text-red-900">Не удалось загрузить настройки Telegram</p>
        <p className="mt-2 text-sm text-red-800">
          {apiErrorMessage(error ?? dispatchQ.error ?? recipientsQ.error, 'Ошибка сети или сервера.')}
        </p>
        <button
          type="button"
          className={btnPrimary('mt-4')}
          onClick={() => {
            void qc.invalidateQueries({ queryKey: Q_TG });
            void qc.invalidateQueries({ queryKey: Q_TG_DISPATCH });
            void qc.invalidateQueries({ queryKey: Q_TG_RECIPIENTS });
          }}
        >
          Обновить
        </button>
      </div>
    );
  }

  const settings = (data ?? {
    enabled: false,
    bot_token_masked: null,
    prayer_chat_id: null,
    coordinator_chat_id: null,
    default_chat_id: null,
    prayer_template: null,
    service_plan_chat_id: null,
    service_plan_template: null,
    has_bot_token: false,
  }) satisfies TelegramSettingsResponse;

  const recipientsCount = recipientsQ.data?.length ?? 0;
  const tokenReady = settings.has_bot_token || form.bot_token.trim().length > 0;

  function saveSettings() {
    setNote(null);
    saveMut.mutate();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {note ? (
        <div
          role="status"
          className={
            note.type === 'ok'
              ? 'rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'
              : 'rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900'
          }
        >
          {note.text}
        </div>
      ) : null}

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            aria-hidden
          >
            <LuSend className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight text-stone-900">Telegram</h2>
            <p className="mt-0.5 text-sm text-stone-500">Бот, чаты и тексты авторассылок</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                  form.enabled
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-stone-200 bg-stone-50 text-stone-600'
                }`}
              >
                {form.enabled ? <LuCheck className="h-3 w-3" aria-hidden /> : null}
                {form.enabled ? 'Включён' : 'Выключен'}
              </span>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${
                  tokenReady
                    ? 'border-stone-200 bg-white text-stone-700'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
                }`}
              >
                {!tokenReady ? <LuCircleAlert className="h-3 w-3" aria-hidden /> : null}
                {tokenReady
                  ? settings.bot_token_masked
                    ? `Токен ${settings.bot_token_masked}`
                    : 'Токен задан'
                  : 'Нет токена'}
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          className={btnPrimary('shrink-0')}
          disabled={saveMut.isPending}
          onClick={saveSettings}
        >
          {saveMut.isPending ? 'Сохранение…' : 'Сохранить'}
        </button>
      </header>

      <nav
        className="flex gap-1 overflow-x-auto rounded-xl border border-stone-200 bg-stone-50/80 p-1"
        aria-label="Разделы Telegram"
      >
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                active
                  ? 'bg-white text-stone-900 shadow-sm'
                  : 'text-stone-500 hover:bg-white/70 hover:text-stone-800'
              }`}
              aria-current={active ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      <section className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-sm">
        {tab === 'bot' ? (
          <div className="space-y-4">
            <Toggle
              checked={form.enabled}
              onChange={(enabled) => setForm((s) => ({ ...s, enabled }))}
              label="Разрешить отправку"
              hint="Выключите, чтобы временно остановить все сообщения бота."
            />
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-600" htmlFor="tg-bot-token">
                Bot Token
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id="tg-bot-token"
                  type={showToken ? 'text' : 'password'}
                  className={fieldClass()}
                  value={form.bot_token}
                  onChange={(e) => setForm((s) => ({ ...s, bot_token: e.target.value }))}
                  placeholder={
                    settings.bot_token_masked
                      ? `Оставьте пустым, чтобы не менять (${settings.bot_token_masked})`
                      : 'Токен от @BotFather'
                  }
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className={btnSecondary('shrink-0')}
                  onClick={() => setShowToken((v) => !v)}
                >
                  {showToken ? 'Скрыть' : 'Показать'}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-stone-500">
                Можно задать здесь или через <code className="rounded bg-stone-100 px-1">TELEGRAM_BOT_TOKEN</code>.
              </p>
            </div>
            <button
              type="button"
              className={btnSecondary()}
              disabled={testConnectionMut.isPending || !tokenReady}
              onClick={() => {
                setNote(null);
                testConnectionMut.mutate();
              }}
            >
              {testConnectionMut.isPending ? 'Проверка…' : 'Проверить подключение'}
            </button>
          </div>
        ) : null}

        {tab === 'chats' ? (
          <div className="space-y-5">
            <p className="text-sm text-stone-500">
              ID группы или канала обычно отрицательный (−100…). Узнать можно через @userinfobot.
            </p>
            <div className="grid gap-5 sm:grid-cols-2">
              <ChatField
                label="Молитва"
                hint="«Молитва на сегодня» и ручная отправка"
                value={form.prayer_chat_id}
                onChange={(prayer_chat_id) => setForm((s) => ({ ...s, prayer_chat_id }))}
              />
              <ChatField
                label="Координаторы"
                hint="План на неделю и ответственные"
                value={form.coordinator_chat_id}
                onChange={(coordinator_chat_id) => setForm((s) => ({ ...s, coordinator_chat_id }))}
              />
              <ChatField
                label="Запасной"
                hint="Если для типа сообщения чат не задан"
                value={form.default_chat_id}
                onChange={(default_chat_id) => setForm((s) => ({ ...s, default_chat_id }))}
              />
              <ChatField
                label="Программа служения"
                hint="Понедельник 10:00 · если пусто — запасной"
                value={form.service_plan_chat_id}
                onChange={(service_plan_chat_id) => setForm((s) => ({ ...s, service_plan_chat_id }))}
              />
            </div>
          </div>
        ) : null}

        {tab === 'prayer' ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Текст «Молитва на сегодня»</h3>
              <p className="mt-0.5 text-xs text-stone-500">
                Для канала и личной рассылки. Пустое поле — стандартный шаблон.
              </p>
            </div>
            <textarea
              className="min-h-[200px] w-full resize-y rounded-xl border border-stone-200 px-3 py-3 font-mono text-[13px] leading-relaxed text-stone-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={form.prayer_template}
              onChange={(e) => setForm((s) => ({ ...s, prayer_template: e.target.value }))}
              placeholder={
                'Сегодня {{date}} мы молимся за члена церкви:\n\n📌 {{member_name}}\nпросит молиться:\n{{member_prayer_request_bullets}}'
              }
            />
            <PlaceholderHelp items={PRAYER_PLACEHOLDERS} />
            <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-4">
              <button
                type="button"
                className={btnSecondary()}
                disabled={sendMut.isPending}
                onClick={() => {
                  setNote(null);
                  sendMut.mutate({ kind: 'prayer_today' });
                }}
              >
                Отправить в канал молитвы
              </button>
            </div>
          </div>
        ) : null}

        {tab === 'program' ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Рассылка программы служения</h3>
              <p className="mt-0.5 text-xs text-stone-500">
                Автоматически каждый понедельник в 10:00 (МСК) — в Telegram и чат «Богослужение
                (планирование)». Чат задаётся во вкладке «Чаты».
              </p>
            </div>
            <textarea
              className="min-h-[240px] w-full resize-y rounded-xl border border-stone-200 px-3 py-3 font-mono text-[13px] leading-relaxed text-stone-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={form.service_plan_template}
              onChange={(e) => setForm((s) => ({ ...s, service_plan_template: e.target.value }))}
              placeholder={
                '{{sunday_heading}}\n1. Проповедник — {{preacher}}\n{{sermon_topic_block}}{{sermon_scripture_block}}2. Группа прославления — {{music}}…\n8. Ссылка: {{share_url}}'
              }
            />
            <PlaceholderHelp items={PROGRAM_PLACEHOLDERS} />
            <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-4">
              <button
                type="button"
                className={btnSecondary()}
                disabled={programMailingMut.isPending}
                onClick={() => {
                  setNote(null);
                  programMailingMut.mutate();
                }}
              >
                {programMailingMut.isPending ? 'Отправка…' : 'Отправить сейчас'}
              </button>
              <span className="self-center text-xs text-stone-400">
                Нужна программа на ближайшее воскресенье
              </span>
            </div>
          </div>
        ) : null}

        {tab === 'dispatch' ? (
          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Личная авторассылка молитвы</h3>
              <p className="mt-0.5 text-xs text-stone-500">
                Участникам с Telegram ID в карточке. Часовой пояс сервера:{' '}
                <code className="rounded bg-stone-100 px-1 text-[11px]">{dispatchForm.server_timezone}</code>
              </p>
            </div>

            {lastDispatchLabel ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
                <LuClock className="h-4 w-4 shrink-0 text-stone-500" aria-hidden />
                Последняя отправка: <span className="font-medium text-stone-900">{lastDispatchLabel}</span>
              </div>
            ) : null}

            <Toggle
              checked={dispatchForm.enabled}
              onChange={(enabled) => setDispatchForm((s) => ({ ...s, enabled }))}
              label="Включить по расписанию"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-600">Режим</label>
                <select
                  className={fieldClass()}
                  value={dispatchForm.kind}
                  onChange={(e) =>
                    setDispatchForm((s) => ({
                      ...s,
                      kind: e.target.value as 'daily' | 'once',
                    }))
                  }
                >
                  <option value="daily">Каждый день</option>
                  <option value="once">Один раз</option>
                </select>
              </div>
              {dispatchForm.kind === 'daily' ? (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-600">Время</label>
                  <input
                    type="time"
                    className={fieldClass()}
                    value={dispatchForm.time_hhmm ?? '09:00'}
                    onChange={(e) => setDispatchForm((s) => ({ ...s, time_hhmm: e.target.value }))}
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-stone-600">Дата</label>
                    <input
                      type="date"
                      className={fieldClass()}
                      value={dispatchForm.once_at_local?.split('T')[0] ?? ''}
                      onChange={(e) => {
                        const d = e.target.value;
                        setDispatchForm((s) => {
                          const t = s.once_at_local?.split('T')[1]?.slice(0, 5) ?? '09:00';
                          return { ...s, once_at_local: d ? `${d}T${t}` : null };
                        });
                      }}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-stone-600">Время</label>
                    <input
                      type="time"
                      className={fieldClass()}
                      value={dispatchForm.once_at_local?.split('T')[1]?.slice(0, 5) ?? ''}
                      onChange={(e) => {
                        const tim = e.target.value;
                        setDispatchForm((s) => {
                          const d = s.once_at_local?.split('T')[0];
                          if (!d || !tim) return s;
                          return { ...s, once_at_local: `${d}T${tim}` };
                        });
                      }}
                    />
                  </div>
                </>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-600">Кому</label>
                <select
                  className={fieldClass()}
                  value={dispatchForm.target}
                  onChange={(e) =>
                    setDispatchForm((s) => ({
                      ...s,
                      target: e.target.value as 'all' | 'selected',
                    }))
                  }
                >
                  <option value="all">Всем с Telegram ID ({recipientsCount})</option>
                  <option value="selected">Только выбранным</option>
                </select>
              </div>
            </div>

            {dispatchForm.target === 'selected' ? (
              <div className="rounded-xl border border-stone-200 p-3">
                {recipientsCount === 0 ? (
                  <p className="text-sm text-amber-800">
                    Нет участников с Telegram ID — добавьте в карточках.
                  </p>
                ) : (
                  <div className="max-h-48 space-y-1 overflow-y-auto">
                    {(recipientsQ.data ?? []).map((u: TelegramDispatchRecipient) => {
                      const checked = dispatchForm.member_ids.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-stone-50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setDispatchForm((s) => ({
                                ...s,
                                member_ids: e.target.checked
                                  ? Array.from(new Set([...s.member_ids, u.id]))
                                  : s.member_ids.filter((id) => id !== u.id),
                              }))
                            }
                          />
                          <span className="text-sm text-stone-700">{u.name}</span>
                          <span className="text-xs text-stone-400">({u.telegram_chat_id})</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={btnPrimary()}
                disabled={saveDispatchMut.isPending}
                onClick={() => {
                  setNote(null);
                  saveDispatchMut.mutate();
                }}
              >
                {saveDispatchMut.isPending ? 'Сохранение…' : 'Сохранить планировщик'}
              </button>
              <button
                type="button"
                className={btnSecondary()}
                disabled={runDispatchNowMut.isPending}
                onClick={() => {
                  setNote(null);
                  runDispatchNowMut.mutate();
                }}
              >
                {runDispatchNowMut.isPending ? 'Отправка…' : 'Отправить сейчас'}
              </button>
            </div>

            <div className="space-y-3 border-t border-stone-100 pt-5">
              <h3 className="text-sm font-semibold text-stone-900">Ручная отправка</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className={btnSecondary('w-full justify-center')}
                  disabled={sendMut.isPending}
                  onClick={() => {
                    setNote(null);
                    sendMut.mutate({ kind: 'next_week' });
                  }}
                >
                  План координаторам
                </button>
                <button
                  type="button"
                  className={btnSecondary('w-full justify-center')}
                  disabled={sendMut.isPending}
                  onClick={() => {
                    setNote(null);
                    sendMut.mutate({ kind: 'prayer_today_all_members' });
                  }}
                >
                  Молитва всем с ID
                </button>
              </div>
              <textarea
                className={`${fieldClass()} min-h-[88px]`}
                placeholder="Свой текст…"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className={fieldClass()}
                  placeholder="chat_id (необязательно)"
                  value={customChatId}
                  onChange={(e) => setCustomChatId(e.target.value)}
                />
                <button
                  type="button"
                  className={btnPrimary('shrink-0')}
                  disabled={sendMut.isPending || customText.trim().length === 0}
                  onClick={() => {
                    setNote(null);
                    sendMut.mutate({
                      kind: 'custom',
                      text: customText,
                      chat_id: customChatId.trim() || undefined,
                    });
                  }}
                >
                  {sendMut.isPending ? 'Отправка…' : 'Отправить'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
