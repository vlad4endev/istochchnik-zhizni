import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, type MutableRefObject } from 'react';

import { fetchBroadcastEmbed } from '../../api/broadcast';
import { apiClient } from '../../lib/apiClient';
import {
  getZonedNow,
  isoWeekKeyFromYmd,
  parseHm,
  type ZonedNow,
} from '../../lib/zonedNotification';
import { getActiveEvents, getCalendarDay, getWeekBirthdays } from '../calendar/api';
import { fetchPublicNotificationSettings } from './notificationSettingsApi';
import type { NotificationRule, NotificationSettingsPublic } from './notificationSettingsTypes';

const LS = 'notif_cli_fired_v1';

function loadFired(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    return o && typeof o === 'object' ? (o as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function setFired(ruleId: string, periodKey: string) {
  const m = loadFired();
  m[ruleId] = periodKey;
  try {
    localStorage.setItem(LS, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

function alreadyFired(ruleId: string, periodKey: string): boolean {
  return loadFired()[ruleId] === periodKey;
}

function zonedYmd(z: ZonedNow): string {
  return `${z.year}-${String(z.month).padStart(2, '0')}-${String(z.day).padStart(2, '0')}`;
}

function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return String(h);
}

function repeatMatches(rule: NotificationRule, z: ZonedNow): boolean {
  switch (rule.repeat) {
    case 'day':
      return true;
    case 'week':
      return z.weekDay === rule.weekDay;
    case 'month':
      return z.day === rule.monthDay;
    case 'year':
      return z.month === rule.yearMonth && z.day === rule.yearDay;
    default:
      return true;
  }
}

function periodKey(rule: NotificationRule, z: ZonedNow): string {
  switch (rule.repeat) {
    case 'day':
      return `${z.year}-${String(z.month).padStart(2, '0')}-${String(z.day).padStart(2, '0')}`;
    case 'week':
      return isoWeekKeyFromYmd(z.year, z.month, z.day);
    case 'month':
      return `${z.year}-${String(z.month).padStart(2, '0')}`;
    case 'year':
      return `${z.year}`;
    default:
      return `${z.year}-${z.month}-${z.day}`;
  }
}

function notify(title: string, body: string, tag: string, importance: NotificationRule['importance']): boolean {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  try {
    const silent = importance === 'low';
    const requireInteraction = importance === 'high';
    new Notification(title, { body, tag, silent, requireInteraction });
    return true;
  } catch {
    return false;
  }
}

async function hasWebPushSubscription(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub != null;
  } catch {
    return false;
  }
}

async function recordLocalSchedulerDelivery(ruleId: string, title: string, body: string): Promise<void> {
  if (await hasWebPushSubscription()) {
    return;
  }
  try {
    await apiClient.post('/api/notifications/deliveries/local-reminder', {
      ruleId,
      tag: ruleId,
      title,
      body,
    });
    window.dispatchEvent(new CustomEvent('app:notification-deliveries-changed'));
  } catch {
    /* офлайн или нет сессии */
  }
}

async function runRule(
  rule: NotificationRule,
  z: ZonedNow,
  stateRef: MutableRefObject<Record<string, string | boolean>>,
): Promise<void> {
  const pk = `${rule.id}:${periodKey(rule, z)}`;
  if (alreadyFired(rule.id, pk)) return;

  const st = stateRef.current;

  switch (rule.id) {
    case 'coordinator_week_digest':
      return;

    case 'prayer_reminder': {
      const day = zonedYmd(z);
      const data = await getCalendarDay(day);
      const name = data?.members?.[0]?.name?.trim() || 'участника церкви';
      const t = 'Время молитвы';
      const b = `Сегодня молимся за ${name}.`;
      if (notify(t, b, rule.id, rule.importance)) {
        void recordLocalSchedulerDelivery(rule.id, t, b);
      }
      setFired(rule.id, pk);
      return;
    }
    case 'birthday_today': {
      const week = await getWeekBirthdays();
      const today = zonedYmd(z);
      const names = week.items.filter((i) => i.week_date === today).map((i) => i.name);
      if (names.length === 0) {
        setFired(rule.id, pk);
        return;
      }
      const t = 'Дни рождения сегодня';
      const b = names.join(', ');
      if (notify(t, b, rule.id, rule.importance)) {
        void recordLocalSchedulerDelivery(rule.id, t, b);
      }
      setFired(rule.id, pk);
      return;
    }
    case 'birthday_week': {
      const week = await getWeekBirthdays();
      if (week.items.length === 0) {
        setFired(rule.id, pk);
        return;
      }
      const lines = week.items.map((i) => `${i.name} (${i.week_date})`).join(' · ');
      const t = 'Дни рождения на неделе';
      if (notify(t, lines, rule.id, rule.importance)) {
        void recordLocalSchedulerDelivery(rule.id, t, lines);
      }
      setFired(rule.id, pk);
      return;
    }
    case 'broadcast_start': {
      const data = await fetchBroadcastEmbed();
      const code = data?.rutube_embed_code?.trim() ?? '';
      const h = hashStr(code);
      if (!st.broadcastInit) {
        st.broadcastInit = true;
        st.broadcastHash = h;
        setFired(rule.id, pk);
        return;
      }
      if (!code) {
        setFired(rule.id, pk);
        return;
      }
      if (st.broadcastHash === h) {
        setFired(rule.id, pk);
        return;
      }
      st.broadcastHash = h;
      const t = 'Трансляция';
      const b = 'Обновлён код плеера — эфир доступен в приложении.';
      if (notify(t, b, rule.id, rule.importance)) {
        void recordLocalSchedulerDelivery(rule.id, t, b);
      }
      setFired(rule.id, pk);
      return;
    }
    case 'system_update': {
      const { data } = await apiClient.get<{ api_build_stamp?: string | null; api_commit?: string | null }>(
        '/api/version',
      );
      const stamp = String(data?.api_build_stamp ?? data?.api_commit ?? '').trim();
      if (!stamp) {
        setFired(rule.id, pk);
        return;
      }
      if (!st.apiStamp) {
        st.apiStamp = stamp;
        setFired(rule.id, pk);
        return;
      }
      if (st.apiStamp === stamp) {
        setFired(rule.id, pk);
        return;
      }
      st.apiStamp = stamp;
      const t = 'Обновление';
      const b = 'Доступна новая версия сайта — обновите вкладку.';
      if (notify(t, b, rule.id, rule.importance)) {
        void recordLocalSchedulerDelivery(rule.id, t, b);
      }
      setFired(rule.id, pk);
      return;
    }
    case 'new_sermon': {
      const { data } = await apiClient.get<{ episodes?: { id?: string }[] }>('/api/resources/podcasts');
      const epId = data?.episodes?.[0]?.id ? String(data.episodes[0].id) : '';
      if (!epId) {
        setFired(rule.id, pk);
        return;
      }
      if (!st.sermonId) {
        st.sermonId = epId;
        setFired(rule.id, pk);
        return;
      }
      if (st.sermonId === epId) {
        setFired(rule.id, pk);
        return;
      }
      st.sermonId = epId;
      const t = 'Новая проповедь';
      const b = 'В ленте появилась новая запись.';
      if (notify(t, b, rule.id, rule.importance)) {
        void recordLocalSchedulerDelivery(rule.id, t, b);
      }
      setFired(rule.id, pk);
      return;
    }
    case 'new_event': {
      const events = await getActiveEvents();
      const latest = [...events].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      const created = latest?.created_at ?? '';
      if (!created) {
        setFired(rule.id, pk);
        return;
      }
      if (!st.eventCreated) {
        st.eventCreated = created;
        setFired(rule.id, pk);
        return;
      }
      if (st.eventCreated === created) {
        setFired(rule.id, pk);
        return;
      }
      st.eventCreated = created;
      const t = 'Новое событие';
      const b = latest?.title ? `«${latest.title}»` : 'Добавлено событие в календаре.';
      if (notify(t, b, rule.id, rule.importance)) {
        void recordLocalSchedulerDelivery(rule.id, t, b);
      }
      setFired(rule.id, pk);
      return;
    }
    default:
      return;
  }
}

async function tick(settings: NotificationSettingsPublic, stateRef: React.MutableRefObject<Record<string, string | boolean>>) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  const tz = settings.timezone || 'Europe/Moscow';
  const z = getZonedNow(tz);

  for (const rule of settings.rules) {
    if (!rule.enabled) continue;
    if (rule.id === 'coordinator_week_digest') continue;
    const hm = parseHm(rule.time);
    if (!hm || z.hour !== hm.hour || z.minute !== hm.minute) continue;
    if (!repeatMatches(rule, z)) continue;
    try {
      await runRule(rule, z, stateRef);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Локальные уведомления браузера по тем же правилам, что и серверные push (когда вкладка открыта и разрешён Notification API).
 * Серверные push настраиваются в админке и уходят подписчикам; этот слой дублирует смысл для пользователя в браузере.
 */
export function useBrowserNotificationScheduler() {
  const stateRef = useRef<Record<string, string | boolean>>({});

  const q = useQuery({
    queryKey: ['notification-settings', 'public'],
    queryFn: fetchPublicNotificationSettings,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const settings = q.data;
    if (!settings) return;

    const run = () => {
      void tick(settings, stateRef);
    };

    run();
    const id = window.setInterval(run, 25_000);
    return () => window.clearInterval(id);
  }, [q.data]);
}
