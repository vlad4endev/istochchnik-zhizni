import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import {
  LuBookOpen,
  LuChurch,
  LuClock,
  LuExternalLink,
  LuMic,
  LuMusic2,
  LuUser,
} from 'react-icons/lu';

import { canManageMediaSchedule } from '@/features/mediaSchedule/mediaAccess';
import { MediaTeamBlock } from '@/features/mediaSchedule/components/MediaTeamBlock';
import { useAuthStore } from '@/features/auth/authStore';
import { useMe } from '@/hooks/useMe';
import { resolvePublicUrl } from '@/lib/resolvePublicUrl';

import type { CalendarSundayService } from '../sundayServiceTypes';

function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map((x) => Number(x));
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function buildBibleVerseUrl(scripture: string): string {
  return `https://www.bible.com/ru/search/bible?q=${encodeURIComponent(scripture.trim())}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('');
}

function PersonRow({
  label,
  name,
  avatarUrl,
  icon: Icon,
}: {
  label: string;
  name: string;
  avatarUrl: string | null;
  icon: typeof LuUser;
}) {
  const photo = resolvePublicUrl(avatarUrl);
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-stone-100 bg-[#FBF7F8] px-3 py-2.5">
      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-[#6B2D3E]/10">
        {photo ? (
          <img src={photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-[13px] font-extrabold text-[#6B2D3E]">
            {initials(name)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-stone-500">
          <Icon className="h-3 w-3" aria-hidden />
          {label}
        </p>
        <p className="mt-0.5 truncate text-sm font-extrabold text-stone-900">{name}</p>
      </div>
    </div>
  );
}

export function SundayServiceDetailSheet({
  service,
  onClose,
}: {
  service: CalendarSundayService;
  onClose: () => void;
}) {
  const authRole = useAuthStore((s) => s.role);
  const authRoles = useAuthStore((s) => s.roles);
  const meQ = useMe();
  const canManageMedia = canManageMediaSchedule(authRole, meQ.data?.ministry_role, authRoles);
  const dateLabel = format(parseYmdLocal(service.service_date), "EEEE, d MMMM yyyy", { locale: ru });
  const sharePath = service.share_token ? `/service-plan/share/${service.share_token}` : null;

  return (
    <div
      className="fixed inset-0 z-[150] flex min-h-[100dvh] flex-col justify-end bg-black/50 sm:items-center sm:justify-center sm:p-4 sm:[padding-left:max(0.75rem,env(safe-area-inset-left,0px))] sm:[padding-right:max(0.75rem,env(safe-area-inset-right,0px))]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sunday-cal-detail-title"
    >
      <div
        className="max-h-[min(90dvh,860px)] w-full max-w-lg overflow-y-auto rounded-t-[1.75rem] border border-stone-200/80 border-t-[3px] border-t-[#6B2D3E] bg-white px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] shadow-[0_-8px_40px_rgba(0,0,0,0.18)] [padding-left:max(1rem,env(safe-area-inset-left,0px))] [padding-right:max(1rem,env(safe-area-inset-right,0px))] sm:rounded-2xl sm:border-l-4 sm:border-l-[#6B2D3E] sm:border-t-stone-200/80 sm:pb-5 sm:pt-5 sm:shadow-[0_24px_70px_rgba(0,0,0,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-stone-200/90 sm:hidden" aria-hidden />
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.02em] text-[#6B2D3E]">
          <LuChurch className="h-3.5 w-3.5" aria-hidden />
          Воскресное служение
        </p>
        <h2 id="sunday-cal-detail-title" className="mt-2 text-xl font-extrabold tracking-tight text-stone-900">
          {service.title}
        </h2>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-[#6B2D3E]">
          <span className="inline-flex items-center gap-1">
            <LuClock className="h-4 w-4" aria-hidden />
            {dateLabel} · {service.start_time}
          </span>
          {service.status === 'published' ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200/90">
              Программа опубликована
            </span>
          ) : service.has_program ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900 ring-1 ring-amber-200/90">
              Черновик программы
            </span>
          ) : (
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-600 ring-1 ring-stone-200/90">
              Программа ещё не создана
            </span>
          )}
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <PersonRow
            label="Ведущий"
            name={service.leader?.name ?? 'Не назначен'}
            avatarUrl={service.leader?.avatar_url ?? null}
            icon={LuUser}
          />
          <PersonRow
            label="Проповедник"
            name={service.preacher?.name ?? 'Не назначен'}
            avatarUrl={service.preacher?.avatar_url ?? null}
            icon={LuMic}
          />
        </div>

        {service.sermon_topic || service.sermon_scripture ? (
          <div className="mt-4 rounded-2xl border border-[#E8E0DC] bg-gradient-to-br from-[#FBF7F8] to-white px-4 py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-[#6B2D3E]">
              <LuBookOpen className="h-3.5 w-3.5" aria-hidden />
              Проповедь
            </p>
            {service.sermon_topic ? (
              <p className="mt-1.5 text-base font-extrabold leading-snug text-stone-900">{service.sermon_topic}</p>
            ) : null}
            {service.sermon_scripture ? (
              <a
                href={buildBibleVerseUrl(service.sermon_scripture)}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#E3D7DB] bg-white px-3 py-1 text-[12px] font-semibold text-[#6B2D3E] hover:bg-[#F8F2F4]"
              >
                <span className="min-w-0 truncate">{service.sermon_scripture}</span>
                <LuExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
              </a>
            ) : null}
          </div>
        ) : null}

        {service.songs.length > 0 ? (
          <div className="mt-4">
            <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wide text-stone-500">
              <LuMusic2 className="h-3.5 w-3.5" aria-hidden />
              Песни
            </p>
            <ol className="mt-2 space-y-1.5">
              {service.songs.map((song, index) => (
                <li
                  key={`${song.title}-${index}`}
                  className="flex items-baseline gap-2 rounded-xl bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-800 ring-1 ring-stone-100"
                >
                  <span className="w-5 shrink-0 text-[11px] font-extrabold text-stone-400">{index + 1}.</span>
                  <span className="min-w-0 flex-1">{song.title}</span>
                  {song.key ? (
                    <span className="shrink-0 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-extrabold text-stone-500 ring-1 ring-stone-200">
                      {song.key}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        ) : service.has_program ? (
          <p className="mt-4 rounded-xl bg-stone-50 px-3 py-2 text-sm font-medium text-stone-500">
            Песни для этого воскресенья ещё не внесены в программу.
          </p>
        ) : null}

        {service.id > 0 ? (
          <div className="mt-4">
            <MediaTeamBlock planId={service.id} canManage={canManageMedia} compact />
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {sharePath ? (
            <Link
              to={sharePath}
              className="tap-highlight-transparent inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-[#6B2D3E] px-5 text-sm font-extrabold text-white hover:bg-[#5B2332]"
            >
              Открыть программу
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="tap-highlight-transparent inline-flex min-h-[48px] min-w-[120px] items-center justify-center rounded-xl border border-stone-200 bg-white px-5 text-sm font-extrabold text-stone-700 hover:bg-stone-50"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
