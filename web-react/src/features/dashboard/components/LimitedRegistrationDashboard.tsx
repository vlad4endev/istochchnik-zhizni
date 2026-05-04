import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { LuCalendarDays, LuHeart, LuLogOut, LuMessageCircle, LuSparkles } from 'react-icons/lu';

import { getActiveEvents, type ChurchEventItem } from '../../calendar/api';
import { normalizeRegistrationStatus, useAuthStore, type RegistrationStatus } from '../../auth/authStore';
import { fetchMe } from '../../profile/api';
import { resolveMessengerWebOrigin } from '../../../lib/config';
import { keys } from '@/lib/queryKeys';

function parseOnceEventDateTime(item: ChurchEventItem): Date | null {
  const ts = `${item.event_date}T${item.event_time}:00`;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

function nextWeeklyDate(now: Date, weeklyDay: number, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map((x) => Number(x) || 0);
  const base = new Date(now);
  const diff = (weeklyDay - base.getDay() + 7) % 7;
  base.setDate(base.getDate() + diff);
  base.setHours(h, m, 0, 0);
  if (base.getTime() < now.getTime()) {
    base.setDate(base.getDate() + 7);
  }
  return base;
}

function eventNextOccurrence(now: Date, item: ChurchEventItem): Date | null {
  if (item.recurrence_type === 'weekly') {
    const weeklyDay = typeof item.weekly_day === 'number' ? item.weekly_day : 0;
    return nextWeeklyDate(now, weeklyDay, item.event_time);
  }
  return parseOnceEventDateTime(item);
}

type Props = {
  registrationStatus: Exclude<RegistrationStatus, 'active'>;
  firstName: string;
};

export function LimitedRegistrationDashboard({ registrationStatus, firstName }: Props) {
  const messengerWebOrigin = resolveMessengerWebOrigin();
  const [now] = useState(() => new Date());
  const greeting = firstName.trim() || 'друг';
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const applyServerProfile = useAuthStore((s) => s.applyServerProfile);

  async function handleLogout() {
    if (!window.confirm('Выйти из аккаунта? Текущая сессия будет завершена.')) {
      return;
    }
    await logout();
    navigate('/login', { replace: true });
  }

  useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      const me = await fetchMe();
      applyServerProfile({
        firstName: me.first_name ?? '',
        lastName: me.last_name ?? '',
        role: me.app_role ?? 'member',
        registrationStatus: normalizeRegistrationStatus(me.registration_status),
        username: (me.username ?? '').trim(),
        memberId: typeof me.id === 'number' ? me.id : null,
      });
      return me;
    },
    staleTime: 10_000,
    refetchInterval: registrationStatus === 'pending_review' ? 12_000 : false,
  });

  const eventsQ = useQuery({
    queryKey: ['calendar', 'events', 'limited-dashboard'],
    queryFn: getActiveEvents,
    staleTime: 60_000,
  });

  const upcoming = useMemo(() => {
    const items = eventsQ.data ?? [];
    const rows = items
      .map((item) => {
        const dt = eventNextOccurrence(now, item);
        return dt ? { item, dt } : null;
      })
      .filter((x): x is { item: ChurchEventItem; dt: Date } => x != null)
      .sort((a, b) => a.dt.getTime() - b.dt.getTime())
      .slice(0, 8);
    return rows;
  }, [eventsQ.data, now]);

  const isPending = registrationStatus === 'pending_review';
  const isRejected = registrationStatus === 'rejected';

  return (
    <div className="min-h-full bg-[var(--surface)] px-3 pt-2 sm:px-4 sm:pt-3 shell:px-6 md:px-8">
      <div className="mx-auto w-full max-w-2xl space-y-5">
        {/* Статус — первая полоса */}
        <section
          className={[
            'rounded-3xl border p-5 shadow-sm sm:p-6',
            isPending
              ? 'border-amber-200/90 bg-gradient-to-br from-amber-50 via-white to-orange-50/80'
              : 'border-rose-200/90 bg-gradient-to-br from-rose-50 via-white to-stone-50/90',
          ].join(' ')}
        >
          <div className="flex items-start gap-3">
            <div
              className={[
                'grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-xl',
                isPending ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-700',
              ].join(' ')}
              aria-hidden
            >
              {isPending ? '⏳' : '✕'}
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold tracking-tight text-stone-900 sm:text-xl">
                {isPending ? 'Заявка на рассмотрении' : 'Заявка не одобрена'}
              </h1>
              <p className="mt-2 text-sm font-medium leading-relaxed text-stone-700">
                {isPending ? (
                  <>
                    Здравствуйте, <span className="font-bold text-stone-900">{greeting}</span>! Администратор
                    церкви проверит ваши данные и подтвердит доступ к полному приложению. Обычно это занимает
                    немного времени. Страница обновит статус автоматически после решения.
                  </>
                ) : (
                  <>
                    К сожалению, регистрация не была подтверждена. Вы по-прежнему можете смотреть{' '}
                    <strong>события церкви</strong> и написать в <strong>чаты</strong> — там доступна связь с
                    поддержкой.
                  </>
                )}
              </p>
            </div>
          </div>
        </section>

        {/* О церкви */}
        <section className="rounded-3xl border border-stone-200/80 bg-white/90 p-5 shadow-[var(--shadow-card)] sm:p-6">
          <div className="flex items-center gap-2 text-primary">
            <LuHeart className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
            <span className="text-[11px] font-extrabold uppercase tracking-[0.14em]">Церковь</span>
          </div>
          <h2 className="mt-2 text-xl font-extrabold text-stone-900">Источник жизни</h2>
          <p className="mt-3 text-sm font-medium leading-relaxed text-stone-600">
            Мы рады, что вы с нами. «Источник жизни» — община верующих, где важны молитва, Слово Божье и
            поддержка друг друга. Здесь вы найдёте расписание встреч
            {isPending ? '.' : ' и сможете связаться с нами через чаты приложения.'}
          </p>
          {isPending ? (
            <p className="mt-3 text-sm font-medium leading-relaxed text-stone-600">
              Связь через чаты откроется после подтверждения заявки администратором.
            </p>
          ) : null}
          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-primary/[0.06] px-3 py-2.5 text-sm text-stone-700">
            <LuSparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>
              После одобрения заявки откроются молитвенный календарь, проповеди, ресурсы, чаты и остальные
              разделы — как у всех участников.
            </span>
          </div>
        </section>

        {/* События */}
        <section className="rounded-3xl border border-stone-200/80 bg-white/90 p-5 shadow-[var(--shadow-card)] sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-primary">
              <LuCalendarDays className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
              <span className="text-[11px] font-extrabold uppercase tracking-[0.14em]">События</span>
            </div>
          </div>
          <h2 className="mt-2 text-lg font-extrabold text-stone-900">Ближайшие встречи</h2>

          {eventsQ.isPending ? (
            <p className="mt-4 text-sm text-stone-500">Загрузка событий…</p>
          ) : eventsQ.isError ? (
            <p className="mt-4 text-sm text-rose-600">Не удалось загрузить события. Попробуйте позже.</p>
          ) : upcoming.length === 0 ? (
            <p className="mt-4 text-sm text-stone-500">Скоро здесь появятся актуальные события.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {upcoming.map(({ item, dt }) => (
                <li
                  key={`${item.id}-${dt.getTime()}`}
                  className="rounded-2xl border border-stone-100 bg-stone-50/80 px-4 py-3"
                >
                  <p className="font-bold text-stone-900">{item.title.trim() || 'Событие'}</p>
                  <p className="mt-1 text-xs font-semibold text-primary">
                    {format(dt, 'EEEE, d MMMM · HH:mm', { locale: ru })}
                  </p>
                  {(item.description ?? '').trim() ? (
                    <p className="mt-2 text-sm text-stone-600 line-clamp-3">{item.description?.trim()}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Поддержка — только после отказа (ожидающим чаты скрыты до одобрения) */}
        {isRejected ? (
          <section className="rounded-3xl border border-sky-200/80 bg-gradient-to-br from-sky-50/90 to-white p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sky-800">
              <LuMessageCircle className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
              <span className="text-[11px] font-extrabold uppercase tracking-[0.14em]">Связь</span>
            </div>
            <h2 className="mt-2 text-lg font-extrabold text-stone-900">Чаты и поддержка</h2>
            <p className="mt-2 text-sm font-medium text-stone-600">
              Напишите в общий чат или администратору — мы ответим и поможем с вопросами.
            </p>
            {messengerWebOrigin ? (
              <a
                href={`${messengerWebOrigin}/messenger`}
                className="mt-4 inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-primary px-5 text-sm font-extrabold text-white shadow-md shadow-primary/25 transition hover:opacity-95 active:scale-[0.99]"
              >
                Открыть чаты
              </a>
            ) : (
              <Link
                to="/messenger"
                className="mt-4 inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-primary px-5 text-sm font-extrabold text-white shadow-md shadow-primary/25 transition hover:opacity-95 active:scale-[0.99]"
              >
                Открыть чаты
              </Link>
            )}
          </section>
        ) : null}

        <div className="border-t border-stone-200/80 pt-5">
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-2xl border border-stone-300/90 bg-white px-4 text-sm font-extrabold text-stone-700 shadow-sm transition hover:bg-stone-50 active:scale-[0.99]"
          >
            <LuLogOut className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
            Выйти из аккаунта
          </button>
        </div>
      </div>
    </div>
  );
}
