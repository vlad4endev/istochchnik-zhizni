import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { LuBell } from 'react-icons/lu';

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

      <section className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[var(--shadow)]">
        <h3 className="flex items-center gap-2 text-base font-extrabold text-stone-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LuBell className="h-5 w-5" />
          </span>
          Уведомления церкви
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          Здесь задаётся расписание серверных push-уведомлений (Web Push и FCM для тех, кто подписан) и тех же
          напоминаний в браузере, пока открыта вкладка. Время считается в выбранной часовой зоне.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-semibold text-stone-600">Часовой пояс (IANA)</label>
            <input
              className={fieldClass()}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="Europe/Moscow"
            />
          </div>
          <button type="button" className={btnSecondary('shrink-0')} onClick={() => void requestBrowserPermission()}>
            Разрешить уведомления в браузере
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
            className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm sm:p-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-stone-300 text-primary"
                  checked={rule.enabled}
                  onChange={(e) => updateRule(rule.id, { enabled: e.target.checked })}
                />
                <span>
                  <span className="block text-sm font-extrabold text-stone-900">{rule.title}</span>
                  <span className="mt-0.5 block font-mono text-[11px] text-stone-400">{rule.id}</span>
                </span>
              </label>
            </div>

            <label className="mt-3 block text-xs font-semibold text-stone-600">Заголовок в списке</label>
            <input
              className={`${fieldClass()} mt-1`}
              value={rule.title}
              onChange={(e) => updateRule(rule.id, { title: e.target.value })}
            />

            <label className="mt-3 block text-xs font-semibold text-stone-600">
              Кастомный текст push (необязательно)
            </label>
            <textarea
              className={`${fieldClass()} mt-1 min-h-[84px] resize-y`}
              value={rule.customBody ?? ''}
              onChange={(e) => updateRule(rule.id, { customBody: e.target.value })}
              placeholder="Если оставить пустым — отправится стандартный текст правила."
            />
            {customBodyHint(rule.id) ? (
              <p className="mt-1 text-[11px] text-stone-500">{customBodyHint(rule.id)}</p>
            ) : null}

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                  <option value="low">Низкая</option>
                  <option value="normal">Обычная</option>
                  <option value="high">Высокая</option>
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
                  <option value="week">Раз в неделю</option>
                  <option value="month">Раз в месяц</option>
                  <option value="year">Раз в год</option>
                </select>
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btnPrimary()}
          disabled={saveMut.isPending || rules.length === 0}
          onClick={() => {
            setNote(null);
            saveMut.mutate();
          }}
        >
          {saveMut.isPending ? 'Сохранение…' : 'Сохранить все правила'}
        </button>
      </div>
    </div>
  );
}
