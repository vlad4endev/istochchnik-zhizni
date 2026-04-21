import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  LuArrowLeft,
  LuSlidersHorizontal,
  LuSave,
  LuTrash2,
  LuUpload,
  LuWand,
  LuX,
} from 'react-icons/lu';

import { useAuthStore } from '../../auth/authStore';
import { canDeleteSongFromCatalog, canModerateSongCatalog } from '../../auth/studioAccess';
import { emitAppToast } from '../../../lib/uiFeedback';
import { deleteSong, fetchSong, updateSong } from '../api';
import { convertToChordPro } from '../addSong/chordProConversion';
import { SmartImportModal, type SmartImportSourceTab } from '../addSong/SmartImportModal';
import { LyricsWithChords } from '../components/LyricsWithChords';
import { SectionInsertToolbar } from '../components/SectionInsertToolbar';
import { quickChordsForKey } from '../addSong/quickChords';
import { extractCommonChords } from '../chordProEngine';
import { fetchVersionForSong, saveVersion } from '../../studio/api';
import { studioMySongsPath, getStudioModuleSurface } from '../../studio/studioPaths';
import { useSongbookChrome } from '../SongbookChromeContext';

const KEY_ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const CHORD_STRIP = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Am', 'Dm', 'Em', 'G', 'C7'];

/**
 * Редактор студийной версии: основной экран — текст; тональность и справка по BPM — в шторке.
 */
export function StudioEditor() {
  const { songId } = useParams<{ songId: string }>();
  const id = Number(songId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const surface = getStudioModuleSurface(location.pathname);
  const role = useAuthStore((s) => s.role);
  const canDeleteCatalog = canDeleteSongFromCatalog(role);
  const canEditCatalogMeta = canModerateSongCatalog(role);
  const { stageMode } = useSongbookChrome();

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const selRef = useRef({ start: 0, end: 0 });

  const [importOpen, setImportOpen] = useState(false);
  const [importInitialTab, setImportInitialTab] = useState<SmartImportSourceTab>('text');
  const [toolsOpen, setToolsOpen] = useState(false);
  const [rawPaste, setRawPaste] = useState('');
  const [showPreview, setShowPreview] = useState(true);

  const songQ = useQuery({
    queryKey: ['song', id],
    queryFn: () => fetchSong(id),
    enabled: Number.isInteger(id) && id > 0,
  });

  const verQ = useQuery({
    queryKey: ['studio', 'version', id],
    queryFn: async () => {
      try {
        return await fetchVersionForSong(id);
      } catch {
        return null;
      }
    },
    enabled: Number.isInteger(id) && id > 0,
  });

  const [content, setContent] = useState('');
  const [key, setKey] = useState('');
  const [catalogTempo, setCatalogTempo] = useState('');
  const [catalogTimeSignature, setCatalogTimeSignature] = useState('');
  const [catalogTags, setCatalogTags] = useState('');
  const [quickRoot, setQuickRoot] = useState('G');
  const [quickMode, setQuickMode] = useState<'major' | 'minor'>('major');
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const s = songQ.data;
    const v = verQ.data as { custom_content?: string | null; custom_key?: string | null } | null;
    if (!s) return;
    const draftKey = `studio:autosave:song:${id}`;
    let draft: { content?: string; key?: string } | null = null;
    try {
      const raw = localStorage.getItem(draftKey);
      draft = raw ? (JSON.parse(raw) as { content?: string; key?: string }) : null;
    } catch {
      draft = null;
    }
    setContent(
      typeof draft?.content === 'string' ? draft.content : (v?.custom_content ?? s.content),
    );
    setKey(typeof draft?.key === 'string' ? draft.key : (v?.custom_key ?? s.default_key ?? ''));
    setCatalogTempo(s.tempo == null ? '' : String(s.tempo));
    setCatalogTimeSignature(s.time_signature ?? '');
    setCatalogTags(Array.isArray(s.tags) ? s.tags.join(', ') : '');
  }, [songQ.data, verQ.data]);

  useEffect(() => {
    if (!Number.isInteger(id) || id <= 0) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(
          `studio:autosave:song:${id}`,
          JSON.stringify({ content, key, updatedAt: Date.now() }),
        );
      } catch {
        // ignore storage quota/availability errors
      }
    }, 700);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [id, content, key]);

  const saveMut = useMutation({
    mutationFn: () => saveVersion(id, { custom_content: content, custom_key: key || null }),
    onSuccess: () => {
      try {
        localStorage.removeItem(`studio:autosave:song:${id}`);
      } catch {
        // noop
      }
      void qc.invalidateQueries({ queryKey: ['studio', 'versions'] });
      void qc.invalidateQueries({ queryKey: ['songs'] });
      void qc.invalidateQueries({ queryKey: ['song', id] });
      emitAppToast({ kind: 'success', message: 'Версия сохранена' });
    },
  });

  const deleteCatalogMut = useMutation({
    mutationFn: () => deleteSong(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['songs'] });
      void qc.invalidateQueries({ queryKey: ['songs', 'catalog'] });
      void qc.invalidateQueries({ queryKey: ['songs', 'catalog-all'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'versions'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'setlists'] });
      emitAppToast({ kind: 'success', message: 'Песня удалена из каталога' });
      navigate(studioMySongsPath(surface));
    },
    onError: () => emitAppToast('Не удалось удалить песню'),
  });

  const saveCatalogMetaMut = useMutation({
    mutationFn: async () => {
      if (!canEditCatalogMeta) {
        throw new Error('Нет прав на изменение метаданных каталога');
      }
      const tempoNum = catalogTempo.trim().length === 0 ? null : Number(catalogTempo);
      if (tempoNum != null && (!Number.isFinite(tempoNum) || tempoNum <= 0 || tempoNum > 400)) {
        throw new Error('BPM должен быть числом от 1 до 400');
      }
      const tags = catalogTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await updateSong(id, {
        tempo: tempoNum,
        time_signature: catalogTimeSignature.trim() || null,
        tags,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['song', id] });
      void qc.invalidateQueries({ queryKey: ['songs'] });
      void qc.invalidateQueries({ queryKey: ['songs', 'catalog'] });
      emitAppToast({ kind: 'success', message: 'Метаданные каталога сохранены' });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error && err.message ? err.message : 'Не удалось сохранить метаданные';
      emitAppToast(msg);
    },
  });

  const applyConvert = useCallback((src: string) => convertToChordPro(src), []);

  const syncEditorSelection = () => {
    const el = editorRef.current;
    if (!el) return;
    selRef.current = { start: el.selectionStart, end: el.selectionEnd };
  };

  const insertChord = (symbol: string) => {
    const el = editorRef.current;
    const chord = `[${symbol}]`;
    if (!el) {
      setContent((c) => c + chord);
      return;
    }
    const { start, end } = selRef.current;
    const v = el.value;
    const next = v.slice(0, start) + chord + v.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      if (!editorRef.current) return;
      editorRef.current.focus();
      const pos = start + chord.length;
      editorRef.current.setSelectionRange(pos, pos);
      selRef.current = { start: pos, end: pos };
    });
  };

  const insertSectionMarkerLine = (markerOneLine: string) => {
    const line = markerOneLine.trim();
    const el = editorRef.current;
    if (!el) {
      setContent((c) => {
        const base = c.length === 0 || c.endsWith('\n') ? c : `${c}\n`;
        return `${base}${line}\n`;
      });
      return;
    }
    const { start, end } = selRef.current;
    const v = el.value;
    const before = v.slice(0, start);
    const needsNl = before.length > 0 && !before.endsWith('\n');
    const piece = `${needsNl ? '\n' : ''}${line}\n`;
    const next = before + piece + v.slice(end);
    setContent(next);
    const pos = (before + piece).length;
    requestAnimationFrame(() => {
      if (!editorRef.current) return;
      editorRef.current.focus();
      editorRef.current.setSelectionRange(pos, pos);
      selRef.current = { start: pos, end: pos };
    });
  };

  const handleSmartImport = ({ raw, chordPro }: { raw: string; chordPro: string }) => {
    setRawPaste(raw);
    setContent(chordPro);
  };

  const quick = quickChordsForKey(quickRoot, quickMode);
  const commonChords = useMemo(() => extractCommonChords(content, 12), [content]);
  const toolbarChords = useMemo(() => {
    const merged = [...commonChords, ...quick];
    return Array.from(new Set(merged)).slice(0, 16);
  }, [commonChords, quick]);
  const backTo = studioMySongsPath(surface);

  /** Тёмный интерфейс только в режиме сцены внутри песенника; отдельная /studio — светлая тема. */
  const darkUi = surface === 'songbook' && stageMode;

  const shell = darkUi
    ? {
        page: 'text-slate-100',
        link: 'text-slate-400 hover:text-white',
        title: 'text-white',
        muted: 'text-slate-500',
        field:
          'border-0 bg-slate-950/80 text-slate-100 ring-1 ring-slate-800 placeholder:text-slate-600 focus:ring-slate-600',
        editor:
          'border-0 bg-slate-950/50 text-slate-100 ring-1 ring-slate-800/80 placeholder:text-slate-600 focus:ring-slate-600',
        drawer: 'bg-slate-900 text-slate-100 shadow-2xl ring-1 ring-slate-800',
        iconBtn: 'rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white',
        primary: 'rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500',
        chordBtn: 'rounded-lg bg-amber-100/95 text-sm font-semibold text-amber-950 hover:bg-amber-50',
      }
    : {
        page: 'text-slate-900',
        link: 'text-slate-600 hover:text-slate-900',
        title: 'text-slate-900',
        muted: 'text-slate-500',
        field:
          'border-0 bg-white text-slate-900 ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-slate-400/30',
        editor:
          'border-0 bg-slate-50 text-slate-900 ring-1 ring-slate-200/90 placeholder:text-slate-400 focus:ring-slate-400/25',
        drawer: 'bg-white text-slate-900 shadow-2xl ring-1 ring-slate-200',
        iconBtn: 'rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900',
        primary: 'rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800',
        chordBtn: 'rounded-lg bg-amber-50 text-sm font-semibold text-amber-950 ring-1 ring-amber-200/80 hover:bg-amber-100',
      };

  const isSongbookShell = surface === 'songbook';
  const importVariant = stageMode || !isSongbookShell ? 'studio' : 'default';

  if (!Number.isInteger(id) || id <= 0) {
    return <p className="text-red-600">Некорректный id песни</p>;
  }
  if (songQ.isLoading) return <p className={shell.muted}>Загрузка…</p>;
  if (songQ.isError || !songQ.data) {
    return <p className="text-red-600">Песня не найдена</p>;
  }

  const s = songQ.data;

  return (
    <div
      className={`mx-auto flex max-w-3xl flex-col gap-4 pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-10 ${shell.page}`}
    >
      <SmartImportModal
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          setImportInitialTab('text');
        }}
        onApply={handleSmartImport}
        initialRaw={rawPaste}
        initialTab={importInitialTab}
        variant={importVariant}
      />

      {toolsOpen ? (
        <>
          <button
            type="button"
            className={[
              'fixed inset-0 z-[100] backdrop-blur-[2px]',
              darkUi ? 'bg-slate-950/40' : 'bg-stone-900/25',
            ].join(' ')}
            aria-label="Закрыть панель"
            onClick={() => setToolsOpen(false)}
          />
          <div
            className={`fixed inset-x-0 bottom-0 z-[101] max-h-[88vh] overflow-y-auto rounded-t-3xl p-5 md:inset-auto md:right-6 md:top-20 md:w-[min(400px,calc(100vw-3rem))] md:rounded-2xl ${shell.drawer}`}
            role="dialog"
            aria-labelledby="studio-tools-title"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="studio-tools-title" className="text-base font-semibold">
                Параметры
              </h2>
              <button
                type="button"
                onClick={() => setToolsOpen(false)}
                className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center ${shell.iconBtn}`}
                aria-label="Закрыть"
              >
                <LuX className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <label className={`mb-1.5 block text-xs font-medium uppercase tracking-wide ${shell.muted}`}>
                  Тональность версии
                </label>
                <input
                  className={`w-full min-h-[48px] rounded-xl px-3 py-2.5 outline-none ${shell.field}`}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="напр. Am"
                />
              </div>
              <p
                className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${shell.muted} ${
                  darkUi ? 'bg-slate-950/30' : 'bg-stone-100'
                }`}
              >
                В каталоге: темп {s.tempo ?? '—'} BPM · размер {s.time_signature ?? '—'} (справочно)
              </p>

              <div className="space-y-2 rounded-xl border border-slate-200/70 p-3">
                <p className={`text-xs font-semibold uppercase tracking-wide ${shell.muted}`}>
                  Метаданные каталога
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className={`text-[11px] ${shell.muted}`}>BPM</span>
                    <input
                      inputMode="numeric"
                      value={catalogTempo}
                      onChange={(e) => setCatalogTempo(e.target.value)}
                      disabled={!canEditCatalogMeta}
                      className={`w-full min-h-[42px] rounded-lg px-2 py-1.5 text-sm outline-none ${shell.field} disabled:opacity-60`}
                      placeholder="напр. 72"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className={`text-[11px] ${shell.muted}`}>Размер</span>
                    <input
                      value={catalogTimeSignature}
                      onChange={(e) => setCatalogTimeSignature(e.target.value)}
                      disabled={!canEditCatalogMeta}
                      className={`w-full min-h-[42px] rounded-lg px-2 py-1.5 text-sm outline-none ${shell.field} disabled:opacity-60`}
                      placeholder="напр. 4/4"
                    />
                  </label>
                </div>
                <label className="space-y-1">
                  <span className={`text-[11px] ${shell.muted}`}>Теги (через запятую)</span>
                  <input
                    value={catalogTags}
                    onChange={(e) => setCatalogTags(e.target.value)}
                    disabled={!canEditCatalogMeta}
                    className={`w-full min-h-[42px] rounded-lg px-2 py-1.5 text-sm outline-none ${shell.field} disabled:opacity-60`}
                    placeholder="praise, worship, fast"
                  />
                </label>
                {canEditCatalogMeta ? (
                  <button
                    type="button"
                    onClick={() => saveCatalogMetaMut.mutate()}
                    disabled={saveCatalogMetaMut.isPending}
                    className={`inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold ${
                      darkUi
                        ? 'bg-slate-700 text-white hover:bg-slate-600'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    } disabled:opacity-60`}
                  >
                    <LuSave className="h-4 w-4" />
                    Сохранить метаданные
                  </button>
                ) : (
                  <p className={`text-[11px] ${shell.muted}`}>
                    Изменять BPM/размер/теги могут только редактор и админ.
                  </p>
                )}
              </div>

              <div>
                <p className={`mb-2 text-xs font-medium uppercase tracking-wide ${shell.muted}`}>
                  Быстрые аккорды
                </p>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <select
                    value={quickRoot}
                    onChange={(e) => setQuickRoot(e.target.value)}
                    className={`min-h-[44px] rounded-lg px-2 text-sm outline-none ${shell.field}`}
                  >
                    {KEY_ROOTS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                  <select
                    value={quickMode}
                    onChange={(e) => setQuickMode(e.target.value as 'major' | 'minor')}
                    className={`min-h-[44px] rounded-lg px-2 text-sm outline-none ${shell.field}`}
                  >
                    <option value="major">мажор</option>
                    <option value="minor">минор</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {quick.map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => insertChord(ch)}
                      className={`min-h-[44px] min-w-[44px] px-2 ${shell.chordBtn}`}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const next = rawPaste.trim() ? applyConvert(rawPaste) : applyConvert(content);
                  setContent(next);
                }}
                className={
                  darkUi
                    ? 'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-slate-800/90 px-4 text-sm font-semibold text-white hover:bg-slate-700'
                    : 'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-900 ring-1 ring-slate-200 hover:bg-slate-200/80'
                }
              >
                <LuWand className="h-4 w-4" />
                Конвертировать в ChordPro
              </button>

              <button
                type="button"
                onClick={() => {
                  setToolsOpen(false);
                  setImportInitialTab('pdf');
                  setImportOpen(true);
                }}
                className={
                  darkUi
                    ? 'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-600 px-4 text-sm font-semibold text-slate-100 hover:bg-slate-800/80'
                    : 'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50'
                }
              >
                <LuUpload className="h-4 w-4" />
                Импорт из PDF…
              </button>
            </div>
          </div>
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 gap-y-3">
        <Link
          to={backTo}
          className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl ${shell.iconBtn}`}
          aria-label="Назад к списку"
        >
          <LuArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className={`min-w-0 flex-1 text-lg font-semibold leading-tight sm:text-xl ${shell.title}`}>
          {s.title}
        </h1>
        <button
          type="button"
          onClick={() => {
            setImportInitialTab('text');
            setImportOpen(true);
          }}
          className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center ${shell.iconBtn}`}
          aria-label="Умный импорт"
        >
          <LuUpload className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setToolsOpen(true)}
          className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center ${shell.iconBtn}`}
          aria-label="Параметры и аккорды"
        >
          <LuSlidersHorizontal className="h-5 w-5" />
        </button>
        {canDeleteCatalog ? (
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  `Удалить «${s.title}» из каталога целиком? Студийные версии и позиции в сетлистах будут удалены. Действие необратимо.`,
                )
              ) {
                deleteCatalogMut.mutate();
              }
            }}
            disabled={deleteCatalogMut.isPending}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold disabled:opacity-50 ${
              darkUi
                ? 'border-red-900/50 bg-red-950/30 text-red-300 hover:bg-red-950/50'
                : 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100'
            }`}
          >
            <LuTrash2 className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden sm:inline">Удалить из каталога</span>
            <span className="sm:hidden">Удалить</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className={`${shell.primary} disabled:opacity-50`}
        >
          Сохранить
        </button>
      </div>

      <p className={`text-xs ${shell.muted}`}>
        Ваш текст ниже — оригинал в каталоге не меняется, пока вы не сохраните и не удалите песню целиком.
      </p>

      <SectionInsertToolbar dark={darkUi} onInsert={insertSectionMarkerLine} className="mb-1" />

      <div className="mb-2 flex items-center justify-between">
        <p className={`text-xs ${shell.muted}`}>
          Автосохранение черновика включено (локально каждые ~700мс).
        </p>
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className={`rounded-lg px-2 py-1 text-xs font-medium ${shell.iconBtn}`}
        >
          {showPreview ? 'Скрыть превью' : 'Показать превью'}
        </button>
      </div>

      <div
        className={[
          'sticky z-20 -mx-1 rounded-xl border px-2 py-2 backdrop-blur',
          darkUi
            ? 'top-[3.9rem] border-slate-800 bg-slate-950/90'
            : 'top-[3.9rem] border-stone-200 bg-white/95',
        ].join(' ')}
      >
        <p className={`mb-1 text-[11px] font-semibold uppercase tracking-wide ${shell.muted}`}>
          Частые аккорды в этой песне
        </p>
        <div className="flex max-w-full gap-1 overflow-x-auto [scrollbar-width:none]">
          {(toolbarChords.length > 0 ? toolbarChords : CHORD_STRIP).map((ch) => (
            <button
              key={`toolbar-${ch}`}
              type="button"
              onClick={() => insertChord(ch)}
              className={`min-h-[40px] shrink-0 rounded-lg px-2.5 ${shell.chordBtn}`}
            >
              {ch}
            </button>
          ))}
        </div>
      </div>

      <div className={showPreview ? 'grid gap-3 md:grid-cols-2' : ''}>
        <textarea
          ref={editorRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onSelect={syncEditorSelection}
          onKeyUp={syncEditorSelection}
          onMouseUp={syncEditorSelection}
          className={`min-h-[min(70vh,520px)] w-full flex-1 resize-y rounded-2xl px-4 py-4 font-mono text-[15px] leading-relaxed outline-none ${shell.editor}`}
          placeholder={'ChordPro. Блоки: отдельной строкой {sec:Куплет 1} или кнопки над полем.'}
          spellCheck={false}
        />

        {showPreview ? (
          <div
            className={[
              'min-h-[min(70vh,520px)] overflow-auto rounded-2xl border p-4',
              darkUi ? 'border-slate-800 bg-slate-950/60' : 'border-stone-200 bg-white',
            ].join(' ')}
          >
            <p className={`mb-3 text-xs ${shell.muted}`}>Live preview</p>
            <LyricsWithChords
              text={content}
              transposeSemitones={0}
              chordTone={darkUi ? 'dark' : 'light'}
              className={darkUi ? 'text-slate-100' : 'text-stone-900'}
            />
          </div>
        ) : null}
      </div>

      <div
        className={[
          'fixed left-0 right-0 z-40 border-t md:hidden',
          darkUi ? 'border-slate-800 bg-slate-950/95' : 'border-slate-200 bg-white/95',
        ].join(' ')}
        style={{
          bottom: 'max(5.75rem, calc(4.25rem + env(safe-area-inset-bottom, 0px)))',
        }}
      >
        <div className="flex max-w-full gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:none]">
          {CHORD_STRIP.map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => insertChord(ch)}
              className={`min-h-[44px] shrink-0 rounded-xl px-3 ${shell.chordBtn}`}
            >
              {ch}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
