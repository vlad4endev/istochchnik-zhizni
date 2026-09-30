import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { LuLink, LuPlus, LuTrash2, LuUserPlus, LuUsers } from 'react-icons/lu';

import { AppAvatar } from '@/components/AppAvatar';
import { BIRTH_DATE_PLACEHOLDER_YEAR, parseBirthDayMonthFromApi } from '../../lib/birthDate';
import { memberRosterName, splitMemberNameParts } from '../../lib/memberRosterName';
import {
  addMemberFamilyLink,
  apiErrorMessage,
  deleteMemberFamilyLink,
  fetchAdminMembers,
  fetchMemberFamily,
  updateMemberFamilyLink,
  type FamilyLink,
  type FamilyRelation,
} from './api';
import type { AppUser } from './types';

const RELATIONS: ReadonlyArray<{ id: FamilyRelation; label: string }> = [
  { id: 'spouse', label: 'Супруг(а)' },
  { id: 'parent', label: 'Родитель' },
  { id: 'child', label: 'Ребёнок' },
  { id: 'sibling', label: 'Брат / сестра' },
  { id: 'grandparent', label: 'Дедушка / бабушка' },
  { id: 'grandchild', label: 'Внук / внучка' },
  { id: 'other', label: 'Другой родственник' },
];

const RELATION_ORDER = RELATIONS.map((r) => r.id);

const inputClass =
  'w-full min-h-[48px] rounded-2xl border border-stone-200/90 bg-white px-4 text-base text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-primary focus:ring-4 focus:ring-primary/15 sm:min-h-[44px] sm:text-sm';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.charAt(0) ?? ''}${parts[1]?.charAt(0) ?? ''}`.toUpperCase() || '??';
}

function birthText(ymd: string | null): string | null {
  if (!ymd) return null;
  const { day, month } = parseBirthDayMonthFromApi(ymd);
  const year = /^(\d{4})-/.exec(ymd)?.[1];
  const base = day && month ? `${day}.${month}` : '';
  // Год 2000 в БД — заглушка «год неизвестен» (см. BIRTH_DATE_PLACEHOLDER_YEAR).
  return year && year !== String(BIRTH_DATE_PLACEHOLDER_YEAR) ? `${base}.${year}`.replace(/^\./, '') : base || null;
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[22px] bg-white p-4 shadow-sm ring-1 ring-stone-200/80 sm:p-5">{children}</div>;
}

function FamilyRow({
  link,
  busy,
  onRelation,
  onDelete,
}: {
  link: FamilyLink;
  busy: boolean;
  onRelation: (r: FamilyRelation) => void;
  onDelete: () => void;
}) {
  const birth = birthText(link.relative_birth_date);
  const isMember = link.relative_member_id !== null;
  return (
    <li className="flex items-center gap-3 py-3">
      <AppAvatar
        src={link.relative_avatar_url}
        fallback={<span className="text-sm font-bold text-stone-500">{initials(link.relative_name)}</span>}
        initialsFallbackText={initials(link.relative_name)}
        initialsColorSeed={link.relative_name}
        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-stone-100"
        alt=""
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-[14px] font-bold text-stone-900">{link.relative_name}</span>
          {isMember ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
              <LuLink className="h-3 w-3" aria-hidden /> участник
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <select
            aria-label="Степень родства"
            value={link.relation}
            disabled={busy}
            onChange={(e) => onRelation(e.target.value as FamilyRelation)}
            className="min-h-[32px] rounded-lg border border-stone-200 bg-white px-2 text-[12px] font-semibold text-stone-700 outline-none focus:border-primary"
          >
            {RELATIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          {birth ? <span className="text-[12px] text-stone-500">{birth}</span> : null}
        </div>
        {link.note ? <p className="mt-1 text-[12px] leading-snug text-stone-500">{link.note}</p> : null}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={onDelete}
        aria-label={`Удалить связь: ${link.relative_name}`}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-stone-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
      >
        <LuTrash2 className="h-4 w-4" aria-hidden />
      </button>
    </li>
  );
}

export function MemberFamilySection({ memberId, memberLastName }: { memberId: number; memberLastName: string }) {
  const qc = useQueryClient();
  const famKey = ['admin', 'family', memberId] as const;
  const famQ = useQuery({ queryKey: famKey, queryFn: () => fetchMemberFamily(memberId) });
  const membersQ = useQuery({ queryKey: ['admin', 'members'], queryFn: fetchAdminMembers, staleTime: 30_000 });

  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<'member' | 'free'>('member');
  const [search, setSearch] = useState('');
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [relation, setRelation] = useState<FamilyRelation>('spouse');
  const [freeName, setFreeName] = useState('');
  const [freeBirth, setFreeBirth] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const links = famQ.data ?? [];
  const linkedIds = useMemo(
    () => new Set(links.map((l) => l.relative_member_id).filter((x): x is number => x !== null)),
    [links],
  );
  const candidates = useMemo(() => {
    const all = (membersQ.data ?? []).filter((m) => m.id !== memberId && !linkedIds.has(m.id));
    return all;
  }, [membersQ.data, memberId, linkedIds]);

  const suggestions = useMemo(() => {
    const ln = memberLastName.trim().toLowerCase();
    if (ln.length < 3) return [] as AppUser[];
    return candidates.filter((m) => splitMemberNameParts(m).last.trim().toLowerCase() === ln).slice(0, 5);
  }, [candidates, memberLastName]);

  const found = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as AppUser[];
    return candidates.filter((m) => memberRosterName(m).toLowerCase().includes(q)).slice(0, 6);
  }, [candidates, search]);

  const picked = pickedId !== null ? (membersQ.data ?? []).find((m) => m.id === pickedId) ?? null : null;

  const grouped = useMemo(
    () =>
      [...links].sort(
        (a, b) => RELATION_ORDER.indexOf(a.relation) - RELATION_ORDER.indexOf(b.relation) || a.id - b.id,
      ),
    [links],
  );

  function resetForm() {
    setAdding(false);
    setSearch('');
    setPickedId(null);
    setFreeName('');
    setFreeBirth('');
    setNote('');
    setRelation('spouse');
    setError(null);
  }

  function onMutated(next: FamilyLink[]) {
    qc.setQueryData(famKey, next);
    // Связь двусторонняя: карточка второго участника тоже изменилась.
    void qc.invalidateQueries({ queryKey: ['admin', 'family'] });
  }

  const addMut = useMutation({
    mutationFn: () =>
      addMemberFamilyLink(
        memberId,
        mode === 'member'
          ? { relation, relative_member_id: pickedId, note: note.trim() || null }
          : {
              relation,
              relative_name: freeName.trim(),
              relative_birth_date: freeBirth || null,
              note: note.trim() || null,
            },
      ),
    onSuccess: (next) => {
      onMutated(next);
      resetForm();
    },
    onError: (e) => setError(apiErrorMessage(e, 'Не удалось добавить')),
  });
  const updMut = useMutation({
    mutationFn: (v: { id: number; relation: FamilyRelation }) =>
      updateMemberFamilyLink(memberId, v.id, { relation: v.relation }),
    onSuccess: onMutated,
    onError: (e) => setError(apiErrorMessage(e, 'Не удалось изменить')),
  });
  const delMut = useMutation({
    mutationFn: (id: number) => deleteMemberFamilyLink(memberId, id),
    onSuccess: onMutated,
    onError: (e) => setError(apiErrorMessage(e, 'Не удалось удалить')),
  });

  const busy = updMut.isPending || delMut.isPending;
  const canSubmit = mode === 'member' ? pickedId !== null : freeName.trim().length > 0;

  return (
    <div className="space-y-3">
      <Card>
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <h4 className="flex items-center gap-2 text-[13px] font-extrabold tracking-tight text-stone-900 sm:text-sm">
              <LuUsers className="h-4 w-4 text-primary/70" aria-hidden /> Семья
            </h4>
            <p className="mt-0.5 text-[12px] leading-snug text-stone-500">
              Если родственник тоже участник — выберите его из списка: связь появится в обеих карточках.
            </p>
          </div>
          {!adding ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-primary/90"
            >
              <LuPlus className="h-4 w-4" aria-hidden /> Добавить
            </button>
          ) : null}
        </div>

        {famQ.isPending ? (
          <p className="py-4 text-center text-[13px] text-stone-400">Загрузка…</p>
        ) : famQ.isError ? (
          <p className="py-4 text-center text-[13px] text-red-600">{apiErrorMessage(famQ.error, 'Не удалось загрузить')}</p>
        ) : grouped.length === 0 ? (
          <p className="py-4 text-center text-[13px] italic text-stone-400">Родственники пока не добавлены</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {grouped.map((l) => (
              <FamilyRow
                key={l.id}
                link={l}
                busy={busy}
                onRelation={(r) => updMut.mutate({ id: l.id, relation: r })}
                onDelete={() => {
                  if (window.confirm(`Удалить связь с «${l.relative_name}»?`)) delMut.mutate(l.id);
                }}
              />
            ))}
          </ul>
        )}
        {!adding && error ? <p className="mt-2 text-[12px] text-red-600">{error}</p> : null}
      </Card>

      {!adding && suggestions.length > 0 ? (
        <Card>
          <p className="mb-2 text-[12px] font-bold text-stone-600">Возможно, родственники (та же фамилия)</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMode('member');
                  setPickedId(m.id);
                  setAdding(true);
                }}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-stone-100 px-3 text-[12px] font-semibold text-stone-700 transition hover:bg-primary/10 hover:text-primary"
              >
                <LuUserPlus className="h-3.5 w-3.5" aria-hidden /> {memberRosterName(m)}
              </button>
            ))}
          </div>
        </Card>
      ) : null}

      {adding ? (
        <Card>
          <div className="mb-3 flex gap-1 rounded-2xl bg-stone-100 p-1">
            {(
              [
                ['member', 'Участник церкви'],
                ['free', 'Нет в списке участников'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={`min-h-[38px] flex-1 rounded-xl px-2 text-[12px] font-bold transition ${mode === id ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {mode === 'member' ? (
              picked ? (
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-primary/30 bg-primary/[0.04] px-4 py-3">
                  <span className="text-[14px] font-bold text-stone-900">{memberRosterName(picked)}</span>
                  <button
                    type="button"
                    className="text-[12px] font-semibold text-primary"
                    onClick={() => setPickedId(null)}
                  >
                    Изменить
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    type="search"
                    className={inputClass}
                    placeholder="Начните вводить имя участника…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    autoFocus
                  />
                  {found.length > 0 ? (
                    <ul className="mt-2 overflow-hidden rounded-2xl border border-stone-200 bg-white">
                      {found.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => setPickedId(m.id)}
                            className="flex min-h-[44px] w-full items-center px-4 text-left text-[14px] text-stone-800 hover:bg-stone-50"
                          >
                            {memberRosterName(m)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : search.trim() ? (
                    <p className="mt-2 text-[12px] text-stone-500">
                      Никого не нашли — переключитесь на «Нет в списке участников».
                    </p>
                  ) : null}
                </div>
              )
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  className={inputClass}
                  placeholder="Фамилия и имя"
                  value={freeName}
                  maxLength={255}
                  onChange={(e) => setFreeName(e.target.value)}
                  autoFocus
                />
                <input
                  type="date"
                  className={inputClass}
                  aria-label="Дата рождения"
                  value={freeBirth}
                  onChange={(e) => setFreeBirth(e.target.value)}
                />
              </div>
            )}

            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-stone-500">
                {mode === 'member' && picked ? `${memberRosterName(picked)} приходится этому участнику:` : 'Кем приходится:'}
              </span>
              <select
                className={inputClass}
                value={relation}
                onChange={(e) => setRelation(e.target.value as FamilyRelation)}
              >
                {RELATIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>

            <input
              className={inputClass}
              placeholder="Заметка (необязательно): например, не посещает церковь"
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
            />

            {error ? <p className="text-[12px] text-red-600">{error}</p> : null}

            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                disabled={!canSubmit || addMut.isPending}
                onClick={() => {
                  setError(null);
                  addMut.mutate();
                }}
                className="min-h-[46px] rounded-2xl bg-primary px-5 text-[14px] font-bold text-white shadow-md shadow-primary/20 disabled:opacity-50"
              >
                {addMut.isPending ? 'Сохранение…' : 'Добавить в семью'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="min-h-[46px] rounded-2xl border border-stone-200 bg-white px-5 text-[14px] font-semibold text-stone-700 hover:bg-stone-50"
              >
                Отмена
              </button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
