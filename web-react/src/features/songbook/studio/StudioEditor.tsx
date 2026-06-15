import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useBeforeUnload, useLocation, useNavigate, useParams } from 'react-router-dom';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import {
  LuArrowLeft,
  LuCircleHelp,
  LuClock3,
  LuHistory,
  LuSlidersHorizontal,
  LuSave,
  LuSparkles,
  LuTrash2,
  LuUpload,
  LuWand,
  LuX,
} from 'react-icons/lu';

import { useAuthStore } from '../../auth/authStore';
import { canDeleteSongFromCatalogSession, canModerateSongCatalogSession } from '../../auth/studioAccess';
import { decodeHtmlEntities } from '../../../lib/decodeHtmlEntities';
import { emitAppToast } from '../../../lib/uiFeedback';
import { useScrollInputIntoView } from '@/hooks/useScrollInputIntoView';
import { SkeletonBox } from '@/components/ui/SkeletonBox';
import { keys } from '@/lib/queryKeys';
import { deleteSong, updateSong } from '../api';
import { convertToChordPro } from '../addSong/chordProConversion';
import { extractChordsFromText, guessKeyFromChords } from '../addSong/keyDetection';
import { SmartImportModal, type SmartImportSourceTab } from '../addSong/SmartImportModal';
import { LyricsWithChords } from '../components/LyricsWithChords';
import { quickChordsForKey } from '../addSong/quickChords';
import { extractCommonChords } from '../chordProEngine';
import { aiChordPlacement, fetchStudioCatalogSong, fetchVersionForSong, saveVersion } from '../../studio/api';
import { studioMySongsPath, getStudioModuleSurface } from '../../studio/studioPaths';
import { PageHeader } from '@/components/layout/PageHeader';
import { sectionHeroStickyClass } from '@/lib/sectionHeroChrome';
import { useSongbookChrome } from '../SongbookChromeContext';

import { BlockWrapper } from './BlockWrapper';
import {
  assertRoundtrip,
  blocksToChordPro,
  chordProToBlocks,
  createSongBlock,
  studioPresetToBlockMeta,
  type SongBlock,
  type SongBlockType,
} from './songBlocks';
import {
  applyChordPattern,
  autoDistributeChords,
  extractChordPattern,
  getSameTypeBlocks,
  hasAnyChordsInBlock,
} from './chordPattern';

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error' | 'offline';

type StudioLocalDraft = {
  content: string;
  key?: string;
  savedAt: number;
  blocks?: SongBlock[];
  updatedAt?: number;
};

type DraftRecoveryOffer = {
  content: string;
  key: string;
  savedAt: number;
};

function studioDraftKey(songId: number): string {
  return `studio:draft:${songId}`;
}

function legacyAutosaveKey(songId: number): string {
  return `studio:autosave:song:${songId}`;
}

function readLocalDraft(songId: number): { content: string; key?: string; savedAt: number } | null {
  for (const storageKey of [studioDraftKey(songId), legacyAutosaveKey(songId)]) {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as StudioLocalDraft;
      if (typeof parsed.content === 'string') {
        return {
          content: parsed.content,
          key: typeof parsed.key === 'string' ? parsed.key : undefined,
          savedAt:
            typeof parsed.savedAt === 'number'
              ? parsed.savedAt
              : typeof parsed.updatedAt === 'number'
                ? parsed.updatedAt
                : Date.now(),
        };
      }
      if (Array.isArray(parsed.blocks) && parsed.blocks.length > 0) {
        const normalized = parsed.blocks.map((b) =>
          createSongBlock(
            ['intro', 'verse', 'prechorus', 'chorus', 'bridge', 'solo', 'outro'].includes(b.type) ? b.type : 'verse',
            typeof b.content === 'string' ? decodeHtmlEntities(b.content) : '',
            typeof b.sectionHint === 'string' && b.sectionHint.trim() ? b.sectionHint.trim() : undefined,
            typeof b.id === 'string' && b.id.length > 0 ? b.id : undefined,
          ),
        );
        if (!studioBlocksHaveBody(normalized)) continue;
        return {
          content: blocksToChordPro(normalized),
          key: typeof parsed.key === 'string' ? parsed.key : undefined,
          savedAt:
            typeof parsed.savedAt === 'number'
              ? parsed.savedAt
              : typeof parsed.updatedAt === 'number'
                ? parsed.updatedAt
                : Date.now(),
        };
      }
    } catch {
      // try next key
    }
  }
  return null;
}

function writeLocalDraft(songId: number, content: string, draftKey: string): void {
  localStorage.setItem(
    studioDraftKey(songId),
    JSON.stringify({ content, key: draftKey, savedAt: Date.now() }),
  );
}

function clearLocalDraft(songId: number): void {
  try {
    localStorage.removeItem(studioDraftKey(songId));
    localStorage.removeItem(legacyAutosaveKey(songId));
  } catch {
    // ignore storage errors
  }
}

/**
 * Текст студии над каталогом: null/undefined — версии ещё нет; пустая строка — намеренно очищено.
 */
function effectiveLyricsSource(studioContent: string | null | undefined, catalogContent: string | undefined): string {
  if (studioContent !== null && studioContent !== undefined) {
    return String(studioContent);
  }
  return catalogContent ?? '';
}

/** Черновик из localStorage не должен перетирать текст с сервера «пустой разметкой» после автосохранения до загрузки песни. */
function studioBlocksHaveBody(blocks: SongBlock[]): boolean {
  return blocks.some((b) => typeof b.content === 'string' && b.content.replace(/\s+/gu, '').length > 0);
}

/** Live preview: без этого у `.lyric-line` не подхватываются стили; в тёмной сцене `var(--text)` тёмный на тёмном фоне. */
function studioPreviewLyricsClassName(darkUi: boolean): string {
  return [
    'break-words',
    darkUi
      ? 'text-slate-100 [&_.lyric-line]:!text-slate-100 [&_.section-label]:!text-slate-200'
      : 'text-stone-900',
  ].join(' ');
}

const KEY_ROOTS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
const CHORD_STRIP = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Am', 'Dm', 'Em', 'G', 'C7'];
const ARCHIVE_TAG = '__archived';
type SongStatus = 'draft' | 'published' | 'archived';
type ChordAutoUndoState = {
  previousBlocks: SongBlock[];
  appliedCount: number;
  expiresAt: number;
};

function detectSongStatus(isPublished: boolean, tags: string[]): SongStatus {
  if (isPublished) return 'published';
  return tags.includes(ARCHIVE_TAG) ? 'archived' : 'draft';
}

function withArchiveTag(tags: string[], status: SongStatus): string[] {
  const clean = tags.filter((t) => t !== ARCHIVE_TAG);
  return status === 'archived' ? [...clean, ARCHIVE_TAG] : clean;
}

function parseKeyForApi(guessLabel: string): string {
  const t = guessLabel.trim();
  if (!t) return '';
  const first = t.split(/\s+/)[0];
  return first ?? t;
}

function studioPreviewFrame(type: SongBlockType, darkUi: boolean): string {
  switch (type) {
    case 'chorus':
      return darkUi
        ? 'rounded-xl border-l-[5px] border-orange-400 bg-orange-950/30 px-3 py-2'
        : 'rounded-xl border-l-[5px] border-orange-500 bg-orange-50 px-3 py-2';
    case 'prechorus':
      return darkUi
        ? 'rounded-xl border-l-[5px] border-amber-300 bg-amber-950/25 px-3 py-2'
        : 'rounded-xl border-l-[5px] border-amber-400 bg-amber-50 px-3 py-2';
    case 'bridge':
      return darkUi
        ? 'rounded-xl border-l-[5px] border-violet-400 bg-violet-950/30 px-3 py-2'
        : 'rounded-xl border-l-[5px] border-violet-500 bg-violet-50 px-3 py-2';
    case 'solo':
      return darkUi
        ? 'rounded-xl border-l-[5px] border-fuchsia-400/80 bg-fuchsia-950/20 px-3 py-2'
        : 'rounded-xl border-l-[5px] border-fuchsia-500 bg-fuchsia-50/70 px-3 py-2';
    case 'outro':
      return darkUi
        ? 'rounded-xl border-l-[5px] border-slate-400 bg-slate-900/70 px-3 py-2'
        : 'rounded-xl border-l-[5px] border-slate-400 bg-slate-50 px-3 py-2';
    case 'intro':
      return darkUi
        ? 'rounded-xl border-l-[5px] border-emerald-400 bg-emerald-950/20 px-3 py-2'
        : 'rounded-xl border-l-[5px] border-emerald-500 bg-emerald-50 px-3 py-2';
    case 'verse':
    default:
      return darkUi
        ? 'rounded-xl border-l-[5px] border-sky-400 bg-sky-950/20 px-3 py-2'
        : 'rounded-xl border-l-[5px] border-sky-500 bg-sky-50/70 px-3 py-2';
  }
}

const STUDIO_BLOCK_PRESETS: ReadonlyArray<{ type: SongBlockType; label: string; icon: string }> = [
  { type: 'verse', label: 'Куплет', icon: '📝' },
  { type: 'chorus', label: 'Припев', icon: '🎤' },
  { type: 'prechorus', label: 'Предприпев', icon: '🔀' },
  { type: 'bridge', label: 'Бридж', icon: '🌉' },
  { type: 'intro', label: 'Intro', icon: '🎸' },
  { type: 'outro', label: 'Outro', icon: '🎭' },
  { type: 'solo', label: 'Соло', icon: '🎼' },
];

function blockTypeLabel(type: SongBlockType): string {
  const preset = STUDIO_BLOCK_PRESETS.find((x) => x.type === type);
  return preset?.label ?? type;
}

function blockDisplayLabel(block: SongBlock, index: number): string {
  if (block.sectionHint?.trim()) return block.sectionHint.trim();
  return `${blockTypeLabel(block.type)} ${index + 1}`;
}

function studioTypeTone(type: SongBlockType, darkUi: boolean, active = false): string {
  const base = (() => {
    switch (type) {
      case 'chorus':
        return darkUi ? 'border-orange-400 bg-orange-950/40 text-orange-100' : 'border-orange-300 bg-orange-50 text-orange-900';
      case 'prechorus':
        return darkUi ? 'border-amber-300 bg-amber-950/30 text-amber-100' : 'border-amber-300 bg-amber-50 text-amber-900';
      case 'bridge':
        return darkUi ? 'border-violet-400 bg-violet-950/35 text-violet-100' : 'border-violet-300 bg-violet-50 text-violet-900';
      case 'intro':
        return darkUi ? 'border-emerald-400 bg-emerald-950/35 text-emerald-100' : 'border-emerald-300 bg-emerald-50 text-emerald-900';
      case 'outro':
        return darkUi ? 'border-slate-500 bg-slate-900 text-slate-100' : 'border-slate-300 bg-slate-50 text-slate-800';
      case 'solo':
        return darkUi ? 'border-fuchsia-400 bg-fuchsia-950/30 text-fuchsia-100' : 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-900';
      case 'verse':
      default:
        return darkUi ? 'border-sky-400 bg-sky-950/35 text-sky-100' : 'border-sky-300 bg-sky-50 text-sky-900';
    }
  })();
  return active ? `${base} ring-2 ring-primary/45` : base;
}

/**
 * Редактор студийной версии: основной экран — текст; тональность и справка по BPM — в шторке.
 */
export function StudioEditor() {
  useScrollInputIntoView();
  const { songId } = useParams<{ songId: string }>();
  const id = Number(songId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const surface = getStudioModuleSurface(location.pathname);
  /** Чтобы после гидрации сессии запрос повторился с тем же cookie/Bearer и не оставался 404 для черновиков. */
  const authEpoch = useAuthStore((s) => `${s.memberId ?? ''}:${s.role}`);
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles ?? [s.role]);
  const canDeleteCatalog = canDeleteSongFromCatalogSession(role, roles);
  const canEditCatalogMeta = canModerateSongCatalogSession(role, roles);
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
  const [mobilePane, setMobilePane] = useState<'editor' | 'preview'>('editor');
  const [autoChordModalOpen, setAutoChordModalOpen] = useState(false);
  const [autoChordDonorId, setAutoChordDonorId] = useState<string>('');
  const [autoChordTargetIds, setAutoChordTargetIds] = useState<string[]>([]);
  const [chordAutoUndo, setChordAutoUndo] = useState<ChordAutoUndoState | null>(null);
  const [undoNow, setUndoNow] = useState(() => Date.now());

  const songQ = useQuery({
    queryKey: ['song', id, authEpoch],
    queryFn: () => fetchStudioCatalogSong(id),
    enabled: Number.isInteger(id) && id > 0,
  });

  const verQ = useQuery({
    queryKey: ['studio', 'version', id, authEpoch],
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
  const [keyHint, setKeyHint] = useState<string | null>(null);
  const [catalogTempo, setCatalogTempo] = useState('');
  const [catalogTimeSignature, setCatalogTimeSignature] = useState('');
  const [catalogTags, setCatalogTags] = useState('');
  const [songStatus, setSongStatus] = useState<SongStatus>('published');
  const [quickRoot, setQuickRoot] = useState('G');
  const [quickMode, setQuickMode] = useState<'major' | 'minor'>('major');
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [draftRecovery, setDraftRecovery] = useState<DraftRecoveryOffer | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' && navigator.onLine,
  );
  const autosaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSavedSnapshotRef = useRef('');
  const hydratedForSongIdRef = useRef<number | null>(null);
  const blocksRef = useRef(blocks);
  const keyRef = useRef(key);
  const blockCardRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  blocksRef.current = blocks;
  keyRef.current = key;

  useEffect(() => {
    hydratedForSongIdRef.current = null;
    setDraftRecovery(null);
    setSaveError(false);
    setLastSavedAt(null);
  }, [id]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    const s = songQ.data;
    const v = verQ.data as { custom_content?: string | null; custom_key?: string | null; updated_at?: string } | null;
    if (!Number.isInteger(id) || id <= 0) return;
    if (!songQ.isFetched || !verQ.isFetched) return;
    if (!s || Number(s.id) !== id) return;
    if (hydratedForSongIdRef.current === id) return;

    hydratedForSongIdRef.current = id;

    const fromChordText = (t: string) => chordProToBlocks(decodeHtmlEntities(t));

    const serverChordSource = effectiveLyricsSource(v?.custom_content, s.content);
    const serverBlocks = fromChordText(serverChordSource);
    setBlocks(serverBlocks);

    const draft = readLocalDraft(id);
    const serverUpdatedAt = v?.updated_at ? new Date(v.updated_at).getTime() : 0;
    if (draft && draft.content.trim().length > 0 && draft.savedAt > serverUpdatedAt) {
      setDraftRecovery({
        content: draft.content,
        key: draft.key ?? '',
        savedAt: draft.savedAt,
      });
    } else if (draft) {
      clearLocalDraft(id);
      setDraftRecovery(null);
    }

    const resolvedKey = v?.custom_key ?? s.default_key ?? '';
    setKey(resolvedKey);
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
    const baselineChordPro = blocksToChordPro(chordProToBlocks(decodeHtmlEntities(serverChordSource)));
    const catalogSnapshot = JSON.stringify({
      tempo: s.tempo == null ? '' : String(s.tempo),
      timeSignature: s.time_signature ?? '',
      tags: initialTags.filter((t) => t !== ARCHIVE_TAG).join(', '),
      songStatus: detectSongStatus(Boolean(s.is_published), initialTags),
    });
    lastSavedSnapshotRef.current = JSON.stringify({
      content: baselineChordPro,
      key: resolvedKey,
      catalog: catalogSnapshot,
    });
    setSaveError(false);
  }, [id, songQ.isFetched, verQ.isFetched, songQ.data, verQ.data]);

  useEffect(() => {
    if (!Number.isInteger(id) || id <= 0) return;
    if (autosaveIntervalRef.current) clearInterval(autosaveIntervalRef.current);
    autosaveIntervalRef.current = setInterval(() => {
      try {
        const content = blocksToChordPro(blocksRef.current);
        writeLocalDraft(id, content, keyRef.current);
        setDraftSavedAt(Date.now());
      } catch {
        // ignore storage quota/availability errors
      }
    }, 30000);

    return () => {
      if (autosaveIntervalRef.current) clearInterval(autosaveIntervalRef.current);
      try {
        const content = blocksToChordPro(blocksRef.current);
        writeLocalDraft(id, content, keyRef.current);
      } catch {
        // ignore
      }
    };
  }, [id]);

  useEffect(
    () => () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!chordAutoUndo) return;
    const timer = setInterval(() => setUndoNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [chordAutoUndo]);

  const persistCatalogMeta = useCallback(async () => {
    if (!canEditCatalogMeta) return;
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
  }, [canEditCatalogMeta, catalogTempo, catalogTimeSignature, catalogTags, songStatus, id]);

  const buildCatalogMetaSnapshot = useCallback(
    () =>
      JSON.stringify({
        tempo: catalogTempo.trim(),
        timeSignature: catalogTimeSignature.trim(),
        tags: catalogTags.trim(),
        songStatus,
      }),
    [catalogTempo, catalogTimeSignature, catalogTags, songStatus],
  );

  const catalogMetaChanged = useCallback(() => {
    try {
      const saved = JSON.parse(lastSavedSnapshotRef.current) as { catalog?: string };
      return buildCatalogMetaSnapshot() !== saved.catalog;
    } catch {
      return true;
    }
  }, [buildCatalogMetaSnapshot]);

  const saveAll = useCallback(async () => {
    const content = blocksToChordPro(blocks);
    try {
      writeLocalDraft(id, content, key);
    } catch {
      // local backup best-effort
    }

    setIsSaving(true);
    setSaveError(false);
    try {
      const savedVersion = await saveVersion(id, { custom_content: content, custom_key: key || null });

      if (canEditCatalogMeta && catalogMetaChanged()) {
        await persistCatalogMeta();
      }

      clearLocalDraft(id);
      setDraftRecovery(null);
      setDraftSavedAt(null);

      qc.setQueryData(['studio', 'version', id, authEpoch], savedVersion);
      void qc.invalidateQueries({ queryKey: ['studio', 'versions'] });
      void qc.invalidateQueries({ queryKey: ['songs'] });
      void qc.invalidateQueries({ queryKey: ['song', id] });
      void qc.invalidateQueries({ queryKey: ['studio', 'imported-songs'] });

      lastSavedSnapshotRef.current = JSON.stringify({
        content,
        key,
        catalog: buildCatalogMetaSnapshot(),
      });
      setLastSavedAt(Date.now());
      setSaveError(false);
      emitAppToast({ kind: 'success', message: 'Песня сохранена ✓' });
    } catch (err: unknown) {
      setSaveError(true);
      const msg = err instanceof Error && err.message ? err.message : 'Не удалось сохранить песню';
      emitAppToast({ kind: 'error', message: msg });
    } finally {
      setIsSaving(false);
    }
  }, [
    authEpoch,
    blocks,
    buildCatalogMetaSnapshot,
    canEditCatalogMeta,
    catalogMetaChanged,
    id,
    key,
    persistCatalogMeta,
    qc,
  ]);

  const aiChordPlacementMut = useMutation({
    mutationFn: (content: string) => aiChordPlacement(content),
    onSuccess: (result) => {
      const nextBlocks = chordProToBlocks(result.content);
      const nextChordPro = blocksToChordPro(nextBlocks);
      const prevChordPro = blocksToChordPro(blocks);
      if (nextChordPro === prevChordPro || result.changedLines === 0) {
        runLocalAutoFallback('AI не предложил изменений аккордов для этого текста');
        return;
      }
      setBlocks(nextBlocks);
      emitAppToast({
        kind: 'success',
        message: `AI расставил аккорды: обновлено строк ${result.changedLines}, всего аккордов ${result.totalChords}`,
      });
    },
    onError: (err: unknown) => {
      const apiMsg = axios.isAxiosError(err) ? (err.response?.data as { error?: string } | undefined)?.error : undefined;
      const msg = apiMsg || (err instanceof Error && err.message ? err.message : 'AI не смог расставить аккорды');
      runLocalAutoFallback(msg);
    },
  });

  const deleteCatalogMut = useMutation({
    mutationFn: () => deleteSong(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['songs'] });
      void qc.invalidateQueries({ queryKey: keys.songs });
      void qc.invalidateQueries({ queryKey: ['studio', 'versions'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'setlists'] });
      emitAppToast({ kind: 'success', message: 'Песня удалена из каталога' });
      navigate(studioMySongsPath(surface));
    },
    onError: () => emitAppToast('Не удалось удалить песню'),
  });

  const saveCatalogMetaMut = useMutation({
    mutationFn: () => persistCatalogMeta(),
    onSuccess: () => {
      try {
        const saved = JSON.parse(lastSavedSnapshotRef.current) as {
          content?: string;
          key?: string;
        };
        lastSavedSnapshotRef.current = JSON.stringify({
          content: saved.content ?? blocksToChordPro(blocks),
          key: saved.key ?? key,
          catalog: buildCatalogMetaSnapshot(),
        });
      } catch {
        lastSavedSnapshotRef.current = JSON.stringify({
          content: blocksToChordPro(blocks),
          key,
          catalog: buildCatalogMetaSnapshot(),
        });
      }
      void qc.invalidateQueries({ queryKey: ['song', id] });
      void qc.invalidateQueries({ queryKey: ['songs'] });
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

  const insertBlockAfter = (index: number, type: SongBlockType = 'verse') => {
    const nb = createSongBlock(type, '');
    setBlocks((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, nb);
      return next;
    });
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

  const addCustomBlock = () => {
    const raw = window.prompt('Название блока', '');
    if (raw == null) return;
    const normalized = raw.trim();
    if (!normalized) return;
    addBlockFromPreset(normalized);
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
    setBlocks(chordProToBlocks(decodeHtmlEntities(chordPro)));
    const source = chordPro || raw;
    const chords = extractChordsFromText(source);
    const guess = chords.length > 0 ? guessKeyFromChords(chords) : null;
    if (!guess) return;
    const detected = parseKeyForApi(guess.label);
    if (detected) setKey(detected);
    setKeyHint(`Авто: ${guess.label} (${guess.confidence})`);
  };

  const runAiChordPlacement = () => {
    const source = blocksToChordPro(blocks);
    if (!source.trim()) {
      emitAppToast('Добавьте текст песни перед AI-разбором');
      return;
    }
    if (
      !window.confirm(
        'AI проанализирует весь текст и переставит только аккорды (слова и структура строк останутся без изменений). Продолжить?',
      )
    ) {
      return;
    }
    aiChordPlacementMut.mutate(source);
  };

  const detectSongKey = () => {
    const chords = extractChordsFromText(joinedChordPro);
    if (chords.length === 0) {
      setKeyHint('Не удалось найти аккорды для определения тональности.');
      emitAppToast('Не найдены аккорды для автоопределения тональности');
      return;
    }
    const guess = guessKeyFromChords(chords);
    if (!guess) {
      setKeyHint('Не удалось определить тональность автоматически.');
      emitAppToast('Не удалось определить тональность');
      return;
    }
    const detected = parseKeyForApi(guess.label);
    if (detected) setKey(detected);
    setKeyHint(`${guess.label} (${guess.confidence})`);
    emitAppToast({ kind: 'success', message: `Тональность определена: ${guess.label}` });
  };

  const openAutoChordModal = () => {
    const withChords = blocks.filter((block) => hasAnyChordsInBlock(block));
    if (withChords.length === 0) {
      emitAppToast('Сначала расставьте аккорды хотя бы в одном блоке');
      return;
    }
    const preferredDonor = withChords.find((block) => block.type === 'verse') ?? withChords[0];
    if (!preferredDonor) return;
    const sameTypeIds = getSameTypeBlocks(blocks, preferredDonor).map((block) => block.id);
    setAutoChordDonorId(preferredDonor.id);
    setAutoChordTargetIds(sameTypeIds);
    setAutoChordModalOpen(true);
  };

  const runAutoChordPlacementForAll = () => {
    const donor = blocks.find((block) => hasAnyChordsInBlock(block));
    if (!donor) {
      emitAppToast('Нужен хотя бы один блок с аккордами (донор паттерна)');
      return;
    }
    const targetIds = blocks.filter((block) => block.id !== donor.id).map((block) => block.id);
    if (targetIds.length === 0) {
      emitAppToast('Нет блоков для автоподстановки');
      return;
    }
    const nextBlocks = autoDistributeChords(blocks, donor.id, targetIds);
    const changedCount = nextBlocks.reduce((acc, block, idx) => {
      return acc + (block.content !== (blocks[idx]?.content ?? '') ? 1 : 0);
    }, 0);
    if (changedCount === 0) {
      emitAppToast('Автоподстановка не изменила блоки (проверьте донор)');
      return;
    }
    const previousBlocks = blocks;
    setBlocks(nextBlocks);
    emitAppToast({ kind: 'success', message: `Автоподстановка применена: изменено ${changedCount} блоков ✓` });
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    const expiresAt = Date.now() + 10000;
    setChordAutoUndo({ previousBlocks, appliedCount: changedCount, expiresAt });
    setUndoNow(Date.now());
    undoTimeoutRef.current = setTimeout(() => {
      setChordAutoUndo(null);
      undoTimeoutRef.current = null;
    }, 10000);
  };

  const runLocalAutoFallback = (reason: string) => {
    const donor = blocks.find((block) => hasAnyChordsInBlock(block));
    if (!donor) {
      emitAppToast(reason);
      return;
    }
    const targetIds = blocks.filter((block) => block.id !== donor.id).map((block) => block.id);
    if (targetIds.length === 0) {
      emitAppToast(reason);
      return;
    }
    const fallback = autoDistributeChords(blocks, donor.id, targetIds);
    const changedCount = fallback.reduce((acc, block, idx) => acc + (block.content !== (blocks[idx]?.content ?? '') ? 1 : 0), 0);
    if (changedCount === 0) {
      emitAppToast(reason);
      return;
    }
    const previousBlocks = blocks;
    setBlocks(fallback);
    emitAppToast({ kind: 'success', message: `Применён резервный автопаттерн: изменено ${changedCount} блоков ✓` });
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    const expiresAt = Date.now() + 10000;
    setChordAutoUndo({ previousBlocks, appliedCount: changedCount, expiresAt });
    setUndoNow(Date.now());
    undoTimeoutRef.current = setTimeout(() => {
      setChordAutoUndo(null);
      undoTimeoutRef.current = null;
    }, 10000);
  };

  const handleAutoChordDonorChange = (donorId: string) => {
    setAutoChordDonorId(donorId);
    const donor = blocks.find((block) => block.id === donorId);
    if (!donor) {
      setAutoChordTargetIds([]);
      return;
    }
    const sameTypeIds = getSameTypeBlocks(blocks, donor).map((block) => block.id);
    setAutoChordTargetIds(sameTypeIds);
  };

  const toggleAutoChordTarget = (targetId: string) => {
    setAutoChordTargetIds((prev) =>
      prev.includes(targetId) ? prev.filter((idItem) => idItem !== targetId) : [...prev, targetId],
    );
  };

  const applyAutoChordPattern = () => {
    const donor = blocks.find((block) => block.id === autoChordDonorId);
    if (!donor) {
      emitAppToast('Источник паттерна не найден');
      return;
    }
    const targetIds = autoChordTargetIds.filter((idItem) => idItem !== donor.id);
    if (targetIds.length === 0) {
      emitAppToast('Выберите хотя бы один целевой блок');
      return;
    }

    const previousBlocks = blocks;
    const pattern = extractChordPattern(donor);
    if (pattern.length === 0) {
      emitAppToast('В источнике нет строк для паттерна');
      return;
    }
    const nextBlocks = autoDistributeChords(blocks, donor.id, targetIds);

    setBlocks(nextBlocks);
    setAutoChordModalOpen(false);
    emitAppToast({ kind: 'success', message: `Аккорды расставлены в ${targetIds.length} блоках ✓` });

    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    const expiresAt = Date.now() + 10000;
    setChordAutoUndo({ previousBlocks, appliedCount: targetIds.length, expiresAt });
    setUndoNow(Date.now());
    undoTimeoutRef.current = setTimeout(() => {
      setChordAutoUndo(null);
      undoTimeoutRef.current = null;
    }, 10000);
  };

  const undoAutoChordPattern = () => {
    if (!chordAutoUndo) return;
    setBlocks(chordAutoUndo.previousBlocks);
    setChordAutoUndo(null);
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
    emitAppToast({ kind: 'success', message: 'Авторасстановка отменена' });
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
        catalog: buildCatalogMetaSnapshot(),
      }),
    [joinedChordPro, key, buildCatalogMetaSnapshot],
  );
  const hasUnsavedChanges = currentSnapshot !== lastSavedSnapshotRef.current;
  const saveStatus: SaveStatus = useMemo(() => {
    if (!isOnline) return 'offline';
    if (isSaving) return 'saving';
    if (saveError) return 'error';
    if (hasUnsavedChanges) return 'unsaved';
    return 'saved';
  }, [isOnline, isSaving, saveError, hasUnsavedChanges]);

  useEffect(() => {
    assertRoundtrip(joinedChordPro);
  }, [joinedChordPro]);

  const formatSaveStatusTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const restoreDraftRecovery = () => {
    if (!draftRecovery) return;
    setBlocks(chordProToBlocks(decodeHtmlEntities(draftRecovery.content)));
    if (draftRecovery.key) setKey(draftRecovery.key);
    setDraftRecovery(null);
  };

  const dismissDraftRecovery = () => {
    clearLocalDraft(id);
    setDraftRecovery(null);
  };
  const backTo = studioMySongsPath(surface);
  const showEditorPane = mobilePane === 'editor';
  const showPreviewPane = showPreview && mobilePane === 'preview';
  const presentTypes = useMemo(() => new Set(blocks.map((b) => b.type)), [blocks]);
  const activeBlock = useMemo(
    () => blocks.find((block) => block.id === activeBlockId) ?? blocks[0] ?? null,
    [blocks, activeBlockId],
  );
  const autoChordDonor = useMemo(
    () => blocks.find((block) => block.id === autoChordDonorId) ?? null,
    [blocks, autoChordDonorId],
  );
  const autoChordPattern = useMemo(
    () => (autoChordDonor ? extractChordPattern(autoChordDonor) : []),
    [autoChordDonor],
  );
  const autoChordTargets = useMemo(
    () => blocks.filter((block) => block.id !== autoChordDonorId),
    [blocks, autoChordDonorId],
  );
  const selectedAutoChordTargets = useMemo(
    () => autoChordTargets.filter((block) => autoChordTargetIds.includes(block.id)),
    [autoChordTargets, autoChordTargetIds],
  );
  const selectedOtherTypeCount = useMemo(() => {
    if (!autoChordDonor) return 0;
    return selectedAutoChordTargets.filter((block) => block.type !== autoChordDonor.type).length;
  }, [selectedAutoChordTargets, autoChordDonor]);
  const selectedTargetsWithChordsCount = useMemo(
    () => selectedAutoChordTargets.filter((block) => hasAnyChordsInBlock(block)).length,
    [selectedAutoChordTargets],
  );
  const autoChordPreview = useMemo(
    () =>
      selectedAutoChordTargets.slice(0, 3).map((target) => {
        const applied = applyChordPattern(target, autoChordPattern);
        const beforeFirst = target.content.split('\n').find((line) => line.trim().length > 0) ?? '';
        const afterFirst = applied.content.split('\n').find((line) => line.trim().length > 0) ?? '';
        return {
          targetId: target.id,
          beforeFirst,
          afterFirst,
        };
      }),
    [selectedAutoChordTargets, autoChordPattern],
  );
  const undoSecondsLeft = chordAutoUndo ? Math.max(0, Math.ceil((chordAutoUndo.expiresAt - undoNow) / 1000)) : 0;

  /** Тёмный интерфейс только в режиме сцены внутри песенника; обычный режим — светлый. */
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
        if (saveStatus !== 'unsaved' && saveStatus !== 'error') return;
        event.preventDefault();
      },
      [saveStatus],
    ),
  );

  useEffect(() => {
    if (showPreview) return;
    if (mobilePane === 'preview') setMobilePane('editor');
  }, [showPreview, mobilePane]);

  useEffect(() => {
    if (!autoChordModalOpen) return;
    setAutoChordTargetIds((prev) => prev.filter((targetId) => blocks.some((block) => block.id === targetId)));
    if (autoChordDonorId && blocks.some((block) => block.id === autoChordDonorId)) return;
    const fallback = blocks.find((block) => hasAnyChordsInBlock(block));
    if (!fallback) return;
    setAutoChordDonorId(fallback.id);
  }, [autoChordModalOpen, autoChordDonorId, blocks]);

  const confirmLeaveIfDirty = () => {
    if (saveStatus !== 'unsaved' && saveStatus !== 'error') return true;
    return window.confirm('Есть несохранённые изменения. Выйти без сохранения?');
  };

  if (!Number.isInteger(id) || id <= 0) {
    return <p className="text-red-600">Некорректный id песни</p>;
  }
  if (songQ.isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-3 px-3 py-4">
        <SkeletonBox width="34%" height="16px" />
        <SkeletonBox width="100%" height="46px" radius="12px" />
        <SkeletonBox width="100%" height="46px" radius="12px" />
        <SkeletonBox width="100%" height="220px" radius="14px" />
      </div>
    );
  }
  if (songQ.isError || !songQ.data) {
    return <p className="text-red-600">Песня не найдена</p>;
  }

  const s = songQ.data;

  return (
    <>
      <div className={sectionHeroStickyClass}>
        <PageHeader title={s.title} />
      </div>
      <div
        className={`mx-auto flex w-full max-w-[1520px] flex-col gap-4 px-2 sm:px-3 md:px-4 max-lg:pb-[5.75rem] ${shell.page}`}
      >
      <SmartImportModal
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          setImportInitialTab('text');
        }}
        onMassImportDone={() => {
          void navigate(`${studioMySongsPath(surface)}?tab=imported`);
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
            className={`fixed left-1/2 top-1/2 z-[101] w-[min(calc(100vw-1.5rem),400px)] max-h-[85dvh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-2xl p-5 md:inset-auto md:left-auto md:right-6 md:top-20 md:h-auto md:max-h-[min(90dvh,calc(100dvh-5rem))] md:w-[min(400px,calc(100vw-3rem))] md:translate-x-0 md:translate-y-0 ${shell.drawer}`}
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
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={detectSongKey}
                    className={`inline-flex min-h-[38px] items-center gap-2 rounded-lg border px-3 text-xs font-semibold ${
                      darkUi
                        ? 'border-violet-500/70 bg-violet-950/30 text-violet-100 hover:bg-violet-950/45'
                        : 'border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100'
                    }`}
                  >
                    <LuSparkles className="h-3.5 w-3.5" />
                    Автоопределить
                  </button>
                  {keyHint ? <span className={`text-xs ${shell.muted}`}>{keyHint}</span> : null}
                </div>
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
                    Изменять BPM/размер/теги могут музыканты, редакторы и администраторы.
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

      {autoChordModalOpen ? (
        <>
          <button
            type="button"
            className={[
              'fixed inset-0 z-[104] backdrop-blur-[2px]',
              darkUi ? 'bg-slate-950/45' : 'bg-stone-900/30',
            ].join(' ')}
            aria-label="Закрыть авторасстановку"
            onClick={() => setAutoChordModalOpen(false)}
          />
          <div
            className={`fixed left-1/2 top-1/2 z-[105] w-[min(calc(100vw-1.5rem),720px)] max-h-[85dvh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-2xl p-5 md:inset-auto md:left-auto md:right-6 md:top-16 md:h-auto md:max-h-[min(90dvh,calc(100dvh-4rem))] md:w-[min(720px,calc(100vw-3rem))] md:translate-x-0 md:translate-y-0 ${shell.drawer}`}
            role="dialog"
            aria-labelledby="auto-chords-title"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="auto-chords-title" className="text-base font-semibold">
                  🎸 Авторасстановка аккордов
                </h2>
                <p className={`mt-1 text-xs ${shell.muted}`}>
                  Копирует паттерн аккордов из донора и применяет к выбранным блокам.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAutoChordModalOpen(false)}
                className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center ${shell.iconBtn}`}
                aria-label="Закрыть"
              >
                <LuX className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <p className={`text-xs font-semibold uppercase tracking-wide ${shell.muted}`}>Источник паттерна</p>
                <select
                  value={autoChordDonorId}
                  onChange={(e) => handleAutoChordDonorChange(e.target.value)}
                  className={`w-full min-h-[44px] rounded-xl px-3 py-2.5 text-sm outline-none ${shell.field}`}
                >
                  {blocks
                    .map((block, index) => ({ block, index }))
                    .filter(({ block }) => hasAnyChordsInBlock(block))
                    .map(({ block, index }) => (
                      <option key={`donor-${block.id}`} value={block.id}>
                        {blockDisplayLabel(block, index)}
                      </option>
                    ))}
                </select>
              </div>

              <div className="space-y-2">
                <p className={`text-xs font-semibold uppercase tracking-wide ${shell.muted}`}>Применить к</p>
                <div className={`max-h-[220px] space-y-2 overflow-y-auto rounded-xl border p-3 ${darkUi ? 'border-slate-700' : 'border-stone-200'}`}>
                  {autoChordTargets.map((target) => {
                    const idx = blocks.findIndex((b) => b.id === target.id);
                    const checked = autoChordTargetIds.includes(target.id);
                    const differentType = autoChordDonor ? target.type !== autoChordDonor.type : false;
                    const hasChords = hasAnyChordsInBlock(target);
                    return (
                      <label key={`target-${target.id}`} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAutoChordTarget(target.id)}
                          className="mt-[2px]"
                        />
                        <span className="min-w-0">
                          <span className="font-medium">{blockDisplayLabel(target, idx)}</span>
                          {differentType ? <span className="ml-2 text-amber-500">⚠️ другой тип</span> : null}
                          {hasChords ? <span className="ml-2 text-amber-500">заменит аккорды</span> : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {selectedTargetsWithChordsCount > 0 ? (
                <p className={`rounded-lg px-3 py-2 text-xs ${darkUi ? 'bg-amber-950/35 text-amber-100' : 'bg-amber-50 text-amber-900'}`}>
                  ⚠️ Существующие аккорды будут заменены в {selectedTargetsWithChordsCount} блоках.
                </p>
              ) : null}

              {selectedOtherTypeCount > 0 ? (
                <p className={`rounded-lg px-3 py-2 text-xs ${darkUi ? 'bg-orange-950/35 text-orange-100' : 'bg-orange-50 text-orange-900'}`}>
                  ⚠️ Выбраны блоки другого типа: {selectedOtherTypeCount}. Проверьте превью перед применением.
                </p>
              ) : null}

              <div className={`rounded-xl border p-3 ${darkUi ? 'border-slate-700 bg-slate-950/40' : 'border-stone-200 bg-stone-50'}`}>
                <p className={`mb-2 text-xs font-semibold uppercase tracking-wide ${shell.muted}`}>Превью</p>
                {autoChordPreview.length === 0 ? (
                  <p className={`text-xs ${shell.muted}`}>Выберите целевые блоки для предпросмотра.</p>
                ) : (
                  <div className="space-y-2">
                    {autoChordPreview.map((item) => (
                      <div key={`preview-${item.targetId}`} className={`rounded-lg border p-2 ${darkUi ? 'border-slate-700' : 'border-stone-200'}`}>
                        <p className={`mb-1 text-[11px] font-semibold ${shell.muted}`}>До</p>
                        <pre className="m-0 whitespace-pre-wrap break-words text-xs">{item.beforeFirst || '—'}</pre>
                        <p className={`mb-1 mt-2 text-[11px] font-semibold ${shell.muted}`}>После</p>
                        <pre className="m-0 whitespace-pre-wrap break-words text-xs">{item.afterFirst || '—'}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAutoChordModalOpen(false)}
                  className={`min-h-[42px] rounded-lg px-4 text-sm font-semibold ${shell.iconBtn}`}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={applyAutoChordPattern}
                  disabled={autoChordTargetIds.length === 0}
                  className={`min-h-[42px] rounded-lg px-4 text-sm font-semibold ${
                    darkUi
                      ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  } disabled:opacity-50`}
                >
                  Применить к выбранным
                </button>
              </div>
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
        <button
          type="button"
          onClick={runAiChordPlacement}
          disabled={aiChordPlacementMut.isPending}
          className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold disabled:opacity-60 ${
            darkUi
              ? 'border-violet-500/60 bg-violet-950/30 text-violet-100 hover:bg-violet-950/45'
              : 'border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100'
          }`}
          aria-label="AI-разбор аккордов"
        >
          <LuWand className="h-4 w-4" />
          <span>{aiChordPlacementMut.isPending ? 'AI…' : 'AI-разбор'}</span>
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
          onClick={() => void saveAll()}
          disabled={isSaving}
          className={`${shell.primary} disabled:opacity-50`}
        >
          Сохранить песню
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {saveStatus === 'saved' ? (
          <span className={`inline-flex items-center gap-1.5 ${shell.muted}`}>
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            Сохранено{lastSavedAt ? ` ${formatSaveStatusTime(lastSavedAt)}` : ''}
          </span>
        ) : null}
        {saveStatus === 'unsaved' ? (
          <span className="inline-flex items-center gap-1.5 text-amber-600">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden />
            Не сохранено
          </span>
        ) : null}
        {saveStatus === 'saving' ? (
          <span className={`inline-flex items-center gap-1.5 ${shell.muted}`}>
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-slate-400" aria-hidden />
            Сохранение…
          </span>
        ) : null}
        {saveStatus === 'error' ? (
          <span className="inline-flex items-center gap-2 text-red-600">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" aria-hidden />
            Ошибка
            <button
              type="button"
              onClick={() => void saveAll()}
              className="font-semibold underline underline-offset-2"
            >
              Повторить
            </button>
          </span>
        ) : null}
        {saveStatus === 'offline' ? (
          <span className="inline-flex items-center gap-1.5 text-amber-700">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden />
            Нет соединения · правки сохранены локально
          </span>
        ) : null}
      </div>

      <p className={`text-xs ${shell.muted}`}>
        Ваш текст ниже — оригинал в каталоге не меняется, пока вы не сохраните и не удалите песню целиком.
      </p>

      {draftRecovery ? (
        <div
          className={`rounded-xl border p-3 text-sm ${
            darkUi ? 'border-amber-800/70 bg-amber-950/30 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-950'
          }`}
          role="status"
        >
          <p>
            Найден несохранённый черновик от {formatSaveStatusTime(draftRecovery.savedAt)}. Восстановить?
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={restoreDraftRecovery}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                darkUi ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-amber-700 text-white hover:bg-amber-800'
              }`}
            >
              Восстановить
            </button>
            <button
              type="button"
              onClick={dismissDraftRecovery}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                darkUi ? 'border-amber-700 text-amber-100 hover:bg-amber-950/50' : 'border-amber-300 text-amber-900 hover:bg-amber-100'
              }`}
            >
              Удалить
            </button>
          </div>
        </div>
      ) : null}

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

      <section
        className={`rounded-2xl border px-4 py-4 sm:px-6 ${
          darkUi ? 'border-slate-800 bg-slate-950/50' : 'border-stone-200 bg-white'
        }`}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className={`text-sm font-semibold uppercase tracking-[0.05em] ${shell.muted}`}>+ Добавить блок</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={runAutoChordPlacementForAll}
              className={`inline-flex min-h-[40px] items-center gap-1 rounded-lg border px-3 text-sm font-semibold ${
                darkUi
                  ? 'border-amber-500/70 bg-amber-950/30 text-amber-100 hover:bg-amber-950/50'
                  : 'border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100'
              }`}
            >
              <LuSparkles className="h-4 w-4" />
              🎸 Автоподстановка
            </button>
            <button
              type="button"
              onClick={openAutoChordModal}
              className={`inline-flex min-h-[40px] items-center gap-1 rounded-lg border px-3 text-sm font-semibold ${
                darkUi ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800' : 'border-stone-200 bg-white text-stone-800 hover:bg-stone-50'
              }`}
            >
              Точный выбор
            </button>
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
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {STUDIO_BLOCK_PRESETS.map(({ type, label, icon }) => (
            <button
              key={`toolbar-block-${type}`}
              type="button"
              onClick={() => addQuickBlock(type)}
              className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-transform duration-200 hover:-translate-y-[1px] ${studioTypeTone(type, darkUi)} ${presentTypes.has(type) ? 'opacity-70' : ''}`}
            >
              <span aria-hidden>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={addCustomBlock}
            className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-dashed px-3 text-sm font-semibold transition-transform duration-200 hover:-translate-y-[1px] ${
              darkUi ? 'border-slate-600 bg-slate-900 text-slate-200 hover:bg-slate-800' : 'border-stone-300 bg-stone-50 text-stone-800 hover:bg-stone-100'
            }`}
          >
            <span aria-hidden>➕</span>
            <span>Свой</span>
          </button>
        </div>
        {chordPickerOpen ? (
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
            {(toolbarChords.length > 0 ? toolbarChords : CHORD_STRIP).map((ch) => (
              <button
                key={`picker-${ch}`}
                type="button"
                onClick={() => insertChord(ch)}
                className={`min-h-[36px] shrink-0 rounded-lg px-2.5 ${shell.chordBtn}`}
              >
                {ch}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <div className="mb-1 flex items-center justify-between">
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

      <section
        className={`rounded-2xl border p-3 xl:hidden ${
          darkUi ? 'border-slate-800 bg-slate-950/35' : 'border-stone-200 bg-white'
        }`}
      >
        <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
          {blocks.map((block, idx) => {
            const preset = STUDIO_BLOCK_PRESETS.find((x) => x.type === block.type);
            return (
              <div key={`mini-outline-${block.id}`} className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveBlockId(block.id);
                    setMobilePane('editor');
                    blockCardRef.current.get(block.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${studioTypeTone(block.type, darkUi, activeBlockId === block.id)}`}
                >
                  <span aria-hidden>{preset?.icon ?? '🎵'}</span>
                  <span>{block.sectionHint || blockTypeLabel(block.type)}</span>
                </button>
                {idx < blocks.length - 1 ? <span className={shell.muted}>→</span> : null}
              </div>
            );
          })}
        </div>
      </section>

      <div className={['grid gap-4', showPreview ? 'xl:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]' : ''].join(' ')}>
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="studio-blocks">
            {(dropProvided) => (
              <div
                ref={dropProvided.innerRef}
                {...dropProvided.droppableProps}
                className={`flex flex-col gap-4 ${showEditorPane ? '' : 'hidden md:flex'}`}
              >
                {blocks.map((b, i) => (
                  <Draggable key={b.id} draggableId={b.id} index={i}>
                    {(dragProvided, dragSnapshot) => (
                      <div
                        ref={(el) => {
                          dragProvided.innerRef(el);
                          if (el) blockCardRef.current.set(b.id, el);
                          else blockCardRef.current.delete(b.id);
                        }}
                        {...dragProvided.draggableProps}
                        className={dragSnapshot.isDragging ? 'group rounded-2xl shadow-2xl' : 'group studio-block-enter'}
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
                        <div className="mt-2 hidden justify-center md:flex">
                          <button
                            type="button"
                            onClick={() => insertBlockAfter(i, 'verse')}
                            className={`rounded-full border border-dashed px-3 py-1 text-xs font-semibold opacity-0 transition group-hover:opacity-100 ${
                              darkUi
                                ? 'border-slate-600 bg-slate-900/80 text-slate-300 hover:bg-slate-800'
                                : 'border-stone-300 bg-white text-stone-600 hover:bg-stone-50'
                            }`}
                          >
                            + Добавить блок здесь
                          </button>
                        </div>
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
          <aside
            className={[
              'hidden rounded-2xl border p-4 xl:sticky xl:top-24 xl:flex xl:max-h-[calc(100dvh-8rem)] xl:flex-col xl:overflow-y-auto',
              darkUi ? 'border-slate-800 bg-slate-950/60' : 'border-stone-200 bg-white',
            ].join(' ')}
          >
            <p className={`mb-3 shrink-0 text-xs font-semibold uppercase tracking-[0.05em] ${shell.muted}`}>
              Live preview · {activeBlock ? blockTypeLabel(activeBlock.type) : '—'}
            </p>
            <div className="space-y-3">
              {blocks.map((b) => (
                <div
                  key={`pv-desktop-${b.id}`}
                  className={`${studioPreviewFrame(b.type, darkUi)} ${activeBlockId === b.id ? 'ring-2 ring-primary/50' : ''}`}
                >
                  <LyricsWithChords
                    text={b.content}
                    transposeSemitones={0}
                    chordTone={darkUi ? 'dark' : 'light'}
                    fontSizePx={16}
                    className={studioPreviewLyricsClassName(darkUi)}
                  />
                </div>
              ))}
            </div>
          </aside>
        ) : null}
      </div>

      {showPreview ? (
        <section
          className={`hidden rounded-2xl border p-4 md:block xl:hidden ${
            darkUi ? 'border-slate-800 bg-slate-950/60' : 'border-stone-200 bg-white'
          }`}
        >
          <p className={`mb-3 text-xs font-semibold uppercase tracking-[0.05em] ${shell.muted}`}>
            Live preview · {activeBlock ? blockTypeLabel(activeBlock.type) : '—'}
          </p>
          <div className="space-y-3">
            {blocks.map((b) => (
              <div
                key={`pv-tablet-${b.id}`}
                className={`${studioPreviewFrame(b.type, darkUi)} ${activeBlockId === b.id ? 'ring-2 ring-primary/50' : ''}`}
              >
                <LyricsWithChords
                  text={b.content}
                  transposeSemitones={0}
                  chordTone={darkUi ? 'dark' : 'light'}
                  fontSizePx={16}
                  className={studioPreviewLyricsClassName(darkUi)}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section
        className={`hidden rounded-2xl border p-3 xl:block ${
          darkUi ? 'border-slate-800 bg-slate-950/35' : 'border-stone-200 bg-white'
        }`}
      >
        <p className={`mb-3 text-xs font-semibold uppercase tracking-[0.05em] ${shell.muted}`}>Структура песни</p>
        <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
          {blocks.map((block, idx) => {
            const preset = STUDIO_BLOCK_PRESETS.find((x) => x.type === block.type);
            return (
              <div key={`outline-${block.id}`} className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveBlockId(block.id);
                    blockCardRef.current.get(block.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${studioTypeTone(block.type, darkUi, activeBlockId === block.id)}`}
                >
                  <span aria-hidden>{preset?.icon ?? '🎵'}</span>
                  <span>{block.sectionHint || blockTypeLabel(block.type)}</span>
                </button>
                {idx < blocks.length - 1 ? <span className={shell.muted}>→</span> : null}
              </div>
            );
          })}
        </div>
      </section>

      {chordAutoUndo && undoSecondsLeft > 0 ? (
        <div
          className={`fixed bottom-[calc(var(--app-bottom-nav-total-height)+0.5rem)] left-1/2 z-[120] w-[min(92vw,520px)] -translate-x-1/2 rounded-xl border px-3 py-2 shadow-xl lg:bottom-6 ${
            darkUi ? 'border-amber-600/60 bg-slate-900 text-slate-100' : 'border-amber-200 bg-white text-stone-900'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">
              Аккорды расставлены в {chordAutoUndo.appliedCount} блоках.
              <span className={`ml-1 ${shell.muted}`}>Отмена: {undoSecondsLeft}с</span>
            </p>
            <button
              type="button"
              onClick={undoAutoChordPattern}
              className={`inline-flex min-h-[36px] items-center gap-1 rounded-lg px-3 text-sm font-semibold ${
                darkUi ? 'bg-amber-500 text-slate-900 hover:bg-amber-400' : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
              }`}
            >
              <LuHistory className="h-4 w-4" />
              Отменить
            </button>
          </div>
        </div>
      ) : null}

      <div
        className={[
          'studio-editor-mobile-dock fixed inset-x-0 bottom-0 z-50 border-t pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] lg:hidden',
          darkUi ? 'border-slate-800 bg-slate-950/95' : 'border-slate-200 bg-white/95',
        ].join(' ')}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2">
          <button
            type="button"
            onClick={() => setMobilePane((prev) => (prev === 'preview' ? 'editor' : 'preview'))}
            className={`min-h-[44px] rounded-xl px-4 text-sm font-semibold ${
              darkUi ? 'bg-slate-800 text-slate-100' : 'bg-stone-100 text-stone-900'
            }`}
          >
            {mobilePane === 'preview' ? 'Редактор' : 'Предпросмотр'}
          </button>
          <button
            type="button"
            disabled={!hasUnsavedChanges || isSaving}
            onClick={() => void saveAll()}
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
            {isSaving ? 'Сохраняем…' : 'Сохранить песню'}
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

      {showPreviewPane ? (
        <div className="fixed inset-0 z-[70] flex min-h-0 flex-col bg-black/45 px-3 pb-24 pt-20 lg:hidden">
          <div
            className={`min-h-0 max-h-full flex-1 overflow-y-auto overscroll-contain rounded-2xl border p-4 ${
              darkUi ? 'border-slate-700 bg-slate-950 text-slate-100' : 'border-stone-200 bg-white text-stone-900'
            }`}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className={`text-xs font-semibold uppercase tracking-[0.05em] ${shell.muted}`}>
                Live preview · {activeBlock ? blockTypeLabel(activeBlock.type) : '—'}
              </p>
              <button type="button" onClick={() => setMobilePane('editor')} className={`rounded-lg px-2 py-1 text-xs ${shell.iconBtn}`}>
                Закрыть
              </button>
            </div>
            <div className="space-y-3">
              {blocks.map((b) => (
                <div
                  key={`pv-mobile-${b.id}`}
                  className={`${studioPreviewFrame(b.type, darkUi)} ${activeBlockId === b.id ? 'ring-2 ring-primary/50' : ''}`}
                >
                  <LyricsWithChords
                    text={b.content}
                    transposeSemitones={0}
                    chordTone={darkUi ? 'dark' : 'light'}
                    fontSizePx={16}
                    className={studioPreviewLyricsClassName(darkUi)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </>
  );
}
