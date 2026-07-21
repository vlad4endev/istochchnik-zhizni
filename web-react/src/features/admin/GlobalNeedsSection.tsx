import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useMemo, useState } from 'react';
import {
  LuBookOpen,
  LuChurch,
  LuPencil,
  LuPlus,
  LuSearch,
  LuTrash2,
  LuUserRoundX,
  LuX,
} from 'react-icons/lu';

import type { Backslider, GlobalTheme, Ministry } from '../../types';
import {
  apiErrorMessage,
  createBacksliderApi,
  createGlobalThemeApi,
  createMinistryApi,
  deleteBacksliderApi,
  deleteGlobalThemeApi,
  deleteMinistryApi,
  fetchGlobalBacksliders,
  fetchGlobalMinistries,
  fetchGlobalThemes,
  updateBacksliderApi,
  updateGlobalThemeApi,
  updateMinistryApi,
} from './api';

const Q_GT = ['admin', 'global', 'themes'] as const;
const Q_GM = ['admin', 'global', 'ministries'] as const;
const Q_GB = ['admin', 'global', 'backsliders'] as const;

type ContentTab = 'themes' | 'ministries' | 'backsliders';

type ThemeDraft = {
  id: number | null;
  title: string;
  bible_verse: string;
  prayer_points: string;
};

type MinistryDraft = {
  id: number | null;
  title: string;
  prayer_points: string;
};

type BacksliderDraft = {
  id: number | null;
  name: string;
};

type EditorState =
  | { kind: 'theme'; draft: ThemeDraft }
  | { kind: 'ministry'; draft: MinistryDraft }
  | { kind: 'backslider'; draft: BacksliderDraft };

function fieldClass() {
  return (
    'w-full rounded-xl border border-stone-200/90 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none ' +
    'focus:border-primary focus:ring-2 focus:ring-primary/20 placeholder:text-stone-400'
  );
}

function btnPrimary(className = '') {
  return `inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:opacity-95 disabled:opacity-50 ${className}`;
}

function btnSecondary(className = '') {
  return `inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-stone-50 disabled:opacity-50 ${className}`;
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function includesQuery(haystack: string | null | undefined, query: string): boolean {
  if (!query) return true;
  return normalizeSearch(haystack ?? '').includes(query);
}

function previewText(value: string | null | undefined, max = 140): string {
  const text = (value ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function emptyThemeDraft(): ThemeDraft {
  return { id: null, title: '', bible_verse: '', prayer_points: '' };
}

function emptyMinistryDraft(): MinistryDraft {
  return { id: null, title: '', prayer_points: '' };
}

function emptyBacksliderDraft(): BacksliderDraft {
  return { id: null, name: '' };
}

export function GlobalNeedsSection() {
  const qc = useQueryClient();
  const searchId = useId();
  const themes = useQuery({ queryKey: Q_GT, queryFn: fetchGlobalThemes });
  const ministries = useQuery({ queryKey: Q_GM, queryFn: fetchGlobalMinistries });
  const backsliders = useQuery({ queryKey: Q_GB, queryFn: fetchGlobalBacksliders });

  const [tab, setTab] = useState<ContentTab>('themes');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [note, setNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: 'theme'; item: GlobalTheme }
    | { kind: 'ministry'; item: Ministry }
    | { kind: 'backslider'; item: Backslider }
    | null
  >(null);

  const invT = () => void qc.invalidateQueries({ queryKey: Q_GT });
  const invM = () => void qc.invalidateQueries({ queryKey: Q_GM });
  const invB = () => void qc.invalidateQueries({ queryKey: Q_GB });

  useEffect(() => {
    setExpandedId(null);
  }, [tab, search]);

  useEffect(() => {
    if (!editor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditor(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor]);

  const q = normalizeSearch(search);

  const filteredThemes = useMemo(() => {
    const list = themes.data ?? [];
    if (!q) return list;
    return list.filter(
      (x) =>
        includesQuery(x.title, q) ||
        includesQuery(x.bible_verse, q) ||
        includesQuery(x.prayer_points, q),
    );
  }, [themes.data, q]);

  const filteredMinistries = useMemo(() => {
    const list = ministries.data ?? [];
    if (!q) return list;
    return list.filter((x) => includesQuery(x.title, q) || includesQuery(x.prayer_points, q));
  }, [ministries.data, q]);

  const filteredBacksliders = useMemo(() => {
    const list = backsliders.data ?? [];
    if (!q) return list;
    return list.filter((x) => includesQuery(x.name, q));
  }, [backsliders.data, q]);

  const saveTheme = useMutation({
    mutationFn: async (draft: ThemeDraft) => {
      const body = {
        title: draft.title.trim(),
        bible_verse: draft.bible_verse.trim() || null,
        prayer_points: draft.prayer_points.trim() || null,
      };
      if (draft.id == null) {
        return createGlobalThemeApi({
          title: body.title,
          ...(body.bible_verse ? { bible_verse: body.bible_verse } : {}),
          ...(body.prayer_points ? { prayer_points: body.prayer_points } : {}),
        });
      }
      return updateGlobalThemeApi(draft.id, body);
    },
    onSuccess: (_data, draft) => {
      setEditor(null);
      setNote({ type: 'ok', text: draft.id == null ? 'Тема добавлена.' : 'Тема обновлена.' });
      invT();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить тему.') }),
  });

  const saveMinistry = useMutation({
    mutationFn: async (draft: MinistryDraft) => {
      const body = {
        title: draft.title.trim(),
        prayer_points: draft.prayer_points.trim() || null,
      };
      if (draft.id == null) {
        return createMinistryApi({
          title: body.title,
          ...(body.prayer_points ? { prayer_points: body.prayer_points } : {}),
        });
      }
      return updateMinistryApi(draft.id, body);
    },
    onSuccess: (_data, draft) => {
      setEditor(null);
      setNote({
        type: 'ok',
        text: draft.id == null ? 'Служение добавлено.' : 'Служение обновлено.',
      });
      invM();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить служение.') }),
  });

  const saveBackslider = useMutation({
    mutationFn: async (draft: BacksliderDraft) => {
      const name = draft.name.trim();
      if (draft.id == null) return createBacksliderApi(name);
      return updateBacksliderApi(draft.id, name);
    },
    onSuccess: (_data, draft) => {
      setEditor(null);
      setNote({
        type: 'ok',
        text: draft.id == null ? 'Имя добавлено.' : 'Запись обновлена.',
      });
      invB();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить запись.') }),
  });

  const deleteMut = useMutation({
    mutationFn: async (
      target:
        | { kind: 'theme'; item: GlobalTheme }
        | { kind: 'ministry'; item: Ministry }
        | { kind: 'backslider'; item: Backslider },
    ) => {
      if (target.kind === 'theme') await deleteGlobalThemeApi(target.item.id);
      else if (target.kind === 'ministry') await deleteMinistryApi(target.item.id);
      else await deleteBacksliderApi(target.item.id);
    },
    onSuccess: (_data, target) => {
      setPendingDelete(null);
      setNote({ type: 'ok', text: 'Удалено.' });
      if (target.kind === 'theme') invT();
      else if (target.kind === 'ministry') invM();
      else invB();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось удалить.') }),
  });

  const saving = saveTheme.isPending || saveMinistry.isPending || saveBackslider.isPending;
  const loading = themes.isLoading || ministries.isLoading || backsliders.isLoading;

  const tabs: {
    id: ContentTab;
    label: string;
    count: number;
    Icon: typeof LuBookOpen;
  }[] = [
    { id: 'themes', label: 'Темы', count: themes.data?.length ?? 0, Icon: LuBookOpen },
    { id: 'ministries', label: 'Служения', count: ministries.data?.length ?? 0, Icon: LuChurch },
    {
      id: 'backsliders',
      label: 'Отступники',
      count: backsliders.data?.length ?? 0,
      Icon: LuUserRoundX,
    },
  ];

  const openCreate = () => {
    setNote(null);
    if (tab === 'themes') setEditor({ kind: 'theme', draft: emptyThemeDraft() });
    else if (tab === 'ministries') setEditor({ kind: 'ministry', draft: emptyMinistryDraft() });
    else setEditor({ kind: 'backslider', draft: emptyBacksliderDraft() });
  };

  const createLabel =
    tab === 'themes' ? 'Новая тема' : tab === 'ministries' ? 'Новое служение' : 'Добавить имя';

  const searchPlaceholder =
    tab === 'themes'
      ? 'Поиск по названию, стиху, акцентам…'
      : tab === 'ministries'
        ? 'Поиск по названию и акцентам…'
        : 'Поиск по имени…';

  const emptyCopy =
    tab === 'themes'
      ? q
        ? 'Ничего не найдено по запросу.'
        : 'Пока нет глобальных тем.'
      : tab === 'ministries'
        ? q
          ? 'Ничего не найдено по запросу.'
          : 'Пока нет служений.'
        : q
          ? 'Ничего не найдено по запросу.'
          : 'Список отступников пуст.';

  return (
    <div className="space-y-4">
      {note ? (
        <div
          className={
            note.type === 'ok'
              ? 'flex justify-between gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'
              : 'flex justify-between gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900'
          }
          role="status"
        >
          <span>{note.text}</span>
          <button type="button" className="text-stone-500 hover:text-stone-800" onClick={() => setNote(null)}>
            <LuX className="h-4 w-4" aria-hidden />
            <span className="sr-only">Закрыть</span>
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="inline-flex w-full max-w-xl rounded-xl border border-stone-200 bg-stone-50/80 p-1"
          role="tablist"
          aria-label="Тип контента"
        >
          {tabs.map(({ id, label, count, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                className={[
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold transition sm:text-sm',
                  active
                    ? 'bg-white text-[#7B2D3F] shadow-sm'
                    : 'text-stone-500 hover:text-stone-800',
                ].join(' ')}
                onClick={() => setTab(id)}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{label}</span>
                <span
                  className={[
                    'rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                    active ? 'bg-[#7B2D3F]/10 text-[#7B2D3F]' : 'bg-stone-200/70 text-stone-600',
                  ].join(' ')}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <button type="button" className={btnPrimary('shrink-0')} onClick={openCreate}>
          <LuPlus className="h-4 w-4" aria-hidden />
          {createLabel}
        </button>
      </div>

      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          Поиск
        </label>
        <LuSearch
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
          aria-hidden
        />
        <input
          id={searchId}
          type="search"
          className={`${fieldClass()} pl-9 pr-9`}
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoComplete="off"
        />
        {search ? (
          <button
            type="button"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
            onClick={() => setSearch('')}
            aria-label="Очистить поиск"
          >
            <LuX className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-stone-200/50" />
          ))}
        </div>
      ) : (
        <div className="space-y-2" role="tabpanel">
          {tab === 'themes' ? (
            filteredThemes.length === 0 ? (
              <EmptyState text={emptyCopy} onCreate={openCreate} createLabel={createLabel} showCreate={!q} />
            ) : (
              filteredThemes.map((item) => {
                const key = `theme-${item.id}`;
                const expanded = expandedId === key;
                const verse = previewText(item.bible_verse, 120);
                const points = item.prayer_points?.trim() ?? '';
                return (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-stone-200/90 bg-white p-4 shadow-sm transition hover:border-stone-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-stone-900">{item.title}</h4>
                        {verse ? (
                          <p className="mt-1 text-xs italic text-stone-500">{verse}</p>
                        ) : (
                          <p className="mt-1 text-xs text-stone-400">Стих не указан</p>
                        )}
                        {points ? (
                          <p
                            className={[
                              'mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-700',
                              expanded ? '' : 'line-clamp-3',
                            ].join(' ')}
                          >
                            {points}
                          </p>
                        ) : (
                          <p className="mt-2 text-sm text-stone-400">Акценты молитвы не заполнены</p>
                        )}
                        {points && points.length > 160 ? (
                          <button
                            type="button"
                            className="mt-1.5 text-xs font-semibold text-[#7B2D3F] hover:underline"
                            onClick={() => setExpandedId(expanded ? null : key)}
                          >
                            {expanded ? 'Свернуть' : 'Читать полностью'}
                          </button>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                        <button
                          type="button"
                          className={btnSecondary('!px-2.5 !py-1.5 text-xs')}
                          onClick={() => {
                            setNote(null);
                            setEditor({
                              kind: 'theme',
                              draft: {
                                id: item.id,
                                title: item.title,
                                bible_verse: item.bible_verse ?? '',
                                prayer_points: item.prayer_points ?? '',
                              },
                            });
                          }}
                        >
                          <LuPencil className="h-3.5 w-3.5" aria-hidden />
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center gap-1 rounded-xl border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                          onClick={() => {
                            setNote(null);
                            setPendingDelete({ kind: 'theme', item });
                          }}
                        >
                          <LuTrash2 className="h-3.5 w-3.5" aria-hidden />
                          Удалить
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            )
          ) : null}

          {tab === 'ministries' ? (
            filteredMinistries.length === 0 ? (
              <EmptyState text={emptyCopy} onCreate={openCreate} createLabel={createLabel} showCreate={!q} />
            ) : (
              filteredMinistries.map((item) => {
                const key = `ministry-${item.id}`;
                const expanded = expandedId === key;
                const points = item.prayer_points?.trim() ?? '';
                return (
                  <article
                    key={item.id}
                    className="rounded-2xl border border-stone-200/90 bg-white p-4 shadow-sm transition hover:border-stone-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-sm font-bold text-stone-900">{item.title}</h4>
                        {points ? (
                          <p
                            className={[
                              'mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-700',
                              expanded ? '' : 'line-clamp-3',
                            ].join(' ')}
                          >
                            {points}
                          </p>
                        ) : (
                          <p className="mt-2 text-sm text-stone-400">Акценты молитвы не заполнены</p>
                        )}
                        {points && points.length > 160 ? (
                          <button
                            type="button"
                            className="mt-1.5 text-xs font-semibold text-[#7B2D3F] hover:underline"
                            onClick={() => setExpandedId(expanded ? null : key)}
                          >
                            {expanded ? 'Свернуть' : 'Читать полностью'}
                          </button>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                        <button
                          type="button"
                          className={btnSecondary('!px-2.5 !py-1.5 text-xs')}
                          onClick={() => {
                            setNote(null);
                            setEditor({
                              kind: 'ministry',
                              draft: {
                                id: item.id,
                                title: item.title,
                                prayer_points: item.prayer_points ?? '',
                              },
                            });
                          }}
                        >
                          <LuPencil className="h-3.5 w-3.5" aria-hidden />
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center gap-1 rounded-xl border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                          onClick={() => {
                            setNote(null);
                            setPendingDelete({ kind: 'ministry', item });
                          }}
                        >
                          <LuTrash2 className="h-3.5 w-3.5" aria-hidden />
                          Удалить
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            )
          ) : null}

          {tab === 'backsliders' ? (
            filteredBacksliders.length === 0 ? (
              <EmptyState text={emptyCopy} onCreate={openCreate} createLabel={createLabel} showCreate={!q} />
            ) : (
              <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200/90 bg-white">
                {filteredBacksliders.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-stone-50/80"
                  >
                    <span className="min-w-0 font-medium text-stone-800">{item.name}</span>
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        className={btnSecondary('!px-2.5 !py-1.5 text-xs')}
                        onClick={() => {
                          setNote(null);
                          setEditor({
                            kind: 'backslider',
                            draft: { id: item.id, name: item.name },
                          });
                        }}
                      >
                        <LuPencil className="h-3.5 w-3.5" aria-hidden />
                        Изменить
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-1 rounded-xl border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                        onClick={() => {
                          setNote(null);
                          setPendingDelete({ kind: 'backslider', item });
                        }}
                      >
                        <LuTrash2 className="h-3.5 w-3.5" aria-hidden />
                        Удалить
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {q &&
          ((tab === 'themes' && filteredThemes.length > 0) ||
            (tab === 'ministries' && filteredMinistries.length > 0) ||
            (tab === 'backsliders' && filteredBacksliders.length > 0)) ? (
            <p className="pt-1 text-center text-xs text-stone-500">
              Найдено:{' '}
              {tab === 'themes'
                ? filteredThemes.length
                : tab === 'ministries'
                  ? filteredMinistries.length
                  : filteredBacksliders.length}
            </p>
          ) : null}
        </div>
      )}

      {editor ? (
        <ContentEditorModal
          editor={editor}
          saving={saving}
          onClose={() => setEditor(null)}
          onChange={setEditor}
          onSave={() => {
            setNote(null);
            if (editor.kind === 'theme') saveTheme.mutate(editor.draft);
            else if (editor.kind === 'ministry') saveMinistry.mutate(editor.draft);
            else saveBackslider.mutate(editor.draft);
          }}
        />
      ) : null}

      {pendingDelete ? (
        <ConfirmDeleteModal
          title={
            pendingDelete.kind === 'theme'
              ? pendingDelete.item.title
              : pendingDelete.kind === 'ministry'
                ? pendingDelete.item.title
                : pendingDelete.item.name
          }
          pending={deleteMut.isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => deleteMut.mutate(pendingDelete)}
        />
      ) : null}
    </div>
  );
}

function EmptyState(props: {
  text: string;
  createLabel: string;
  showCreate: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-200 bg-stone-50/60 px-4 py-10 text-center">
      <p className="text-sm text-stone-500">{props.text}</p>
      {props.showCreate ? (
        <button type="button" className={btnPrimary('mt-4')} onClick={props.onCreate}>
          <LuPlus className="h-4 w-4" aria-hidden />
          {props.createLabel}
        </button>
      ) : null}
    </div>
  );
}

function ContentEditorModal(props: {
  editor: EditorState;
  saving: boolean;
  onClose: () => void;
  onChange: (next: EditorState) => void;
  onSave: () => void;
}) {
  const { editor, saving, onClose, onChange, onSave } = props;
  const isNew =
    editor.kind === 'theme'
      ? editor.draft.id == null
      : editor.kind === 'ministry'
        ? editor.draft.id == null
        : editor.draft.id == null;

  const title =
    editor.kind === 'theme'
      ? isNew
        ? 'Новая тема'
        : 'Редактирование темы'
      : editor.kind === 'ministry'
        ? isNew
          ? 'Новое служение'
          : 'Редактирование служения'
        : isNew
          ? 'Новое имя'
          : 'Редактирование имени';

  const canSave =
    editor.kind === 'backslider'
      ? Boolean(editor.draft.name.trim())
      : Boolean(editor.draft.title.trim());

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prayer-content-editor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-stone-100 bg-white/95 px-5 py-4 backdrop-blur">
          <h3 id="prayer-content-editor-title" className="text-base font-bold text-stone-900">
            {title}
          </h3>
          <button
            type="button"
            className="rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {editor.kind === 'theme' ? (
            <>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Заголовок *
                </span>
                <input
                  className={fieldClass()}
                  value={editor.draft.title}
                  onChange={(e) =>
                    onChange({
                      kind: 'theme',
                      draft: { ...editor.draft, title: e.target.value },
                    })
                  }
                  placeholder="Например: Молитва о единстве"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Библейский стих
                </span>
                <textarea
                  className={`${fieldClass()} min-h-[72px]`}
                  value={editor.draft.bible_verse}
                  onChange={(e) =>
                    onChange({
                      kind: 'theme',
                      draft: { ...editor.draft, bible_verse: e.target.value },
                    })
                  }
                  placeholder="Текст стиха или ссылка (необязательно)"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Акценты молитвы
                </span>
                <textarea
                  className={`${fieldClass()} min-h-[160px] leading-relaxed`}
                  value={editor.draft.prayer_points}
                  onChange={(e) =>
                    onChange({
                      kind: 'theme',
                      draft: { ...editor.draft, prayer_points: e.target.value },
                    })
                  }
                  placeholder="Пункты для молитвы — каждый с новой строки"
                />
              </label>
            </>
          ) : null}

          {editor.kind === 'ministry' ? (
            <>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Название *
                </span>
                <input
                  className={fieldClass()}
                  value={editor.draft.title}
                  onChange={(e) =>
                    onChange({
                      kind: 'ministry',
                      draft: { ...editor.draft, title: e.target.value },
                    })
                  }
                  placeholder="Например: Молодёжное служение"
                  autoFocus
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Акценты молитвы
                </span>
                <textarea
                  className={`${fieldClass()} min-h-[160px] leading-relaxed`}
                  value={editor.draft.prayer_points}
                  onChange={(e) =>
                    onChange({
                      kind: 'ministry',
                      draft: { ...editor.draft, prayer_points: e.target.value },
                    })
                  }
                  placeholder="Пункты для молитвы — каждый с новой строки"
                />
              </label>
            </>
          ) : null}

          {editor.kind === 'backslider' ? (
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-stone-500">
                Имя *
              </span>
              <input
                className={fieldClass()}
                value={editor.draft.name}
                onChange={(e) =>
                  onChange({
                    kind: 'backslider',
                    draft: { ...editor.draft, name: e.target.value },
                  })
                }
                placeholder="Имя для блока «Отпавшие»"
                autoFocus
              />
            </label>
          ) : null}
        </div>

        <div className="sticky bottom-0 flex gap-2 border-t border-stone-100 bg-white/95 px-5 py-4 backdrop-blur">
          <button type="button" className={btnSecondary('flex-1')} disabled={saving} onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className={btnPrimary('flex-1')}
            disabled={!canSave || saving}
            onClick={onSave}
          >
            {saving ? 'Сохранение…' : isNew ? 'Добавить' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteModal(props: {
  title: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onClick={props.onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prayer-content-delete-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="prayer-content-delete-title" className="text-base font-bold text-stone-900">
          Удалить запись?
        </h3>
        <p className="mt-2 text-sm text-stone-600">
          «{props.title}» будет удалено без возможности восстановления.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            className={btnSecondary('flex-1')}
            disabled={props.pending}
            onClick={props.onCancel}
          >
            Отмена
          </button>
          <button
            type="button"
            className="flex-1 rounded-xl border border-red-200 bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
            disabled={props.pending}
            onClick={props.onConfirm}
          >
            {props.pending ? 'Удаление…' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  );
}
