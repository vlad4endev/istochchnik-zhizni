import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDays,
  addWeeks,
  eachDayOfInterval,
  format,
  isAfter,
  isBefore,
  startOfDay,
  startOfWeek,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import type { IconType } from 'react-icons';
import {
  LuBookMarked,
  LuBookOpen,
  LuCalendarDays,
  LuCalendarRange,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuChevronUp,
  LuList,
  LuChurch,
  LuCloudOff,
  LuEye,
  LuFlame,
  LuHammer,
  LuHandHeart,
  LuHeartHandshake,
  LuRefreshCw,
  LuUserX,
  LuX,
} from 'react-icons/lu';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { DayPicker } from 'react-day-picker';

import {
  getApiBaseUrlFromEnv,
  isApiUrlProbablyWrongForWeb,
  resolveAxiosBaseURL,
} from '../../../lib/config';
import { PageHeader } from '@/components/layout/PageHeader';
import { PrayerSkeleton } from '@/components/skeletons/PrayerSkeleton';
import { sectionHeroStickyClass } from '../../../lib/sectionHeroChrome';
import { memberRosterName } from '../../../lib/memberRosterName';
import type { Backslider, DayPrayerData, GlobalTheme, Member, Ministry } from '../../../types';
import { patchProfile } from '../../profile/api';
import { useMe } from '@/hooks/useMe';
import { keys } from '@/lib/queryKeys';
import { useCoordinatorNoteEditorRequestStore } from '../../dashboard/coordinatorNoteEditorRequestStore';
import { NextWeekPrayerPlanSection } from '../components/NextWeekPrayerPlanSection';
import { PrayerSectionViewersModal } from '../components/PrayerSectionViewersModal';
import {
  userCanManageCoordinatorDashboardNotes,
  userCanTelegramPrayerDispatch,
  userCanViewNextWeekPrayerPlan,
} from '../prayerAccess';
import { fetchRolePermissionsPublic } from '../../settings/rolePermissionsApi';
import {
  deleteDashboardCoordinatorNote,
  fetchDashboardCoordinatorNotes,
  fetchPrayerSectionTodayViewers,
  formatCalendarDayKey,
  getCalendarDay,
  postPrayerSectionVisit,
} from '../api';
import { loadErrorDescription } from '../prayerPageUtils';
import {
  fetchTelegramDispatchPreviewPrayer,
  fetchTelegramDispatchRecipients,
  fetchTelegramDispatchSettings,
  fetchTelegramSettings,
  humanizeTelegramError,
  patchTelegramDispatchSettings,
  runTelegramDispatchNow,
  testTelegramConnection,
  type TelegramDispatchRecipient,
  type TelegramDispatchSettingsResponse,
} from '../../admin/api';

import 'react-day-picker/style.css';

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isDayPrayerEmpty(data: DayPrayerData): boolean {
  return (
    data.members.length === 0 &&
    data.global_themes.length === 0 &&
    data.ministries.length === 0 &&
    data.backsliders.length === 0
  );
}

function hasPrayerContent(data: DayPrayerData | null | undefined): data is DayPrayerData {
  return data != null && !isDayPrayerEmpty(data);
}

function SectionHeader({
  Icon,
  title,
  id,
  subtitle,
  titleClassName,
}: {
  Icon: IconType;
  title: string;
  id?: string;
  subtitle?: string;
  titleClassName?: string;
}) {
  return (
    <div className="mb-4 mt-2 pl-1 pr-1 shell:pr-2 animate-prayer-fade-up motion-reduce:animate-none">
      <div className="flex items-center gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-gradient-to-br from-[var(--surface-elevated)] to-primary/[0.04] text-primary shadow-sm ring-1 ring-primary/20"
          aria-hidden
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2
            id={id}
            className={
              titleClassName ??
              'text-base font-extrabold tracking-tight text-[var(--text)]'
            }
          >
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-sm leading-snug text-[var(--text-secondary)]">{subtitle}</p> : null}
        </div>
      </div>
    </div>
  );
}

function PrayerCard(props: {
  Icon: IconType;
  title: string;
  accentVar: string;
  children: ReactNode;
  cardIndex?: number;
}) {
  const { Icon, title, accentVar, children, cardIndex = 0 } = props;
  const staggerMs = Math.min(cardIndex * 48, 320);
  return (
    <article
      className="group relative mb-4 overflow-hidden rounded-2xl border border-stone-200/70 bg-[var(--surface-elevated)] shadow-[var(--shadow-card)] transition-[box-shadow,transform,border-color] duration-300 ease-out animate-prayer-fade-up hover:-translate-y-0.5 hover:border-stone-300/85 hover:shadow-lg motion-reduce:animate-none motion-reduce:transform-none motion-reduce:transition-none dark:border-[var(--border)] dark:hover:border-[var(--border-hover)] md:border-stone-200/80 md:shadow-[var(--shadow)]"
      style={{
        ['--card-accent' as string]: accentVar,
        animationDelay: `${staggerMs}ms`,
      }}
    >
      <div
        className="absolute left-0 top-0 h-full w-[3px] rounded-l-2xl bg-[var(--card-accent)] opacity-90 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden
      />
      <div className="border-b border-stone-100/90 px-4 pb-0 pt-[18px] shell:px-5">
        <div className="flex items-start gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--card-accent)] transition-transform duration-300 group-hover:scale-[1.04] motion-reduce:group-hover:scale-100"
            style={{ backgroundColor: `color-mix(in srgb, ${accentVar} 12%, transparent)` }}
          >
            <Icon className="h-5 w-5" aria-hidden />
          </div>
          <h3 className="min-w-0 flex-1 pb-1 text-lg font-bold leading-snug tracking-tight text-[var(--text)]">
            {title}
          </h3>
        </div>
      </div>
      <div className="px-4 py-4 text-base leading-relaxed text-[var(--text-secondary)] shell:px-5 shell:pb-5 [&_p]:whitespace-pre-wrap">
        {children}
      </div>
    </article>
  );
}

function ruUniqueVisitorsWord(n: number): string {
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return 'человек';
  const m10 = n % 10;
  if (m10 === 1) return 'человек';
  if (m10 >= 2 && m10 <= 4) return 'человека';
  return 'человек';
}

function MemberCard({
  member,
  currentUserId,
  onPrayerSaved,
  cardIndex = 0,
  allowEdit = true,
}: {
  member: Member;
  currentUserId: number | null;
  onPrayerSaved: () => void;
  cardIndex?: number;
  /** false для прошлых дат — только просмотр из истории */
  allowEdit?: boolean;
}) {
  const isMe = currentUserId != null && member.id === currentUserId;
  const canEdit = allowEdit && isMe;
  const [editText, setEditText] = useState(member.prayer_request ?? '');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  useEffect(() => {
    setEditText(member.prayer_request ?? '');
  }, [member.id, member.prayer_request]);

  async function savePrayer() {
    setSaving(true);
    setSaveErr(null);
    try {
      await patchProfile({ prayer_request: editText });
      onPrayerSaved();
    } catch (e) {
      setSaveErr(loadErrorDescription(e) ?? 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  const hasRequest = member.prayer_request != null && member.prayer_request.trim().length > 0;

  return (
    <PrayerCard
      Icon={LuHeartHandshake}
      title={memberRosterName(member)}
      accentVar="var(--member)"
      cardIndex={cardIndex}
    >
      {canEdit ? (
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-extrabold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
              Ваша молитвенная нужда
            </span>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={5}
              maxLength={8000}
              className="mt-2 w-full rounded-xl border border-stone-200 bg-[var(--surface)] px-3 py-2.5 text-base text-[var(--text)] outline-none transition-shadow duration-200 ring-primary/15 focus:border-primary focus:ring-2 focus:ring-primary/25"
              placeholder="О чём просим молиться…"
            />
          </label>
          {saveErr ? <p className="text-sm text-red-600">{saveErr}</p> : null}
          <button
            type="button"
            disabled={saving}
            onClick={() => void savePrayer()}
            className="min-h-[44px] rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/25 transition hover:bg-primary-dark active:scale-[0.98] disabled:opacity-60 motion-reduce:active:scale-100"
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      ) : hasRequest ? (
        <p className="text-base text-[var(--text-secondary)]">{member.prayer_request}</p>
      ) : (
        <p className="italic text-[var(--text-muted)]">Нет указанных нужд</p>
      )}
    </PrayerCard>
  );
}

function GlobalThemeCard({ theme, cardIndex = 0 }: { theme: GlobalTheme; cardIndex?: number }) {
  const hasVerse = theme.bible_verse != null && theme.bible_verse.trim().length > 0;
  const hasPoints = theme.prayer_points != null && theme.prayer_points.trim().length > 0;
  const hasNothing = !hasVerse && !hasPoints;
  return (
    <PrayerCard Icon={LuBookOpen} title={theme.title} accentVar="var(--theme)" cardIndex={cardIndex}>
      {hasVerse ? (
        <div className="mb-3 rounded-xl border border-[color-mix(in_srgb,var(--theme)_18%,transparent)] bg-[color-mix(in_srgb,var(--theme)_8%,transparent)] px-3.5 py-3.5">
          <div className="flex gap-2.5">
            <LuBookMarked className="mt-0.5 h-[18px] w-[18px] shrink-0 text-[var(--theme)]" aria-hidden />
            <p className="text-base italic leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">{theme.bible_verse}</p>
          </div>
        </div>
      ) : null}
      {hasPoints ? <p className="text-base leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">{theme.prayer_points}</p> : null}
      {hasNothing ? <p className="italic text-[var(--text-muted)]">Нет дополнительной информации</p> : null}
    </PrayerCard>
  );
}

function MinistryCard({ ministry, cardIndex = 0 }: { ministry: Ministry; cardIndex?: number }) {
  const hasPoints = ministry.prayer_points != null && ministry.prayer_points.trim().length > 0;
  return (
    <PrayerCard Icon={LuHammer} title={ministry.title} accentVar="var(--ministry)" cardIndex={cardIndex}>
      {hasPoints ? (
        <p className="text-base leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">{ministry.prayer_points}</p>
      ) : (
        <p className="italic text-[var(--text-muted)]">Нет указанных пунктов молитвы</p>
      )}
    </PrayerCard>
  );
}

function BacksliderCard({ b, cardIndex = 0 }: { b: Backslider; cardIndex?: number }) {
  return (
    <PrayerCard Icon={LuUserX} title={b.name} accentVar="var(--backslider)" cardIndex={cardIndex}>
      <p className="italic text-[var(--text-secondary)]">Отпавший — нуждается в молитве о возвращении</p>
    </PrayerCard>
  );
}

function ErrorBlock(props: { err: unknown; onRetry: () => void }) {
  const detail = loadErrorDescription(props.err);
  const apiLine = `${resolveAxiosBaseURL() || window.location.origin}/api/calendar/…`;
  const wrong = isApiUrlProbablyWrongForWeb();
  const envHint = getApiBaseUrlFromEnv() || '(пусто — используется origin страницы)';

  return (
    <div className="mx-auto max-w-md px-2 py-6 text-center sm:px-6">
      <div
        role="alert"
        className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-left text-red-950 shadow-sm"
      >
        <p className="text-sm font-extrabold uppercase tracking-wide text-red-800">Ошибка запроса</p>
        <p className="mt-1 text-sm font-medium text-red-900">
          Бэкенд не ответил или вернул ошибку. Проверьте, что API сервер запущен и совпадает с прокси Vite.
        </p>
      </div>
      <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-primary/[0.08] text-primary">
        <LuCloudOff className="h-10 w-10" strokeWidth={1.75} aria-hidden />
      </div>
      <h2 className="text-xl font-bold tracking-tight text-[var(--text)]">Не удалось загрузить данные</h2>
      <p className="mt-2 text-base leading-relaxed text-[var(--text-secondary)]">
        Проверьте подключение к интернету и что бэкенд доступен по HTTPS.
      </p>
      {detail ? <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">{detail}</p> : null}
      <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
        VITE_API_BASE_URL: {envHint}
        <br />
        Запрос: {apiLine}
      </p>
      {wrong ? (
        <p className="mt-3 text-sm font-semibold leading-relaxed text-primary">
          Похоже, в сборке указан localhost вместо публичного API. Задайте VITE_API_BASE_URL и пересоберите.
        </p>
      ) : null}
      <button
        type="button"
        onClick={props.onRetry}
        className="mt-6 inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-primary px-7 text-base font-bold text-white shadow-md shadow-primary/25 transition hover:bg-primary-dark"
      >
        <LuRefreshCw className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
        Повторить
      </button>
    </div>
  );
}

function EmptyBlock() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-14 text-center animate-prayer-fade-up motion-reduce:animate-none">
      <div className="mb-6 flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-primary/12 to-primary/6 text-primary shadow-[0_8px_32px_rgba(125,54,64,0.12)] ring-1 ring-primary/10">
        <LuHeartHandshake className="h-14 w-14" strokeWidth={1.75} aria-hidden />
      </div>
      <h2 className="text-xl font-bold tracking-tight text-[var(--text)]">Нет данных на эту дату</h2>
      <p className="mt-2 text-base leading-relaxed text-[var(--text-secondary)]">
        Выберите другую дату в календаре выше — появятся темы и нужды.
      </p>
    </div>
  );
}

const CAL_START = new Date(2020, 0, 1);
const CAL_END = new Date(2030, 11, 31);

function TelegramPrayerDispatchModal(props: {
  open: boolean;
  onClose: () => void;
  /** Календарный день страницы «Молитва» (как в URL /api/calendar/:date) — в рассылку уходит этот день. */
  prayerCalendarDateYmd: string;
}) {
  const { open, onClose, prayerCalendarDateYmd } = props;
  const qc = useQueryClient();
  const previewQ = useQuery({
    queryKey: ['prayer', 'telegram', 'dispatch', 'preview-prayer', prayerCalendarDateYmd],
    queryFn: () => fetchTelegramDispatchPreviewPrayer(prayerCalendarDateYmd),
    enabled: open,
  });
  const settingsQ = useQuery({
    queryKey: ['prayer', 'telegram', 'dispatch', 'settings'],
    queryFn: fetchTelegramDispatchSettings,
    enabled: open,
  });
  const recipientsQ = useQuery({
    queryKey: ['prayer', 'telegram', 'dispatch', 'recipients'],
    queryFn: fetchTelegramDispatchRecipients,
    enabled: open,
  });
  const telegramQ = useQuery({
    queryKey: ['prayer', 'telegram', 'base', 'settings'],
    queryFn: fetchTelegramSettings,
    enabled: open,
  });
  const [note, setNote] = useState<string | null>(null);
  const [form, setForm] = useState<TelegramDispatchSettingsResponse>({
    enabled: false,
    kind: 'daily',
    time_hhmm: '09:00',
    once_at_iso: null,
    once_at_local: null,
    target: 'all',
    member_ids: [],
    last_sent_at_iso: null,
    server_timezone: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC' : 'UTC',
    last_sent_label: null,
  });

  useEffect(() => {
    if (settingsQ.data) setForm(settingsQ.data);
  }, [settingsQ.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      patchTelegramDispatchSettings({
        enabled: form.enabled,
        kind: form.kind,
        time_hhmm: form.time_hhmm,
        target: form.target,
        member_ids: form.member_ids,
        once_at_local: form.kind === 'once' ? form.once_at_local : null,
      }),
    onSuccess: (next) => {
      setForm(next);
      setNote('Настройки рассылки сохранены.');
      void qc.invalidateQueries({ queryKey: ['prayer', 'telegram', 'dispatch', 'settings'] });
    },
    onError: (e) => setNote(humanizeTelegramError(e, 'Не удалось сохранить настройки.')),
  });

  const runMut = useMutation({
    mutationFn: () => runTelegramDispatchNow({ date: prayerCalendarDateYmd }),
    onSuccess: (r) => {
      setNote(`Рассылка отправлена: ${r.sent_count}.`);
      void qc.invalidateQueries({ queryKey: ['prayer', 'telegram', 'dispatch', 'settings'] });
      void qc.invalidateQueries({
        queryKey: ['prayer', 'telegram', 'dispatch', 'preview-prayer', prayerCalendarDateYmd],
      });
    },
    onError: (e) => setNote(humanizeTelegramError(e, 'Не удалось запустить рассылку.')),
  });

  const testMut = useMutation({
    mutationFn: () => testTelegramConnection(),
    onSuccess: (r) => {
      const handle = r.username ? `@${r.username}` : `id ${r.id}`;
      setNote(`Проверка бота: OK (${handle}).`);
    },
    onError: (e) => setNote(humanizeTelegramError(e, 'Не удалось проверить Telegram.')),
  });

  if (!open) return null;
  const loading = settingsQ.isPending || recipientsQ.isPending || telegramQ.isPending || previewQ.isPending;
  const recipients = recipientsQ.data ?? [];
  const botEnabled = telegramQ.data?.enabled === true;

  const modal = (
    <div
      className="fixed inset-0 z-[200] flex min-h-0 items-center justify-center bg-black/55 p-4 backdrop-blur-[2px] sm:backdrop-blur-none"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className="mx-auto flex w-full max-w-3xl min-w-0 max-h-[min(92dvh,920px)] flex-col overflow-hidden rounded-2xl border border-stone-200/90 bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-h-[min(88dvh,900px)] sm:border-stone-200 sm:pb-0"
        role="dialog"
        aria-modal="true"
        aria-label="Настройка рассылки молитвы в Telegram"
      >
        <div className="flex shrink-0 items-start gap-2 border-b border-stone-100 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:gap-3 sm:px-5 sm:py-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-[1.05rem] font-extrabold leading-snug tracking-tight text-stone-900 sm:text-lg">
              Рассылка молитвы в Telegram
            </h3>
            <p className="mt-1.5 text-[13px] leading-relaxed text-stone-600 sm:text-sm">
              Часовой пояс сервера:{' '}
              <span className="font-mono text-[12px] text-stone-800 sm:text-[13px]">{form.server_timezone}</span>.
              Получатели — все или выбранные с Telegram ID.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap-highlight-transparent -mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-transparent text-stone-500 transition hover:border-stone-200 hover:bg-stone-50 hover:text-stone-800"
            aria-label="Закрыть"
          >
            <LuX className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 sm:px-5 sm:py-5">
          {loading ? (
            <div className="h-44 animate-pulse rounded-xl bg-stone-100 sm:h-40" />
          ) : (
            <div className="space-y-4 sm:space-y-5">
              {!botEnabled ? (
                <div className="rounded-xl border border-amber-200/90 bg-amber-50 px-3 py-3 text-[13px] leading-relaxed text-amber-950 sm:text-sm">
                  Telegram-бот сейчас выключен в настройках админки. Включите его, чтобы рассылка работала.
                </div>
              ) : null}
              {note ? (
                <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-[13px] leading-relaxed text-stone-800 sm:text-sm">
                  {note}
                </div>
              ) : null}
              {previewQ.isError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-[13px] leading-relaxed text-rose-950 sm:text-sm">
                  {humanizeTelegramError(previewQ.error, 'Не удалось загрузить предпросмотр текста.')}
                </div>
              ) : previewQ.data ? (
                <div className="rounded-xl border border-stone-200 bg-gradient-to-b from-stone-50/90 to-white p-3 sm:p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-stone-500 sm:text-xs">
                    Предпросмотр · дата {previewQ.data.date}
                  </p>
                  <p className="mt-1 text-[12px] text-stone-600 sm:text-[13px]">Как на странице «Молитва» для выбранного дня.</p>
                  <textarea
                    readOnly
                    className="tap-highlight-transparent mt-2 max-h-[min(38dvh,220px)] min-h-[100px] w-full resize-y rounded-xl border border-stone-200 bg-white px-3 py-2.5 font-mono text-[12px] leading-relaxed text-stone-800 shadow-inner sm:max-h-64 sm:min-h-[128px] sm:text-[13px]"
                    value={previewQ.data.text}
                    aria-label="Предпросмотр текста рассылки молитвы"
                  />
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                <label className="flex min-h-[48px] cursor-pointer items-center justify-between gap-3 rounded-xl border border-stone-200 bg-[var(--surface-elevated)] px-3 py-3 sm:min-h-0 sm:py-2.5">
                  <span className="text-[14px] font-semibold text-stone-800 sm:text-sm">Включить авторассылку</span>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-primary"
                    checked={form.enabled}
                    onChange={(e) => setForm((s) => ({ ...s, enabled: e.target.checked }))}
                  />
                </label>
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-stone-500 sm:text-xs sm:font-semibold sm:normal-case sm:tracking-normal sm:text-stone-600">
                    Режим
                  </label>
                  <select
                    className="min-h-[48px] w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-[15px] font-medium text-stone-900 sm:min-h-0 sm:text-sm"
                    value={form.kind}
                    onChange={(e) => setForm((s) => ({ ...s, kind: e.target.value as 'daily' | 'once' }))}
                  >
                    <option value="daily">Ежедневно</option>
                    <option value="once">Разово</option>
                  </select>
                </div>
                {form.kind === 'daily' ? (
                  <div className="sm:col-span-1">
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-stone-500 sm:text-xs sm:font-semibold sm:normal-case sm:tracking-normal sm:text-stone-600">
                      Время (сервер)
                    </label>
                    <input
                      type="time"
                      className="min-h-[48px] w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-[15px] sm:min-h-0 sm:text-sm"
                      value={form.time_hhmm ?? '09:00'}
                      onChange={(e) => setForm((s) => ({ ...s, time_hhmm: e.target.value }))}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2 sm:gap-4">
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-stone-500 sm:text-xs sm:font-semibold sm:normal-case sm:tracking-normal sm:text-stone-600">
                        Дата
                      </label>
                      <input
                        type="date"
                        className="min-h-[48px] w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-[15px] sm:min-h-0 sm:text-sm"
                        value={form.once_at_local?.split('T')[0] ?? ''}
                        onChange={(e) => {
                          const d = e.target.value;
                          setForm((s) => {
                            const t = s.once_at_local?.split('T')[1]?.slice(0, 5) ?? '09:00';
                            return { ...s, once_at_local: d ? `${d}T${t}` : null };
                          });
                        }}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-stone-500 sm:text-xs sm:font-semibold sm:normal-case sm:tracking-normal sm:text-stone-600">
                        Время
                      </label>
                      <input
                        type="time"
                        className="min-h-[48px] w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-[15px] sm:min-h-0 sm:text-sm"
                        value={form.once_at_local?.split('T')[1]?.slice(0, 5) ?? ''}
                        onChange={(e) => {
                          const tim = e.target.value;
                          setForm((s) => {
                            const d = s.once_at_local?.split('T')[0];
                            if (!d || !tim) return s;
                            return { ...s, once_at_local: `${d}T${tim}` };
                          });
                        }}
                      />
                    </div>
                  </div>
                )}
                <div className={form.kind === 'daily' ? 'sm:col-span-1' : 'sm:col-span-2'}>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-stone-500 sm:text-xs sm:font-semibold sm:normal-case sm:tracking-normal sm:text-stone-600">
                    Кому отправлять
                  </label>
                  <select
                    className="min-h-[48px] w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-[15px] font-medium text-stone-900 sm:min-h-0 sm:text-sm"
                    value={form.target}
                    onChange={(e) => setForm((s) => ({ ...s, target: e.target.value as 'all' | 'selected' }))}
                  >
                    <option value="all">Всем с Telegram ID</option>
                    <option value="selected">Выбранным пользователям</option>
                  </select>
                </div>
              </div>
              {form.target === 'selected' ? (
                <div className="rounded-xl border border-stone-200 bg-stone-50/50 p-3 sm:p-4">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-stone-500 sm:text-xs sm:font-semibold sm:normal-case sm:tracking-normal sm:text-stone-600">
                    Выбор пользователей
                  </p>
                  <div className="max-h-[min(42dvh,280px)] space-y-0.5 overflow-y-auto overscroll-y-contain sm:max-h-56">
                    {recipients.map((u: TelegramDispatchRecipient) => {
                      const checked = form.member_ids.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-2 py-2 active:bg-stone-100 sm:min-h-0 sm:py-1.5 sm:hover:bg-stone-50"
                        >
                          <input
                            type="checkbox"
                            className="h-5 w-5 shrink-0 accent-primary"
                            checked={checked}
                            onChange={(e) =>
                              setForm((s) => ({
                                ...s,
                                member_ids: e.target.checked
                                  ? Array.from(new Set([...s.member_ids, u.id]))
                                  : s.member_ids.filter((id) => id !== u.id),
                              }))
                            }
                          />
                          <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-stone-800 sm:text-sm">{u.name}</span>
                          <span className="max-w-[42%] shrink-0 truncate font-mono text-[11px] text-stone-400 sm:text-xs">({u.telegram_chat_id})</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {!loading ? (
          <div className="shrink-0 border-t border-stone-100 bg-[var(--surface-elevated)] px-4 py-3 sm:bg-[var(--surface-elevated)] sm:px-5 sm:pb-5 sm:pt-0 sm:shadow-none dark:border-[var(--border)]">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-2">
              <button
                type="button"
                className="tap-highlight-transparent order-3 flex min-h-[48px] w-full items-center justify-center rounded-xl border border-stone-200 bg-white px-4 text-[15px] font-semibold text-stone-800 shadow-sm hover:bg-stone-50 disabled:opacity-60 sm:order-none sm:min-h-[44px] sm:w-auto sm:px-4 sm:py-2.5 sm:text-sm"
                disabled={testMut.isPending}
                onClick={() => {
                  setNote(null);
                  testMut.mutate();
                }}
              >
                {testMut.isPending ? 'Проверка…' : 'Проверить бота'}
              </button>
              <button
                type="button"
                className="tap-highlight-transparent order-2 flex min-h-[48px] w-full items-center justify-center rounded-xl border-2 border-primary/25 bg-white px-4 text-[15px] font-bold text-primary hover:bg-primary/[0.04] disabled:opacity-60 sm:order-none sm:min-h-[44px] sm:w-auto sm:border sm:border-stone-200 sm:px-4 sm:py-2.5 sm:font-semibold sm:text-stone-700 sm:hover:bg-stone-50"
                disabled={runMut.isPending}
                onClick={() => {
                  setNote(null);
                  runMut.mutate();
                }}
              >
                {runMut.isPending ? 'Отправка…' : 'Отправить сейчас'}
              </button>
              <button
                type="button"
                className="tap-highlight-transparent order-1 flex min-h-[48px] w-full items-center justify-center rounded-xl bg-primary px-4 text-[15px] font-bold text-white shadow-md shadow-primary/20 hover:opacity-95 disabled:opacity-60 sm:order-none sm:min-h-[44px] sm:w-auto sm:px-4 sm:py-2.5 sm:text-sm"
                disabled={saveMut.isPending}
                onClick={() => {
                  setNote(null);
                  saveMut.mutate();
                }}
              >
                {saveMut.isPending ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modal, document.body) : null;
}

const WEEKDAY_LABELS_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'] as const;

function WeekStripPicker(props: {
  selected: Date;
  onSelect: (d: Date) => void;
  minDate: Date;
  maxDate: Date;
}) {
  const { selected, onSelect, minDate, maxDate } = props;
  const weekStart = startOfWeek(selected, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
  const minWeekStart = startOfWeek(minDate, { weekStartsOn: 1 });
  const maxWeekStart = startOfWeek(maxDate, { weekStartsOn: 1 });
  const canPrev = weekStart.getTime() > minWeekStart.getTime();
  const canNext = weekStart.getTime() < maxWeekStart.getTime();

  function goWeek(delta: number) {
    const next = addWeeks(selected, delta);
    const ws = startOfWeek(next, { weekStartsOn: 1 });
    if (ws.getTime() < minWeekStart.getTime()) {
      onSelect(minDate);
      return;
    }
    if (ws.getTime() > maxWeekStart.getTime()) {
      onSelect(maxDate);
      return;
    }
    onSelect(next);
  }

  const today = new Date();

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between gap-2 px-0.5">
        <button
          type="button"
          disabled={!canPrev}
          onClick={() => goWeek(-1)}
          className="flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-stone-600 hover:bg-stone-100 disabled:opacity-30"
          aria-label="Предыдущая неделя"
        >
          <LuChevronLeft className="h-6 w-6" strokeWidth={2} />
        </button>
        <p className="min-w-0 flex-1 text-center text-base font-semibold capitalize text-[var(--text)]">
          {format(weekStart, 'LLLL yyyy', { locale: ru })}
        </p>
        <button
          type="button"
          disabled={!canNext}
          onClick={() => goWeek(1)}
          className="flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-stone-600 hover:bg-stone-100 disabled:opacity-30"
          aria-label="Следующая неделя"
        >
          <LuChevronRight className="h-6 w-6" strokeWidth={2} />
        </button>
      </div>
      <div className="mb-1.5 grid grid-cols-7 gap-0.5 text-center text-xs font-semibold text-[var(--text-secondary)]">
        {WEEKDAY_LABELS_SHORT.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d) => {
          const isSel = isSameDay(d, selected);
          const isTodayCell = isSameDay(d, today);
          const outOfRange =
            isBefore(startOfDay(d), startOfDay(minDate)) || isAfter(startOfDay(d), startOfDay(maxDate));
          return (
            <button
              key={d.getTime()}
              type="button"
              disabled={outOfRange}
              onClick={() => onSelect(d)}
              className={[
                'flex min-h-[44px] w-full items-center justify-center rounded-full text-sm font-medium transition-colors duration-200 sm:text-sm shell:h-11',
                outOfRange ? 'cursor-not-allowed opacity-30' : '',
                isSel
                  ? 'bg-primary font-semibold text-white shadow-sm shadow-primary/25 hover:bg-primary'
                  : isTodayCell
                    ? 'font-bold text-primary hover:bg-stone-100'
                    : 'text-[var(--text)] hover:bg-[var(--surface)]',
              ].join(' ')}
            >
              {format(d, 'd')}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DailyPrayerPage() {
  const qc = useQueryClient();
  const requestOpenCoordinatorNoteEditor = useCoordinatorNoteEditorRequestStore((s) => s.requestOpenEditor);
  const [selected, setSelected] = useState<Date>(() => new Date());
  const [calendarExpanded, setCalendarExpanded] = useState(false);
  const [calendarView, setCalendarView] = useState<'week' | 'month'>('week');
  const [telegramDispatchModalOpen, setTelegramDispatchModalOpen] = useState(false);
  const [prayerViewersModalOpen, setPrayerViewersModalOpen] = useState(false);

  const { data: me, isSuccess: meQuerySuccess } = useMe();

  const sectionMemberId = useId();
  const sectionBacksliderId = useId();
  const themesMinistriesRegionId = useId();
  const normalizedAppRole = me?.app_role?.trim().toLowerCase() ?? '';
  const meRoles = Array.isArray((me as { app_roles?: string[] } | undefined)?.app_roles)
    ? ((me as { app_roles: string[] }).app_roles ?? []).map((r) => r.trim().toLowerCase())
    : [];
  const canViewPrayerSectionViewersStats =
    normalizedAppRole === 'pastor' ||
    normalizedAppRole === 'admin' ||
    meRoles.includes('pastor') ||
    meRoles.includes('admin');

  const rolePermissionsQ = useQuery({
    queryKey: keys.rolePermissionsPublic,
    queryFn: fetchRolePermissionsPublic,
    staleTime: 120_000,
  });

  const dateKey = formatCalendarDayKey(selected);

  const {
    data,
    isPending,
    isFetching,
    isError,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: keys.calendarDay(dateKey),
    queryFn: () => getCalendarDay(dateKey),
  });

  const coordinatorNotesQ = useQuery({
    queryKey: keys.dashboardNotes(dateKey),
    queryFn: () => fetchDashboardCoordinatorNotes(dateKey),
    staleTime: 0,
  });

  const prayerSectionViewersQ = useQuery({
    queryKey: ['calendar', 'prayer-section', 'today-viewers'],
    queryFn: fetchPrayerSectionTodayViewers,
    staleTime: 45_000,
    enabled: Boolean(me?.id) && canViewPrayerSectionViewersStats,
  });

  useEffect(() => {
    if (!me?.id) return;
    let cancelled = false;
    void (async () => {
      try {
        await postPrayerSectionVisit();
        if (!cancelled) {
          void qc.invalidateQueries({ queryKey: ['calendar', 'prayer-section', 'today-viewers'] });
        }
      } catch {
        /* сеть / сессия — не мешаем странице */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [me?.id, qc]);

  const today = new Date();
  const chipLabel = format(selected, 'd MMMM yyyy', { locale: ru });
  const isToday = isSameDay(selected, today);
  const isPastDay = isBefore(startOfDay(selected), startOfDay(today));
  const isFutureDay = isAfter(startOfDay(selected), startOfDay(today));
  const memberSectionTitle = isPastDay
    ? 'Молитвенная нужда за этот день'
    : isFutureDay
      ? 'Молитвенная нужда (по очереди цикла)'
      : 'Сегодня молимся за члена церкви';
  const hasThemesOrMinistries =
    data != null && (data.global_themes.length > 0 || data.ministries.length > 0);

  const urgentPrayerText = coordinatorNotesQ.data?.urgent_prayer?.text?.trim() ?? '';
  const urgentPrayerBlock: ReactNode =
    urgentPrayerText.length > 0 ? (
      <section
        aria-label="Срочная молитвенная нужда"
        className="overflow-hidden rounded-2xl border-2 border-rose-300/90 bg-gradient-to-br from-rose-50 via-white to-amber-50/90 p-4 shadow-[0_10px_32px_rgba(190,24,93,0.14)] dark:border-rose-400/35 dark:bg-[var(--surface-elevated)] dark:bg-none dark:shadow-[0_10px_32px_rgba(0,0,0,0.35)]"
      >
        <div className="flex items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
            aria-hidden
          >
            <LuFlame className="h-5 w-5" strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-xs font-extrabold uppercase tracking-[0.14em] text-rose-800 dark:text-rose-300">
              Срочная молитвенная нужда
            </h2>
            <p className="mt-2 whitespace-pre-wrap break-words text-base font-semibold leading-relaxed text-rose-950 dark:text-[var(--text)]">
              {urgentPrayerText}
            </p>
          </div>
        </div>
      </section>
    ) : null;

  const canManageCoordinatorNotes =
    meQuerySuccess && userCanManageCoordinatorDashboardNotes(me);

  async function onDeleteUrgentPrayer() {
    if (!window.confirm('Удалить срочную молитвенную нужду?')) return;
    try {
      await deleteDashboardCoordinatorNote('urgent_prayer', dateKey);
      void qc.invalidateQueries({ queryKey: ['calendar', 'dashboard-coordinator-notes'] });
    } catch {
      /* ignore */
    }
  }

  const urgentPrayerStack: ReactNode =
    urgentPrayerBlock == null ? null : (
      <div className="flex flex-col gap-2">
        {canManageCoordinatorNotes ? (
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="tap-highlight-transparent inline-flex min-h-[36px] items-center justify-center rounded-xl border border-rose-300/80 bg-white/90 px-3 text-xs font-extrabold text-rose-950 hover:bg-rose-50"
              onClick={() => requestOpenCoordinatorNoteEditor('urgent_prayer')}
            >
              Изменить
            </button>
            <button
              type="button"
              className="tap-highlight-transparent inline-flex min-h-[36px] items-center justify-center rounded-xl border border-red-200 bg-red-50/90 px-3 text-xs font-extrabold text-red-800 hover:bg-red-100"
              onClick={() => void onDeleteUrgentPrayer()}
            >
              Удалить
            </button>
          </div>
        ) : null}
        {urgentPrayerBlock}
      </div>
    );

  return (
    <div className="prayer-page-bg flex min-h-0 flex-1 flex-col max-lg:pb-0 lg:pb-8">
      <div className={sectionHeroStickyClass}>
        <PageHeader title="Молитва" />
      </div>

      {/* Чип даты и календарь — под шапкой, не внутри липкой primary-полосы */}
      <div className="z-10 w-full shrink-0 bg-[var(--surface)] px-3 pt-3 sm:px-4 shell:px-6 md:px-6 lg:px-8 xl:px-10">
        <button
          type="button"
          onClick={() => setCalendarExpanded((e) => !e)}
          className="group flex min-h-[48px] w-full items-center gap-3 rounded-full border border-stone-200/60 bg-[var(--surface-elevated)] px-4 py-3 text-left shadow-[var(--shadow)] transition-all duration-200 hover:border-stone-300/80 hover:bg-stone-50/90 active:scale-[0.99] sm:min-h-[52px] motion-reduce:active:scale-100 animate-prayer-fade-in motion-reduce:animate-none dark:border-[var(--border)] dark:hover:border-[var(--border-hover)] dark:hover:bg-[var(--bg-hover)]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-all duration-200 group-hover:scale-105 group-hover:bg-primary/[0.14] group-hover:text-primary-dark motion-reduce:group-hover:scale-100">
            <LuCalendarDays className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 truncate text-base font-bold text-[var(--text)] shell:text-base">{chipLabel}</span>
          {isToday ? (
            <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-2.5 py-1 text-xs font-extrabold tracking-wider text-[var(--accent)]">
              СЕГОДНЯ
            </span>
          ) : null}
          <LuChevronDown
            className={`h-6 w-6 shrink-0 text-stone-400 transition-transform duration-200 ${calendarExpanded ? 'rotate-180' : ''}`}
            strokeWidth={2}
            aria-hidden
          />
        </button>
        {!isPending && isFetching ? (
          <p className="mt-2 flex items-center justify-center gap-2 text-center text-xs font-semibold text-primary">
            <LuRefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" strokeWidth={2} aria-hidden />
            Обновляем данные…
          </p>
        ) : null}

      {/* Раскрывающийся календарь */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none ${calendarExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="mx-0 mt-3 rounded-b-3xl border border-t-0 border-stone-200/80 bg-[var(--surface-elevated)] px-3 py-5 shadow-[var(--shadow)]">
            {calendarView === 'week' ? (
              <WeekStripPicker
                selected={selected}
                minDate={CAL_START}
                maxDate={CAL_END}
                onSelect={(d) => {
                  setSelected(d);
                  setCalendarExpanded(false);
                }}
              />
            ) : (
              <DayPicker
                mode="single"
                selected={selected}
                onSelect={(d) => {
                  if (d) {
                    setSelected(d);
                    setCalendarExpanded(false);
                  }
                }}
                locale={ru}
                startMonth={CAL_START}
                endMonth={CAL_END}
                defaultMonth={selected}
                showOutsideDays={false}
                className="mx-auto [--rdp-accent-color:var(--primary)] [--rdp-background-color:var(--surface-elevated)]"
                classNames={{
                  root: 'rdp-root relative gap-3',
                  month_caption: 'flex justify-center px-1 pb-2 text-base font-semibold text-[var(--text)]',
                  nav: 'absolute right-0 top-0 flex gap-1',
                  month_grid: 'w-full border-collapse',
                  weekdays: 'text-xs font-semibold text-[var(--text-secondary)] shell:text-xs',
                  day: 'p-0.5 text-center',
                  day_button:
                    'flex h-11 min-h-[44px] w-11 min-w-[44px] items-center justify-center rounded-full text-sm font-medium text-[var(--text)] hover:bg-[var(--surface)] sm:h-10 sm:min-h-[44px] sm:w-10 sm:min-w-[44px]',
                  selected: 'bg-primary font-semibold text-white hover:bg-primary hover:text-white',
                  today: 'font-bold text-primary',
                }}
              />
            )}
            <div className="mt-3 flex items-stretch gap-2 border-t border-stone-100 pt-3">
              <button
                type="button"
                className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-primary hover:bg-primary/[0.06]"
                onClick={() => setCalendarView((v) => (v === 'month' ? 'week' : 'month'))}
              >
                {calendarView === 'month' ? (
                  <>
                    <LuCalendarRange className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                    Неделя
                  </>
                ) : (
                  <>
                    <LuCalendarDays className="h-5 w-5 shrink-0" strokeWidth={2} aria-hidden />
                    Весь месяц
                  </>
                )}
              </button>
              <button
                type="button"
                className="flex h-auto min-h-[48px] w-12 shrink-0 items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100"
                onClick={() => setCalendarExpanded(false)}
                aria-label="Свернуть календарь"
              >
                <LuChevronUp className="h-7 w-7" strokeWidth={2} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto [webkit-overflow-scrolling:touch]">
      <div className="px-3 pt-4 sm:px-4 shell:px-6 md:px-6 lg:px-8 xl:px-10">
        {userCanViewNextWeekPrayerPlan(me, rolePermissionsQ.data) ? (
          <NextWeekPrayerPlanSection
            canView
            currentUserId={me?.id ?? null}
            currentUserRole={me?.app_role ?? null}
            isAdmin={userCanTelegramPrayerDispatch(me)}
            afterWeekQueueButton={urgentPrayerStack}
            onTelegramPrayerDispatch={
              userCanTelegramPrayerDispatch(me) ? () => setTelegramDispatchModalOpen(true) : undefined
            }
          />
        ) : urgentPrayerStack ? (
          <div className="mb-4">{urgentPrayerStack}</div>
        ) : null}
        {isPending ? (
          <PrayerSkeleton />
        ) : isError ? (
          <ErrorBlock err={queryError} onRetry={() => void refetch()} />
        ) : hasPrayerContent(data) ? (
          <div className="pb-6">
            {data.members.length > 0 ? (
              <section aria-labelledby={sectionMemberId}>
                <SectionHeader
                  Icon={LuChurch}
                  title={memberSectionTitle}
                  id={sectionMemberId}
                />
                {data.members.map((m, i) => (
                  <MemberCard
                    key={m.id}
                    cardIndex={i}
                    member={m}
                    currentUserId={me?.id ?? null}
                    allowEdit={!isPastDay}
                    onPrayerSaved={() => {
                      void qc.invalidateQueries({ queryKey: ['calendar', 'day', dateKey] });
                      void qc.invalidateQueries({ queryKey: ['calendar', 'week-members'] });
                      void qc.invalidateQueries({ queryKey: ['calendar', 'cycle', 'collection-claims'] });
                    }}
                  />
                ))}
              </section>
            ) : null}

            {hasThemesOrMinistries ? (
              <section
                className={data.members.length > 0 ? 'mt-3' : undefined}
                aria-labelledby={themesMinistriesRegionId}
              >
                <h2 id={themesMinistriesRegionId} className="sr-only">
                  Темы и служения
                </h2>
                {data.global_themes.map((t, i) => (
                  <GlobalThemeCard key={`gt-${t.id}`} theme={t} cardIndex={i} />
                ))}
                {data.ministries.map((m, i) => (
                  <MinistryCard
                    key={`m-${m.id}`}
                    ministry={m}
                    cardIndex={data.global_themes.length + i}
                  />
                ))}
              </section>
            ) : null}

            {data.backsliders.length > 0 ? (
              <section
                className={
                  data.members.length > 0 || hasThemesOrMinistries ? 'mt-3' : undefined
                }
                aria-labelledby={sectionBacksliderId}
              >
                <SectionHeader
                  Icon={LuHandHeart}
                  title="Молимся за отпавшего"
                  id={sectionBacksliderId}
                />
                {data.backsliders.map((b, i) => (
                  <BacksliderCard key={b.id} b={b} cardIndex={i} />
                ))}
              </section>
            ) : null}
          </div>
        ) : (
          <EmptyBlock />
        )}
      </div>

      {me?.id && canViewPrayerSectionViewersStats ? (
        <div className="px-4 pb-6 pt-2 shell:px-6 shell:pb-8">
          <button
            type="button"
            onClick={() => setPrayerViewersModalOpen(true)}
            className="tap-highlight-transparent group mx-auto flex w-full max-w-xl items-center gap-2.5 rounded-2xl border border-stone-200/70 bg-gradient-to-r from-[var(--surface-elevated)] via-white/90 to-[var(--surface-elevated)] px-4 py-2.5 text-left shadow-[0_2px_12px_rgba(0,0,0,0.04)] backdrop-blur-sm transition-[border-color,box-shadow,transform] hover:border-primary/30 hover:shadow-[0_4px_18px_rgba(0,0,0,0.07)] active:scale-[0.99] supports-[backdrop-filter]:bg-[var(--surface-elevated)]/75 dark:border-[var(--border)] dark:via-[var(--bg-elevated)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.25)] dark:hover:border-primary/35"
            aria-haspopup="dialog"
            aria-expanded={prayerViewersModalOpen}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/[0.09] text-primary transition-colors group-hover:bg-primary/15"
              aria-hidden
            >
              <LuEye className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <div className="min-w-0 flex-1">
              {prayerSectionViewersQ.isPending ? (
                <span className="text-sm font-semibold text-[var(--text-muted)]">Считаем посещения…</span>
              ) : (
                <>
                  <p className="text-sm font-semibold leading-snug text-[var(--text-secondary)]">
                    Сегодня раздел открыли{' '}
                    <span className="tabular-nums font-extrabold text-[var(--text)]">
                      {prayerSectionViewersQ.data?.unique_viewers_today ?? 0}
                    </span>{' '}
                    {ruUniqueVisitorsWord(prayerSectionViewersQ.data?.unique_viewers_today ?? 0)}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-primary/80">
                    <LuList className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />
                    Посмотреть список
                  </p>
                </>
              )}
            </div>
            <LuChevronRight
              className="h-[18px] w-[18px] shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
              strokeWidth={2.25}
              aria-hidden
            />
          </button>
        </div>
      ) : null}
      </div>
      <TelegramPrayerDispatchModal
        open={telegramDispatchModalOpen}
        onClose={() => setTelegramDispatchModalOpen(false)}
        prayerCalendarDateYmd={dateKey}
      />
      {canViewPrayerSectionViewersStats ? (
        <PrayerSectionViewersModal
          open={prayerViewersModalOpen}
          onClose={() => setPrayerViewersModalOpen(false)}
          dateYmd={prayerSectionViewersQ.data?.date ?? ''}
          viewers={prayerSectionViewersQ.data?.viewers ?? []}
          isLoading={prayerSectionViewersQ.isPending && !prayerSectionViewersQ.data}
        />
      ) : null}
    </div>
  );
}
