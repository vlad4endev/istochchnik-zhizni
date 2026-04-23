import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBeforeUnload, useLocation, useNavigate, useParams } from 'react-router-dom';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import {
  LuArrowLeft,
  LuCircleHelp,
  LuClock3,
  LuPlus,
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

import { BlockWrapper } from './BlockWrapper';
import {
  blocksToChordPro,
  chordProToBlocks,
  createSongBlock,
  studioPresetToBlockMeta,
  type SongBlock,
  type SongBlockType,
} from './songBlocks';

const KEY_ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const CHORD_STRIP = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Am', 'Dm', 'Em', 'G', 'C7'];
const ARCHIVE_TAG = '__archived';
type SongStatus = 'draft' | 'published' | 'archived';

function detectSongStatus(isPublished: boolean, tags: string[]): SongStatus {
  if (isPublished) return 'published';
  return tags.includes(ARCHIVE_TAG) ? 'archived' : 'draft';
}

function withArchiveTag(tags: string[], status: SongStatus): string[] {
  const clean = tags.filter((t) => t !== ARCHIVE_TAG);
  return status === 'archived' ? [...clean, ARCHIVE_TAG] : clean;
}

function studioPreviewFrame(type: SongBlockType, darkUi: boolean): string {
  switch (type) {
    case 'chorus':
      return darkUi
        ? 'rounded-xl border-l-[5px] border-sky-400 bg-sky-950/40 pl-3 py-2'
        : 'rounded-xl border-l-[5px] border-sky-600 bg-sky-50 pl-3 py-2';
    case 'prechorus':
      return darkUi
        ? 'rounded-xl border-l-[5px] border-indigo-400/90 bg-indigo-950/30 pl-3 py-2'
        : 'rounded-xl border-l-[5px] border-indigo-500 bg-indigo-50/70 pl-3 py-2';
    case 'bridge':
      return darkUi
        ? 'rounded-xl border-l-[5px] border-amber-400/80 bg-amber-950/30 pl-3 py-2'
        : 'rounded-xl border-l-[5px] border-amber-500 bg-amber-50/80 pl-3 py-2';
    case 'solo':
      return darkUi
        ? 'rounded-xl border-l-[5px] border-fuchsia-400/80 bg-fuchsia-950/20 pl-3 py-2'
        : 'rounded-xl border-l-[5px] border-fuchsia-500 bg-fuchsia-50/70 pl-3 py-2';
    case 'outro':
      return darkUi
        ? 'rounded-xl border-l-[5px] border-emerald-400/80 bg-emerald-950/20 pl-3 py-2'
        : 'rounded-xl border-l-[5px] border-emerald-500 bg-emerald-50/70 pl-3 py-2';
    case 'intro':
      return darkUi
        ? 'rounded-xl py-2 text-[0.92em] italic text-slate-400'
        : 'rounded-xl py-2 text-[0.92em] italic text-stone-600';
    case 'verse':
    default:
      return darkUi ? 'rounded-xl py-2' : 'rounded-xl py-2';
  }
}

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

  const textareaByBlockRef = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const focusedBlockIdRef = useRef<string | null>(null);
  const selByBlockRef = useRef<Record<string, { start: number; end: number }>>({});

  const [importOpen, setImportOpen] = useState(false);
  const [importInitialTab, setImportInitialTab] = useState<SmartImportSourceTab>('text');
  const [toolsOpen, setToolsOpen] = useState(false);
  const [rawPaste, setRawPaste] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [chordPickerOpen, setChordPickerOpen] = useState(false);
  const [mobilePane, setMobilePane] = useState<'editor' | 'preview' | 'outline'>('editor');

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

  const [blocks, setBlocks] = useState<SongBlock[]>(() => [createSongBlock('verse', '')]);
  const [key, setKey] = useState('');
  const [catalogTempo, setCatalogTempo] = useState('');
  const [catalogTimeSignature, setCatalogTimeSignature] = useState('');
  const [catalogTags, setCatalogTags] = useState('');
  const [songStatus, setSongStatus] = useState<SongStatus>('published');
  const [quickRoot, setQuickRoot] = useState('G');
  const [quickMode, setQuickMode] = useState<'major' | 'minor'>('major');
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const autosaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSavedSnapshotRef = useRef('');
  const blockCardRef = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    const s = songQ.data;
    const v = verQ.data as { custom_content?: string | null; custom_key?: string | null } | null;
    if (!s) return;
    const draftKey = `studio:autosave:song:${id}`;
    let draft: {
      blocks?: SongBlock[];
      content?: string;
      key?: string;
    } | null = null;
    try {
      const raw = localStorage.getItem(draftKey);
      draft = raw ? (JSON.parse(raw) as { blocks?: SongBlock[]; content?: string; key?: string }) : null;
    } catch {
      draft = null;
    }

    const fromChordText = (t: string) => chordProToBlocks(t);

    const normalizeDraftBlocks = (rawBlocks: SongBlock[]): SongBlock[] => {
      if (!Array.isArray(rawBlocks) || rawBlocks.length === 0) return [createSongBlock('verse', '')];
      return rawBlocks.map((b) =>
        createSongBlock(
          ['intro', 'verse', 'prechorus', 'chorus', 'bridge', 'solo', 'outro'].includes(b.type) ? b.type : 'verse',
          typeof b.content === 'string' ? b.content : '',
          typeof b.sectionHint === 'string' && b.sectionHint.trim() ? b.sectionHint.trim() : undefined,
          typeof b.id === 'string' && b.id.length > 0 ? b.id : undefined,
        ),
      );
    };

    if (Array.isArray(draft?.blocks) && draft.blocks.length > 0) {
      setBlocks(normalizeDraftBlocks(draft.blocks));
    } else if (typeof draft?.content === 'string') {
      setBlocks(fromChordText(draft.content));
    } else {
      setBlocks(fromChordText(v?.custom_content ?? s.content ?? ''));
    }

    setKey(typeof draft?.key === 'string' ? draft.key : (v?.custom_key ?? s.default_key ?? ''));
    setCatalogTempo(s.tempo == null ? '' : String(s.tempo));
    setCatalogTimeSignature(s.time_signature ?? '');
    const initialTags = Array.isArray(s.tags) ? s.tags : [];
    setCatalogTags(initialTags.filter((t) => t !== ARCHIVE_TAG).join(', '));
    setSongStatus(detectSongStatus(Boolean(s.is_published), initialTags));
    try {
      setShowWelcome(localStorage.getItem('studio:welcome:dismissed') !== '1');
    } catch {
      setShowWelcome(false);
    }
    lastSavedSnapshotRef.current = JSON.stringify({
      content: blocksToChordPro(chordProToBlocks(v?.custom_content ?? s.content ?? '')),
      key: v?.custom_key ?? s.default_key ?? '',
    });
  }, [songQ.data, verQ.data]);

  useEffect(() => {
    if (!Number.isInteger(id) || id <= 0) return;
    if (autosaveIntervalRef.current) clearInterval(autosaveIntervalRef.current);
    autosaveIntervalRef.current = setInterval(() => {
      try {
        localStorage.setItem(
          `studio:autosave:song:${id}`,
          JSON.stringify({ blocks, key, updatedAt: Date.now() }),
        );
        setDraftSavedAt(Date.now());
      } catch {
        // ignore storage quota/availability errors
      }
    }, 30000);

    return () => {
      if (autosaveIntervalRef.current) clearInterval(autosaveIntervalRef.current);
    };
  }, [id, blocks, key]);

  const saveMut = useMutation({
    mutationFn: () =>
      saveVersion(id, { custom_content: blocksToChordPro(blocks), custom_key: key || null }),
    onSuccess: () => {
      try {
        localStorage.removeItem(`studio:autosave:song:${id}`);
      } catch {
        // noop
      }
      void qc.invalidateQueries({ queryKey: ['studio', 'versions'] });
      void qc.invalidateQueries({ queryKey: ['songs'] });
      void qc.invalidateQueries({ queryKey: ['song', id] });
      lastSavedSnapshotRef.current = JSON.stringify({
        content: blocksToChordPro(blocks),
        key,
      });
      emitAppToast({ kind: 'success', message: 'Песня сохранена ✓' });
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
      const isPublished = songStatus === 'published';
      await updateSong(id, {
        tempo: tempoNum,
        time_signature: catalogTimeSignature.trim() || null,
        tags: withArchiveTag(tags, songStatus),
        is_published: isPublished,
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

  const insertChord = (symbol: string) => {
    const chord = `[${symbol}]`;
    const bid = focusedBlockIdRef.current ?? blocks[0]?.id;
    if (!bid) return;
    const sel = selByBlockRef.current[bid] ?? { start: 0, end: 0 };
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== bid) return b;
        const v = b.content;
        return { ...b, content: v.slice(0, sel.start) + chord + v.slice(sel.end) };
      }),
    );
    const pos = sel.start + chord.length;
    selByBlockRef.current[bid] = { start: pos, end: pos };
    requestAnimationFrame(() => {
      const el = textareaByBlockRef.current.get(bid);
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const updateBlockContent = (blockId: string, nextContent: string) => {
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, content: nextContent } : b)));
  };

  const moveBlock = (blockId: string, dir: -1 | 1) => {
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === blockId);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      const [row] = next.splice(i, 1);
      next.splice(j, 0, row);
      return next;
    });
  };

  const reorderBlocks = (startIndex: number, endIndex: number) => {
    if (startIndex === endIndex) return;
    setBlocks((prev) => {
      const next = [...prev];
      const [picked] = next.splice(startIndex, 1);
      if (!picked) return prev;
      next.splice(endIndex, 0, picked);
      return next;
    });
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    reorderBlocks(result.source.index, result.destination.index);
  };

  const deleteBlock = (blockId: string) => {
    setBlocks((prev) => {
      if (prev.length <= 1) return [createSongBlock('verse', '')];
      return prev.filter((b) => b.id !== blockId);
    });
  };

  const duplicateBlock = (blockId: string) => {
    setBlocks((prev) => {
      const ix = prev.findIndex((b) => b.id === blockId);
      if (ix < 0) return prev;
      const base = prev[ix];
      const clone = createSongBlock(base.type, base.content, base.sectionHint ? `${base.sectionHint} (копия)` : undefined);
      const next = [...prev];
      next.splice(ix + 1, 0, clone);
      return next;
    });
  };

  const renameBlock = (blockId: string, sectionHint: string) => {
    setBlocks((prev) =>
      prev.map((b) =>
        b.id === blockId
          ? {
              ...b,
              sectionHint: sectionHint || undefined,
            }
          : b,
      ),
    );
  };

  const addQuickBlock = (type: SongBlockType) => {
    const nb = createSongBlock(type, '');
    setBlocks((prev) => [...prev, nb]);
    requestAnimationFrame(() => {
      focusedBlockIdRef.current = nb.id;
      setActiveBlockId(nb.id);
      textareaByBlockRef.current.get(nb.id)?.focus();
    });
  };

  const addBlockFromPreset = (title: string) => {
    const meta = studioPresetToBlockMeta(title);
    const nb = createSongBlock(meta.type, '', meta.sectionHint);
    const focusId = focusedBlockIdRef.current;
    setBlocks((prev) => {
      if (!focusId) return [...prev, nb];
      const ix = prev.findIndex((b) => b.id === focusId);
      if (ix === -1) return [...prev, nb];
      const next = [...prev];
      next.splice(ix + 1, 0, nb);
      return next;
    });
    requestAnimationFrame(() => {
      focusedBlockIdRef.current = nb.id;
      setActiveBlockId(nb.id);
      textareaByBlockRef.current.get(nb.id)?.focus();
    });
  };

  const handleSmartPasteSplit = (blockId: string, paragraphs: string[]) => {
    if (paragraphs.length < 2) return;
    const [first, ...rest] = paragraphs;
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === blockId);
      if (idx === -1) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], content: first };
      const inserts = rest.map((p) => createSongBlock('verse', p));
      next.splice(idx + 1, 0, ...inserts);
      return next;
    });
  };

  const handleSmartImport = ({ raw, chordPro }: { raw: string; chordPro: string }) => {
    setRawPaste(raw);
    setBlocks(chordProToBlocks(chordPro));
  };

  const quick = quickChordsForKey(quickRoot, quickMode);
  const joinedChordPro = useMemo(() => blocksToChordPro(blocks), [blocks]);
  const commonChords = useMemo(() => extractCommonChords(joinedChordPro, 12), [joinedChordPro]);
  const toolbarChords = useMemo(() => {
    const merged = [...commonChords, ...quick];
    return Array.from(new Set(merged)).slice(0, 16);
  }, [commonChords, quick]);
  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        content: joinedChordPro,
        key,
      }),
    [joinedChordPro, key],
  );
  const hasUnsavedChanges = currentSnapshot !== lastSavedSnapshotRef.current;
  const backTo = studioMySongsPath(surface);
  const showEditorPane = mobilePane === 'editor';
  const showPreviewPane = showPreview && mobilePane === 'preview';
  const showOutlinePane = mobilePane === 'outline';

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

  useBeforeUnload(
    useCallback(
      (event) => {
        if (!hasUnsavedChanges) return;
        event.preventDefault();
      },
      [hasUnsavedChanges],
    ),
  );

  useEffect(() => {
    if (showPreview) return;
    if (mobilePane === 'preview') setMobilePane('editor');
  }, [showPreview, mobilePane]);

  const confirmLeaveIfDirty = () => {
    if (!hasUnsavedChanges) return true;
    return window.confirm('Есть несохранённые изменения. Сохранить перед выходом?');
  };

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
      className={`mx-auto flex max-w-3xl flex-col gap-4 pb-[calc(13.5rem+env(safe-area-inset-bottom))] md:pb-10 ${shell.page}`}
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
                <label className="space-y-1">
                  <span className={`text-[11px] ${shell.muted}`}>Статус песни</span>
                  <select
                    value={songStatus}
                    onChange={(e) => setSongStatus(e.target.value as SongStatus)}
                    disabled={!canEditCatalogMeta}
                    className={`w-full min-h-[42px] rounded-lg px-2 py-1.5 text-sm outline-none ${shell.field} disabled:opacity-60`}
                  >
                    <option value="draft">Черновик</option>
                    <option value="published">Опубликована</option>
                    <option value="archived">Архив</option>
                  </select>
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
                  const src = rawPaste.trim() ? rawPaste : joinedChordPro;
                  setBlocks(chordProToBlocks(applyConvert(src)));
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
          onClick={(e) => {
            if (confirmLeaveIfDirty()) return;
            e.preventDefault();
          }}
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
          Сохранить песню
        </button>
      </div>

      <p className={`text-xs ${hasUnsavedChanges ? 'text-amber-500' : shell.muted}`}>
        {hasUnsavedChanges ? 'Есть несохранённые изменения' : 'Все изменения сохранены'}
      </p>

      <p className={`text-xs ${shell.muted}`}>
        Ваш текст ниже — оригинал в каталоге не меняется, пока вы не сохраните и не удалите песню целиком.
      </p>

      {showWelcome ? (
        <div
          className={`rounded-xl border p-3 text-sm ${
            darkUi ? 'border-sky-900/70 bg-sky-950/30 text-sky-100' : 'border-sky-200 bg-sky-50 text-sky-900'
          }`}
        >
          <p>
            Вставьте текст песни, расставьте аккорды в квадратных скобках вида <strong>[Am]</strong> прямо в тексте и
            разделите песню на блоки.
          </p>
          <button
            type="button"
            className="mt-2 rounded-lg border px-3 py-1.5 text-xs font-semibold"
            onClick={() => {
              setShowWelcome(false);
              try {
                localStorage.setItem('studio:welcome:dismissed', '1');
              } catch {
                // noop
              }
            }}
          >
            Понятно
          </button>
        </div>
      ) : null}

      <div className={`rounded-xl border p-2 ${darkUi ? 'border-slate-800 bg-slate-950/40' : 'border-stone-200 bg-white'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setChordPickerOpen((v) => !v)}
            className={`inline-flex min-h-[40px] items-center gap-1 rounded-lg border px-3 text-sm font-semibold ${
              darkUi ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-stone-200 bg-stone-50 text-stone-900'
            }`}
          >
            + Аккорд
            <LuCircleHelp className="h-3.5 w-3.5 opacity-70" title="Вставляет [Am] в позицию курсора" />
          </button>
          {(
            [
              { type: 'verse' as const, label: 'Куплет' },
              { type: 'chorus' as const, label: 'Припев' },
              { type: 'bridge' as const, label: 'Бридж' },
              { type: 'intro' as const, label: 'Интро' },
              { type: 'outro' as const, label: 'Аутро' },
              { type: 'solo' as const, label: 'Соло' },
            ] as const
          ).map(({ type, label }) => (
            <button
              key={`toolbar-block-${type}`}
              type="button"
              onClick={() => addQuickBlock(type)}
              className={`inline-flex min-h-[40px] items-center rounded-lg border px-3 text-sm font-semibold ${
                darkUi ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-stone-200 bg-stone-50 text-stone-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {chordPickerOpen ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(toolbarChords.length > 0 ? toolbarChords : CHORD_STRIP).map((ch) => (
              <button
                key={`picker-${ch}`}
                type="button"
                onClick={() => insertChord(ch)}
                className={`min-h-[36px] rounded-lg px-2.5 ${shell.chordBtn}`}
              >
                {ch}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <SectionInsertToolbar dark={darkUi} onPresetAsBlock={addBlockFromPreset} className="mb-1" />

      <div className="mb-2 flex items-center justify-between">
        <p className={`inline-flex items-center gap-1 text-xs ${shell.muted}`}>
          <LuClock3 className="h-3.5 w-3.5" />
          Автосохранение черновика каждые 30 секунд
          {draftSavedAt ? ` · Черновик сохранён в ${new Date(draftSavedAt).toLocaleTimeString()}` : ''}
        </p>
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className={`rounded-lg px-2 py-1 text-xs font-medium ${shell.iconBtn}`}
        >
          {showPreview ? 'Скрыть превью' : 'Показать превью'}
        </button>
      </div>

      <div className="md:hidden">
        <div
          className={`grid grid-cols-3 gap-1 rounded-xl p-1 ${
            darkUi ? 'bg-slate-900/80' : 'bg-stone-100'
          }`}
        >
          {(
            [
              { id: 'editor', label: 'Редактор' },
              { id: 'preview', label: 'Превью' },
              { id: 'outline', label: 'Структура' },
            ] as const
          ).map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setMobilePane(x.id)}
              className={`min-h-[40px] rounded-lg text-xs font-semibold ${
                mobilePane === x.id
                  ? darkUi
                    ? 'bg-slate-700 text-white'
                    : 'bg-white text-stone-900 shadow-sm'
                  : darkUi
                    ? 'text-slate-300'
                    : 'text-stone-600'
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={[
          'sticky z-20 -mx-1 rounded-xl border px-2 py-2 backdrop-blur',
          darkUi
            ? 'top-[3.9rem] border-slate-800 bg-slate-950/90'
            : 'top-[3.9rem] border-stone-200 bg-white/95',
          mobilePane !== 'editor' ? 'hidden md:block' : '',
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

      <div
        className={[
          'mb-2 hidden flex-wrap items-center justify-center gap-2 rounded-2xl border px-3 py-2 md:flex',
          darkUi ? 'border-slate-800 bg-slate-950/50' : 'border-stone-200 bg-stone-50/80',
        ].join(' ')}
      >
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${shell.muted}`}>Блоки</span>
        {(
          [
            { type: 'verse' as const, label: 'Куплет' },
            { type: 'prechorus' as const, label: 'Предприпев' },
            { type: 'chorus' as const, label: 'Припев' },
            { type: 'bridge' as const, label: 'Бридж' },
            { type: 'intro' as const, label: 'Intro' },
            { type: 'outro' as const, label: 'Outro' },
            { type: 'solo' as const, label: 'Solo' },
          ] as const
        ).map(({ type, label }) => (
          <button
            key={type}
            type="button"
            onClick={() => addQuickBlock(type)}
            className={`inline-flex min-h-[40px] items-center gap-1 rounded-full border px-3 text-xs font-semibold ${
              darkUi
                ? 'border-slate-700 bg-slate-900 text-slate-100 hover:bg-slate-800'
                : 'border-stone-200 bg-white text-stone-800 hover:bg-stone-100'
            }`}
          >
            <LuPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <div className={showPreview ? 'grid gap-3 xl:grid-cols-[1fr_0.8fr_0.6fr]' : 'grid gap-3 lg:grid-cols-[1fr_0.55fr]'}>
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="studio-blocks">
            {(dropProvided) => (
              <div
                ref={dropProvided.innerRef}
                {...dropProvided.droppableProps}
                className={`flex max-h-[min(78vh,640px)] flex-col gap-3 overflow-y-auto pr-0.5 md:pr-1 ${
                  showEditorPane ? '' : 'hidden md:flex'
                }`}
              >
                {blocks.map((b, i) => (
                  <Draggable key={b.id} draggableId={b.id} index={i}>
                    {(dragProvided) => (
                      <div
                        ref={(el) => {
                          dragProvided.innerRef(el);
                          if (el) blockCardRef.current.set(b.id, el);
                          else blockCardRef.current.delete(b.id);
                        }}
                        {...dragProvided.draggableProps}
                      >
                        <BlockWrapper
                          block={b}
                          shellEditor={shell.editor}
                          darkUi={darkUi}
                          isFirst={i === 0}
                          isLast={i === blocks.length - 1}
                          isActive={activeBlockId === b.id}
                          onChange={updateBlockContent}
                          onDelete={deleteBlock}
                          onDuplicate={duplicateBlock}
                          onRename={renameBlock}
                          onMove={moveBlock}
                          onFocusBlock={(blockId) => {
                            focusedBlockIdRef.current = blockId;
                            setActiveBlockId(blockId);
                          }}
                          onSelectBlock={(blockId, start, end) => {
                            selByBlockRef.current[blockId] = { start, end };
                          }}
                          onSmartPasteSplit={handleSmartPasteSplit}
                          textareaRef={(el) => {
                            if (el) textareaByBlockRef.current.set(b.id, el);
                            else textareaByBlockRef.current.delete(b.id);
                          }}
                          dragHandleProps={dragProvided.dragHandleProps ?? undefined}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {dropProvided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        {showPreview ? (
          <div
            className={[
              'flex max-h-[min(78vh,640px)] flex-col gap-3 overflow-y-auto rounded-2xl border p-4',
              darkUi ? 'border-slate-800 bg-slate-950/60' : 'border-stone-200 bg-white',
              showPreviewPane ? '' : 'hidden md:flex',
            ].join(' ')}
          >
            <p className={`shrink-0 text-xs ${shell.muted}`}>Live preview</p>
            {blocks.map((b) => (
              <div key={`pv-${b.id}`} className={studioPreviewFrame(b.type, darkUi)}>
                <LyricsWithChords
                  text={b.content}
                  transposeSemitones={0}
                  chordTone={darkUi ? 'dark' : 'light'}
                  fontSizePx={16}
                  className={darkUi ? 'text-slate-100' : 'text-stone-900'}
                />
              </div>
            ))}
          </div>
        ) : null}

        <aside
          className={`max-h-[min(78vh,640px)] overflow-y-auto rounded-2xl border p-3 ${
            darkUi ? 'border-slate-800 bg-slate-950/40' : 'border-stone-200 bg-white'
          } ${showOutlinePane ? '' : 'hidden md:block'}`}
        >
          <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${shell.muted}`}>Структура песни</p>
          <div className="space-y-1.5">
            {blocks.map((block, idx) => (
              <button
                key={`outline-${block.id}`}
                type="button"
                className={`w-full rounded-lg px-2 py-2 text-left text-sm ${
                  activeBlockId === block.id
                    ? darkUi
                      ? 'bg-slate-800 text-white'
                      : 'bg-sky-50 text-sky-900'
                    : darkUi
                      ? 'text-slate-300 hover:bg-slate-900'
                      : 'text-stone-700 hover:bg-stone-50'
                }`}
                onClick={() => {
                  setActiveBlockId(block.id);
                  blockCardRef.current.get(block.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              >
                {idx + 1}. {block.sectionHint || block.type}
              </button>
            ))}
          </div>
        </aside>
      </div>

      <div
        className={[
          'fixed left-0 right-0 z-40 border-t md:hidden',
          darkUi ? 'border-slate-800 bg-slate-950/95' : 'border-slate-200 bg-white/95',
          mobilePane !== 'editor' ? 'hidden' : '',
        ].join(' ')}
        style={{
          bottom: 'max(9.25rem, calc(7.75rem + env(safe-area-inset-bottom, 0px)))',
        }}
      >
        <div
          className={[
            'flex max-w-full flex-wrap justify-center gap-1 border-b px-2 py-1.5',
            darkUi ? 'border-slate-800' : 'border-slate-200',
          ].join(' ')}
        >
          {(
            [
              { type: 'verse' as const, label: '+ Куплет' },
              { type: 'prechorus' as const, label: '+ Предприпев' },
              { type: 'chorus' as const, label: '+ Припев' },
              { type: 'bridge' as const, label: '+ Бридж' },
              { type: 'solo' as const, label: '+ Соло' },
            ] as const
          ).map(({ type, label }) => (
            <button
              key={type}
              type="button"
              onClick={() => addQuickBlock(type)}
              className={`min-h-[40px] shrink-0 rounded-lg px-2.5 text-xs font-semibold ${
                darkUi ? 'bg-slate-800 text-slate-100' : 'bg-stone-100 text-stone-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
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

      <div
        className={[
          'fixed inset-x-0 bottom-0 z-50 border-t md:hidden',
          darkUi ? 'border-slate-800 bg-slate-950/95' : 'border-slate-200 bg-white/95',
        ].join(' ')}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2">
          <button
            type="button"
            disabled={!hasUnsavedChanges || saveMut.isPending}
            onClick={() => saveMut.mutate()}
            className={`min-h-[44px] flex-1 rounded-xl text-sm font-semibold ${
              hasUnsavedChanges
                ? darkUi
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-900 text-white'
                : darkUi
                  ? 'bg-slate-800 text-slate-400'
                  : 'bg-stone-200 text-stone-500'
            } disabled:opacity-70`}
          >
            {saveMut.isPending ? 'Сохраняем…' : 'Сохранить песню'}
          </button>
          <button
            type="button"
            onClick={() => setToolsOpen(true)}
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl ${shell.iconBtn}`}
            aria-label="Параметры"
          >
            <LuSlidersHorizontal className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
