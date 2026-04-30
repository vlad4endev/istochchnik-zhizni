import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import {
  fetchAdminNotificationSettings,
  patchNotificationSettings,
} from '../notifications/notificationSettingsApi';
import type { NotificationImportance, NotificationRepeat, NotificationRule } from '../notifications/notificationSettingsTypes';
import { apiErrorMessage } from './api';

const Q_NOTIF = ['admin', 'notifications', 'settings'] as const;
const Q_NOTIF_PUBLIC = ['notification-settings', 'public'] as const;

const WEEK_DAYS_RU = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четвер', 'Пятница', 'Суббота'];

function customBodyHint(ruleId: NotificationRule['id']): string | null {
  switch (ruleId) {
    case 'birthday_today':
    case 'birthday_week':
      return 'Можно использовать {names} (имена именинников), для today также {date}.';
    case 'prayer_reminder':
      return 'Можно использовать {date}.';
    case 'coordinator_week_digest':
      return 'Можно использовать {participants}.';
    case 'coordinator_missing_need_tomorrow':
    case 'coordinator_missing_need_today_escalation':
      return 'Можно использовать {memberName} и {date}.';
    default:
      return null;
  }
}

function fieldClass() {
  return (
    'w-full rounded-xl border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none ' +
    'focus:border-primary focus:ring-2 focus:ring-primary/20'
  );
}

function btnPrimary(c = '') {
  return `rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:opacity-95 disabled:opacity-50 ${c}`;
}

function btnSecondary(c = '') {
  return `rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 ${c}`;
}

export function NotificationsSettingsSection() {
  const qc = useQueryClient();
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: Q_NOTIF,
    queryFn: fetchAdminNotificationSettings,
  });

  const [timezone, setTimezone] = useState('Europe/Moscow');
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [note, setNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [permNote, setPermNote] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setTimezone(data.timezone || 'Europe/Moscow');
    setRules(data.rules.map((r) => ({ ...r })));
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => patchNotificationSettings({ timezone: timezone.trim(), rules }),
    onSuccess: () => {
      setNote({ type: 'ok', text: 'Настройки уведомлений сохранены. Они применяются для push-сервера и для напоминаний в браузере.' });
      void qc.invalidateQueries({ queryKey: Q_NOTIF });
      void qc.invalidateQueries({ queryKey: Q_NOTIF_PUBLIC });
    },
    onError: (e) =>
      setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить настройки уведомлений.') }),
  });

  async function requestBrowserPermission() {
    setPermNote(null);
    if (typeof Notification === 'undefined') {
      setPermNote('Этот браузер не поддерживает уведомления.');
      return;
    }
    const r = await Notification.requestPermission();
    if (r === 'granted') {
      setPermNote('Разрешение получено: напоминания будут показываться, когда открыто приложение.');
    } else {
      setPermNote('Разрешение не выдано — включите уведомления в настройках сайта в браузере.');
    }
  }

  const updateRule = (id: NotificationRule['id'], patch: Partial<NotificationRule>) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  if (isLoading) {
    return <div className="h-44 animate-pulse rounded-2xl bg-stone-200/50" />;
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/80 p-6 text-center">
        <p className="font-semibold text-red-900">Не удалось загрузить настройки</p>
        <p className="mt-2 text-sm text-red-800">{apiErrorMessage(error, 'Ошибка сети или сервера.')}</p>
        <button type="button" className={btnPrimary('mt-4')} onClick={() => void qc.invalidateQueries({ queryKey: Q_NOTIF })}>
          Обновить
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-5">
      {note ? (
        <div
          className={
            note.type === 'ok'
              ? 'rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'
              : 'rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900'
          }
        >
          {note.text}
        </div>
      ) : null}

      <section className="rounded-[10px] border border-[#F0E9EA] bg-white p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[240px]">
            <label className="mb-1 block text-xs font-semibold text-stone-600">Часовой пояс</label>
            <select
              className={fieldClass()}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              <option value="Europe/Moscow">Europe/Moscow</option>
              <option value="Europe/Kyiv">Europe/Kyiv</option>
              <option value="Europe/Minsk">Europe/Minsk</option>
              <option value="Asia/Yerevan">Asia/Yerevan</option>
            </select>
          </div>
          <button
            type="button"
            className="rounded-lg border border-[#D4B8BE] bg-[#F3EEF0] px-4 py-2.5 text-sm font-medium text-[#7B2D3F]"
            onClick={() => void requestBrowserPermission()}
          >
            🔔 Разрешить уведомления в браузере
          </button>
        </div>
        {permNote ? <p className="mt-2 text-xs text-stone-600">{permNote}</p> : null}
        {isFetching && !isLoading ? (
          <p className="mt-2 text-xs font-medium text-stone-500">Обновление данных…</p>
        ) : null}
      </section>

      <div className="space-y-4">
        {rules.map((rule) => (
          <article
            key={rule.id}
            className={[
              'rounded-xl border border-[#F0E9EA] bg-white p-4 transition-opacity sm:p-5',
              rule.enabled ? '' : 'opacity-50',
            ].join(' ')}
          >
            <div className="mb-4 flex items-center gap-3">
              <label className="relative inline-block h-5 w-9 shrink-0">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={rule.enabled}
                  onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                />
                <span className="absolute inset-0 cursor-pointer rounded-[10px] bg-stone-200 transition-colors peer-checked:bg-[#7B2D3F]" />
                <span className="absolute left-[3px] top-[3px] h-[14px] w-[14px] rounded-full bg-white transition-transform peer-checked:translate-x-4" />
              </label>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-stone-900">{rule.title}</div>
                <code className="text-[11px] text-stone-400">{rule.id}</code>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-600">Заголовок</label>
                <input
                  className={fieldClass()}
                  value={rule.title}
                  onChange={(e) => updateRule(rule.id, { title: e.target.value })}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-stone-600">
                  Текст уведомления <span className="font-normal text-stone-400">необязательно</span>
                </label>
                <textarea
                  rows={3}
                  className={`${fieldClass()} min-h-[84px] resize-y`}
                  value={rule.customBody ?? ''}
                  onChange={(e) => updateRule(rule.id, { customBody: e.target.value })}
                  placeholder="Если пусто — отправится стандартный текст правила."
                />
                <p className="mt-1 text-[11px] text-stone-400">{customBodyHint(rule.id) ?? 'Можно использовать {date}'}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[120px_1fr_1fr]">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-600">Время</label>
                  <input
                    type="time"
                    className={fieldClass()}
                    value={rule.time.length === 5 ? rule.time : '09:00'}
                    onChange={(e) => updateRule(rule.id, { time: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-600">Важность</label>
                  <select
                    className={fieldClass()}
                    value={rule.importance}
                    onChange={(e) =>
                      updateRule(rule.id, { importance: e.target.value as NotificationImportance })
                    }
                  >
                    <option value="high">Высокая</option>
                    <option value="normal">Нормальная</option>
                    <option value="low">Низкая</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-600">Повтор</label>
                  <select
                    className={fieldClass()}
                    value={rule.repeat}
                    onChange={(e) => updateRule(rule.id, { repeat: e.target.value as NotificationRepeat })}
                  >
                    <option value="day">Каждый день</option>
                    <option value="week">По неделям</option>
                    <option value="month">Ежемесячно</option>
                    <option value="year">Единоразово (годовой)</option>
                  </select>
                </div>
              </div>
            </div>

            {rule.repeat === 'week' ? (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold text-stone-600">День недели</label>
                <select
                  className={fieldClass()}
                  value={String(rule.weekDay)}
                  onChange={(e) => updateRule(rule.id, { weekDay: Number(e.target.value) })}
                >
                  {WEEK_DAYS_RU.map((label, i) => (
                    <option key={label} value={String(i)}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {rule.repeat === 'month' ? (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold text-stone-600">Число месяца (1–31)</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  className={fieldClass()}
                  value={rule.monthDay}
                  onChange={(e) => updateRule(rule.id, { monthDay: Number(e.target.value) })}
                />
              </div>
            ) : null}

            {rule.repeat === 'year' ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-600">Месяц (1–12)</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    className={fieldClass()}
                    value={rule.yearMonth}
                    onChange={(e) => updateRule(rule.id, { yearMonth: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-stone-600">Число (1–31)</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    className={fieldClass()}
                    value={rule.yearDay}
                    onChange={(e) => updateRule(rule.id, { yearDay: Number(e.target.value) })}
                  />
                </div>
              </div>
            ) : null}

            {rule.id === 'coordinator_week_digest' ? (
              <p className="mt-3 text-xs text-amber-800">
                Только для координаторов сбора с активной подпиской на push. В браузере это правило не
                дублируется.
              </p>
            ) : null}
          </article>
        ))}
      </div>

      <div className="sticky bottom-3 z-20">
        <div className="flex items-center justify-end rounded-[10px] border border-[#F0E9EA] bg-white/95 px-4 py-3 backdrop-blur">
          <button
            type="button"
            className={btnPrimary('bg-[#7B2D3F]')}
            disabled={saveMut.isPending || rules.length === 0}
            onClick={() => {
              setNote(null);
              saveMut.mutate();
            }}
          >
            {saveMut.isPending ? 'Сохранение…' : 'Сохранить расписание'}
          </button>
        </div>
      </div>
    </div>
  );
}
