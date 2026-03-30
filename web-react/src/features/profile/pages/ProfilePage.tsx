import { type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import {
  LuBookOpen,
  LuHeart,
  LuMusic,
  LuSend,
  LuSparkles,
  LuUser,
  LuUsers,
} from 'react-icons/lu';

/* ═══════════════════════════════════════════════════════════
   Mock data — замените на реальные данные из API
   ═══════════════════════════════════════════════════════════ */

const mockUser = {
  firstName: 'Анна',
  lastName: 'Сидорова',
  role: 'Лидер прославления',
  avatarUrl: null as string | null,
  reading: 'Послание к Римлянам, гл. 8',
  prayerTarget: 'Единство церкви и новые семьи',
};

interface Badge {
  id: number;
  label: string;
  Icon: ComponentType<{ className?: string }>;
  bg: string;
  ring: string;
  iconColor: string;
}

const mockBadges: Badge[] = [
  { id: 1, label: 'Прославление', Icon: LuMusic, bg: 'bg-amber-50', ring: 'ring-amber-200/60', iconColor: 'text-amber-600' },
  { id: 2, label: 'Малая группа', Icon: LuUsers, bg: 'bg-sky-50', ring: 'ring-sky-200/60', iconColor: 'text-sky-600' },
  { id: 3, label: 'Молитва', Icon: LuHeart, bg: 'bg-rose-50', ring: 'ring-rose-200/60', iconColor: 'text-rose-500' },
  { id: 4, label: 'Детское', Icon: LuSparkles, bg: 'bg-violet-50', ring: 'ring-violet-200/60', iconColor: 'text-violet-500' },
];

interface Highlight {
  id: number;
  label: string;
  emoji: string;
  from: string;
  to: string;
}

const mockHighlights: Highlight[] = [
  { id: 1, label: 'Свидетельства', emoji: '✨', from: '#f59e0b', to: '#ef4444' },
  { id: 2, label: 'Отвеченные молитвы', emoji: '🙏', from: '#38bdf8', to: '#6366f1' },
  { id: 3, label: 'Крещение', emoji: '💧', from: '#2dd4bf', to: '#10b981' },
  { id: 4, label: 'Конференция', emoji: '🎤', from: '#a78bfa', to: '#ec4899' },
  { id: 5, label: 'Рождество', emoji: '⭐', from: '#f87171', to: '#fb923c' },
];

/* ═══════════════════════════════════════════════════════════ */

const SECTION_TITLE =
  'text-[11px] font-bold uppercase tracking-[0.18em] text-stone-400';

export function ProfilePage() {
  return (
    <div className="min-h-full bg-[var(--surface)] pb-24">
      {/* ────────────────────────────────────────────────────
          1. HEADER — градиентный баннер + аватар + имя
         ──────────────────────────────────────────────────── */}
      <div className="relative">
        {/* Banner */}
        <div className="relative h-44 overflow-hidden bg-gradient-to-br from-[#4a1e26] via-primary to-[#a25260] sm:h-52 md:h-56">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_20%_-20%,rgba(255,255,255,0.13),transparent)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_90%_120%,rgba(255,255,255,0.08),transparent)]" />
          {/* Subtle decorative circles */}
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/[0.04]" />
          <div className="absolute -bottom-6 left-1/4 h-24 w-24 rounded-full bg-white/[0.03]" />
        </div>

        {/* Avatar + Name overlay */}
        <div className="relative mx-auto -mt-16 flex max-w-lg flex-col items-center px-4 text-center sm:-mt-[4.5rem] sm:max-w-xl">
          {/* Avatar */}
          <div className="flex h-[7.5rem] w-[7.5rem] items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[var(--surface)] shadow-[0_8px_30px_rgba(125,54,64,0.18)] sm:h-[8.5rem] sm:w-[8.5rem]">
            {mockUser.avatarUrl ? (
              <img
                src={mockUser.avatarUrl}
                alt={`${mockUser.firstName} ${mockUser.lastName}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <LuUser
                className="h-14 w-14 text-primary/40 sm:h-16 sm:w-16"
                strokeWidth={1.4}
                aria-hidden
              />
            )}
          </div>

          {/* Name & Role */}
          <h1 className="mt-3.5 text-[1.6rem] font-extrabold leading-tight tracking-tight text-stone-900 sm:text-[1.85rem]">
            {mockUser.firstName} {mockUser.lastName}
          </h1>
          <p className="mt-1 text-sm font-medium text-stone-500">
            {mockUser.role}
          </p>

          {/* Message CTA */}
          <Link
            to="/messenger"
            className="mt-4 inline-flex items-center gap-2.5 rounded-full bg-primary px-7 py-2.5 text-sm font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary-dark active:scale-[0.97]"
          >
            <LuSend className="h-4 w-4 -rotate-12" aria-hidden />
            Написать сообщение
          </Link>
        </div>
      </div>

      {/* ── Content below header ── */}
      <div className="mx-auto mt-8 flex max-w-lg flex-col gap-7 px-4 sm:mt-10 sm:max-w-xl sm:gap-9 sm:px-5">

        {/* ────────────────────────────────────────────────────
            2. СЕЙЧАС В ФОКУСЕ — glassmorphism card
           ──────────────────────────────────────────────────── */}
        <section
          className="rounded-2xl border border-white/50 bg-white/55 p-5 shadow-[0_8px_32px_rgba(125,54,64,0.07)] backdrop-blur-xl sm:rounded-3xl sm:p-6"
        >
          <h2 className={SECTION_TITLE}>Сейчас в фокусе</h2>

          <div className="mt-4 space-y-3.5">
            {/* Reading */}
            <div className="flex items-center gap-3.5">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
                <LuBookOpen className="h-[1.2rem] w-[1.2rem]" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-stone-400">
                  Сейчас читаю
                </p>
                <p className="truncate text-[15px] font-semibold leading-snug text-stone-800">
                  {mockUser.reading}
                </p>
              </div>
            </div>

            {/* Prayer */}
            <div className="flex items-center gap-3.5">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-500 ring-1 ring-rose-100">
                <LuHeart className="h-[1.2rem] w-[1.2rem]" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-stone-400">
                  Молюсь за
                </p>
                <p className="truncate text-[15px] font-semibold leading-snug text-stone-800">
                  {mockUser.prayerTarget}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ────────────────────────────────────────────────────
            3. МОИ СЛУЖЕНИЯ — badge grid
           ──────────────────────────────────────────────────── */}
        <section>
          <h2 className={SECTION_TITLE}>Мои служения</h2>

          <div className="mt-4 grid grid-cols-4 gap-3 sm:gap-4">
            {mockBadges.map((b) => (
              <div key={b.id} className="flex flex-col items-center gap-2 text-center">
                <div
                  className={`grid h-14 w-14 place-items-center rounded-full shadow-sm ring-1 transition-transform hover:scale-105 sm:h-16 sm:w-16 ${b.bg} ${b.ring}`}
                >
                  <b.Icon
                    className={`h-6 w-6 sm:h-7 sm:w-7 ${b.iconColor}`}
                    aria-hidden
                  />
                </div>
                <span className="max-w-[5rem] text-[11px] font-semibold leading-tight text-stone-600 sm:text-xs">
                  {b.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ────────────────────────────────────────────────────
            4. ХАЙЛАЙТЫ — horizontal stories scroll
           ──────────────────────────────────────────────────── */}
        <section>
          <h2 className={SECTION_TITLE}>Хайлайты</h2>

          <div className="-mx-4 mt-4 flex gap-4 overflow-x-auto px-4 pb-2 scrollbar-hide sm:-mx-5 sm:gap-5 sm:px-5">
            {mockHighlights.map((h) => (
              <button
                key={h.id}
                type="button"
                className="flex shrink-0 flex-col items-center gap-1.5 outline-none transition-transform active:scale-95"
              >
                {/* Gradient ring */}
                <div
                  className="rounded-full p-[2.5px]"
                  style={{
                    background: `linear-gradient(135deg, ${h.from}, ${h.to})`,
                  }}
                >
                  <div className="grid h-[4.25rem] w-[4.25rem] place-items-center rounded-full bg-[var(--surface)] text-2xl sm:h-[4.75rem] sm:w-[4.75rem]">
                    {h.emoji}
                  </div>
                </div>
                <span className="max-w-[4.5rem] text-center text-[11px] font-semibold leading-tight text-stone-500">
                  {h.label}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
