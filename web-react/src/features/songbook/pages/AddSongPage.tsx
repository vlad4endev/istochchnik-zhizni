import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { LuArrowLeft, LuArrowRight, LuLoader, LuSave, LuSparkles, LuUpload, LuYoutube } from 'react-icons/lu';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';

import { useAuthStore } from '../../auth/authStore';
import { canModerateSongCatalogSession } from '../../auth/studioAccess';
import { createDraft, updateDraft } from '../../studio/api';
import {
  getStudioModuleSurface,
  studioMySongsDraftsPath,
  studioMySongsPath,
} from '../../studio/studioPaths';
import { createSong, fetchYoutubeOembed } from '../api';
import { LyricsWithChords } from '../components/LyricsWithChords';
import { SectionInsertToolbar } from '../components/SectionInsertToolbar';
import { convertToChordPro } from '../addSong/chordProConversion';
import { SmartImportModal, type SmartImportSourceTab } from '../addSong/SmartImportModal';
import { extractChordsFromText, guessKeyFromChords } from '../addSong/keyDetection';
import { quickChordsForKey } from '../addSong/quickChords';
import { PageHeader } from '@/components/layout/PageHeader';
import { sectionHeroStickyClass } from '@/lib/sectionHeroChrome';

const KEY_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

function parseKeyForApi(guessLabel: string): string {
  const t = guessLabel.trim();
  if (!t) return '';
  const first = t.split(/\s+/)[0];
  return first ?? t;
}

type DraftNavState = {
  draft?: { id: number; title: string; content: string };
};

export function AddSongPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const surface = getStudioModuleSurface(location.pathname);
  const isStudio =
    location.pathname.startsWith('/studio/') || location.pathname.startsWith('/songbook/studio');
  const role = useAuthStore((s) => s.role);
  const roles = useAuthStore((s) => s.roles ?? [s.role]);
  const canPublishCatalog = canModerateSongCatalogSession(role, roles);
  const [editingDraftId, setEditingDraftId] = useState<number | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const selRef = useRef({ start: 0, end: 0 });
  const titleRef = useRef<HTMLInputElement>(null);
  const keyRef = useRef<HTMLInputElement>(null);
  const tempoRef = useRef<HTMLInputElement>(null);
  const timeSigRef = useRef<HTMLInputElement>(null);
  const youtubeRef = useRef<HTMLInputElement>(null);
  const tagsRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const [importInitialTab, setImportInitialTab] = useState<SmartImportSourceTab>('text');
  const importAutoOpened = useRef(false);
  const [rawPaste, setRawPaste] = useState('');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [autoSongNumber, setAutoSongNumber] = useState(true);
  const [songNumber, setSongNumber] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [defaultKey, setDefaultKey] = useState('');
  const [quickRoot, setQuickRoot] = useState('G');
  const [quickMode, setQuickMode] = useState<'major' | 'minor'>('major');
  const [tempo, setTempo] = useState('');
  const [timeSig, setTimeSig] = useState('');
  const [tags, setTags] = useState('');
  const [keyHint, setKeyHint] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [mobileEditorPane, setMobileEditorPane] = useState<'editor' | 'preview'>('editor');

  const applyConvert = useCallback((src: string) => convertToChordPro(src), []);

  useEffect(() => {
    const draft = (location.state as DraftNavState | null)?.draft;
    if (!draft) return;
    setEditingDraftId(draft.id);
    setTitle(draft.title);
    setContent(draft.content);
    if (draft.content.trim()) {
      setStep(2);
      importAutoOpened.current = true;
    }
  }, [location.state]);

  useEffect(() => {
    if (step !== 1 || importAutoOpened.current) return;
    importAutoOpened.current = true;
    setImportOpen(true);
  }, [step]);

  useEffect(() => {
    try {
      setShowWelcome(localStorage.getItem('studio:addsong:welcome:dismissed') !== '1');
    } catch {
      setShowWelcome(false);
    }
  }, []);

  const theme = {
    page: 'bg-[var(--studio-editor-bg)] text-[var(--studio-editor-text)]',
    link: 'text-[var(--studio-editor-mute)] hover:text-[var(--studio-editor-text)]',
    title: 'text-[var(--studio-editor-text)]',
    muted: 'text-[var(--studio-editor-mute)]',
    stepActive:
      'bg-[var(--studio-editor-accent)] text-white shadow-sm ring-2 ring-[var(--studio-editor-accent)]/30',
    stepDone:
      'bg-[var(--studio-editor-block)] text-[var(--studio-editor-text)] ring-1 ring-[var(--studio-editor-border)] hover:bg-[var(--studio-nav-active-bg)]',
    stepTodo: 'bg-transparent text-[var(--studio-editor-mute)] ring-1 ring-[var(--studio-editor-border)]',
    border: 'border-[var(--studio-editor-border)]',
    input:
      'border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] text-[var(--studio-editor-text)] placeholder:text-[var(--studio-editor-mute)] focus:border-[var(--studio-editor-accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--studio-editor-accent)_20%,transparent)]',
    card: 'border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] shadow-sm',
    preview: 'border-[var(--studio-editor-border)] bg-[var(--studio-editor-bg)]',
    callout: 'studio-callout studio-callout-info',
    btnOutline: 'studio-btn-ghost',
    primaryBtn: 'studio-btn-primary',
    saveBtn: 'studio-btn-primary',
    toolbar: 'bg-[var(--studio-toolbar-bg)] border-[var(--studio-toolbar-border)]',
    dock: 'bg-[var(--studio-dock-bg)] border-[var(--studio-dock-border)]',
  };

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

  const onDetectKey = () => {
    const chords = extractChordsFromText(content);
    if (chords.length === 0) {
      setKeyHint('Не найдено аккордов — сначала вставьте текст или нажмите «Конвертировать».');
      return;
    }
    const guess = guessKeyFromChords(chords);
    if (!guess) {
      setKeyHint('Не удалось определить тональность.');
      return;
    }
    setKeyHint(`${guess.label} (${guess.confidence}) — ${guess.detail}`);
    setDefaultKey(parseKeyForApi(guess.label));
    const root = parseKeyForApi(guess.label);
    if (KEY_ROOTS.includes(root as (typeof KEY_ROOTS)[number])) {
      setQuickRoot(root);
    }
    if (guess.label.includes('minor')) setQuickMode('minor');
    else if (guess.label.includes('major')) setQuickMode('major');
  };

  const onFetchYoutube = async () => {
    const u = youtubeUrl.trim();
    if (!u) return;
    try {
      const { title: t, author } = await fetchYoutubeOembed(u);
      if (!t) return;
      if (!title.trim()) {
        setTitle(author ? `${t} — ${author}` : t);
      }
    } catch {
      setKeyHint('Не удалось загрузить данные с YouTube.');
    }
  };

  const buildCreatePayload = (force?: boolean) => ({
    song_number: autoSongNumber ? null : songNumber.trim() ? Number(songNumber) : null,
    title: title.trim(),
    content,
    default_key: defaultKey.trim() || null,
    tempo: tempo.trim() ? Number(tempo) : null,
    time_signature: timeSig.trim() || null,
    tags: tags
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    is_published: true,
    ...(force ? { force: true } : {}),
  });

  const createMut = useMutation({
    mutationFn: ({ force }: { force?: boolean } = {}) => createSong(buildCreatePayload(force)),
    onSuccess: (song) => {
      void navigate(`/songbook/${song.id}`);
    },
    onError: async (err: unknown) => {
      if (!axios.isAxiosError(err)) return;
      if (err.response?.status !== 409) return;
      const data = err.response.data as { matches?: Array<{ id: string; title: string; song_number: number | null }> } | undefined;
      const lines = (data?.matches ?? [])
        .slice(0, 5)
        .map((m) => `${m.song_number ?? '—'}. ${m.title}`)
        .join('\n');
      const ok = window.confirm(
        `Похоже, такая песня уже есть в каталоге.\n\n${lines || '(совпадения не перечислены)'}\n\nСоздать всё равно?`,
      );
      if (!ok) return;
      try {
        await createMut.mutateAsync({ force: true });
      } catch {
        // ignore
      }
    },
  });

  const resolveDraftContent = () => {
    const body = content.trim() ? content : applyConvert(rawPaste);
    return body.trim();
  };

  const draftMut = useMutation({
    mutationFn: async () => {
      const draftTitle = title.trim() || 'Без названия';
      const draftContent = resolveDraftContent();
      if (!draftContent) {
        throw new Error('empty');
      }
      if (editingDraftId) {
        return updateDraft(editingDraftId, { title: draftTitle, content: draftContent });
      }
      return createDraft(draftTitle, draftContent);
    },
    onSuccess: (draft) => {
      void qc.invalidateQueries({ queryKey: ['studio', 'drafts'] });
      if (!editingDraftId && draft?.id) {
        setEditingDraftId(Number(draft.id));
      }
      if (isStudio) {
        void navigate(studioMySongsDraftsPath(surface));
      }
    },
  });

  const quick = quickChordsForKey(quickRoot, quickMode);

  const goNext = () => {
    if (step === 1) {
      const next = content.trim() ? content : applyConvert(rawPaste);
      setContent(next);
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const handleSmartImport = ({ raw, chordPro, title: importedTitle }: { raw: string; chordPro: string; title?: string }) => {
    setRawPaste(raw);
    setContent(chordPro);
    if (importedTitle?.trim() && !title.trim()) {
      setTitle(importedTitle.trim());
    }
    if (chordPro.trim()) {
      setStep(2);
    }
  };

  const goPrev = () => {
    if (step > 1) setStep((s) => s - 1);
  };

  const manualSongNumberInvalid =
    !autoSongNumber &&
    (!!songNumber.trim() ? !Number.isInteger(Number(songNumber)) || Number(songNumber) <= 0 : true);
  const hasImportedText = Boolean((content.trim() || rawPaste.trim()).length > 0);
  const hasDraftBody = Boolean(resolveDraftContent().length > 0);
  const canSaveSong = canPublishCatalog && Boolean(title.trim()) && !createMut.isPending && !manualSongNumberInvalid;
  const canSaveDraft = hasDraftBody && !draftMut.isPending;
  const backPath = isStudio ? studioMySongsPath(surface) : '/songbook';
  const pageTitle = editingDraftId ? 'Редактирование черновика' : 'Новая песня';

  const onEnterFocusNext = (e: KeyboardEvent<HTMLInputElement>, next: RefObject<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    next.current?.focus();
  };

  const embeddedInStudio = location.pathname.startsWith('/studio/');

  return (
    <div
      className={[
        'mx-auto max-w-6xl space-y-5',
        embeddedInStudio ? 'px-0 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-6' : 'space-y-6 px-3 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:px-4 md:pb-6',
        theme.page,
      ].join(' ')}
    >
      {!embeddedInStudio ? (
        <div className={sectionHeroStickyClass}>
          <PageHeader title={pageTitle} />
        </div>
      ) : (
        <header className="space-y-1 border-b border-[var(--studio-editor-border)] pb-4">
          <Link to={backPath} className={`inline-flex items-center gap-1.5 text-sm ${theme.link}`}>
            <LuArrowLeft className="h-4 w-4" />
            Назад
          </Link>
          <h1 className={`text-xl font-bold tracking-tight md:text-2xl ${theme.title}`}>{pageTitle}</h1>
        </header>
      )}
      <SmartImportModal
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          setImportInitialTab('text');
        }}
        onApply={handleSmartImport}
        initialRaw={rawPaste}
        initialTab={importInitialTab}
        variant={isStudio ? 'studio' : 'default'}
      />

      {!embeddedInStudio ? (
        <div className="flex flex-wrap items-center gap-3">
          <Link to={backPath} className={`inline-flex items-center gap-2 text-sm ${theme.link}`}>
            <LuArrowLeft className="h-4 w-4" />
            {isStudio ? 'Студия' : 'Песенник'}
          </Link>
        </div>
      ) : null}

      {/* Stepper */}
      <ol className="flex flex-nowrap gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible" aria-label="Шаги создания песни">
        {(['Источник текста', 'Редактор и превью', 'Метаданные'] as const).map((label, i) => {
          const n = i + 1;
          const active = step === n;
          const done = n < step;
          return (
            <li key={label} className="shrink-0">
              <button
                type="button"
                onClick={() => n < step && setStep(n)}
                disabled={n > step}
                aria-current={active ? 'step' : undefined}
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  active ? theme.stepActive : done ? theme.stepDone : theme.stepTodo
                }`}
              >
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                    active ? 'bg-white/20' : done ? 'bg-[var(--studio-editor-accent)] text-white' : 'bg-[var(--studio-editor-bg)]'
                  }`}
                >
                  {done ? '✓' : n}
                </span>
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{n === 1 ? 'Импорт' : n === 2 ? 'Редактор' : 'Данные'}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {showWelcome ? (
        <div className={theme.callout}>
          <p>Вставьте текст песни, расставьте аккорды в квадратных скобках [Am] прямо в тексте и разделите песню на блоки.</p>
          <button
            type="button"
            className={`mt-2 rounded-lg border px-3 py-1.5 text-xs font-semibold ${theme.btnOutline}`}
            onClick={() => {
              setShowWelcome(false);
              try {
                localStorage.setItem('studio:addsong:welcome:dismissed', '1');
              } catch {
                // noop
              }
            }}
          >
            Понятно
          </button>
        </div>
      ) : null}

      {step === 1 && (
        <section className="space-y-4">
          <p className={`text-sm leading-relaxed ${theme.muted}`}>
            Окно импорта открывается автоматически: можно вставить текст, выбрать <strong className="font-medium">PDF</strong> с
            текстовым слоем или указать <strong className="font-medium">прямую ссылку</strong> на .txt / ChordPro в интернете.
            После вставки нажмите «Далее» — откроется редактор и превью.
          </p>
          <div className={`rounded-2xl border p-6 ${theme.card}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setImportInitialTab('text');
                  setImportOpen(true);
                }}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-4 text-sm font-semibold sm:w-auto ${theme.primaryBtn}`}
              >
                <LuUpload className="h-5 w-5" />
                Импорт: текст / ссылка
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportInitialTab('pdf');
                  setImportOpen(true);
                }}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-5 py-4 text-sm font-semibold sm:w-auto ${theme.btnOutline}`}
              >
                <LuUpload className="h-5 w-5" />
                Импорт из PDF
              </button>
            </div>
            <p className={`mt-4 text-sm ${theme.muted}`}>
              {(content.trim() || rawPaste.trim()) && (
                <span className="text-emerald-500">Текст загружен — можно переходить к правке.</span>
              )}
              {!content.trim() && !rawPaste.trim() && 'Пока текста нет — завершите импорт в окне или откройте его кнопкой выше.'}
            </p>
          </div>
          <div className="hidden justify-end md:flex">
            <button
              type="button"
              onClick={goNext}
              disabled={!hasImportedText}
              className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold ${theme.primaryBtn}`}
            >
              Далее
              <LuArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4">
          <div className={`grid grid-cols-2 gap-1 rounded-xl p-1 lg:hidden bg-[var(--studio-editor-bg)]`}>
            <button
              type="button"
              onClick={() => setMobileEditorPane('editor')}
              className={`min-h-[40px] rounded-lg text-xs font-semibold ${
                mobileEditorPane === 'editor' ? theme.stepActive + ' shadow-sm' : theme.muted
              }`}
            >
              Редактор
            </button>
            <button
              type="button"
              onClick={() => setMobileEditorPane('preview')}
              className={`min-h-[40px] rounded-lg text-xs font-semibold ${
                mobileEditorPane === 'preview' ? theme.stepActive + ' shadow-sm' : theme.muted
              }`}
            >
              Превью
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setImportInitialTab('text');
                setImportOpen(true);
              }}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${theme.btnOutline}`}
            >
              <LuUpload className="h-4 w-4" />
              Импорт (текст, ссылка)
            </button>
            <button
              type="button"
              onClick={() => {
                setImportInitialTab('pdf');
                setImportOpen(true);
              }}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${theme.btnOutline}`}
            >
              <LuUpload className="h-4 w-4" />
              PDF
            </button>
            <button
              type="button"
              onClick={onDetectKey}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${theme.btnOutline}`}
            >
              <LuSparkles className="h-4 w-4 text-amber-500" />
              Определить тональность
            </button>
            {keyHint && <span className={`text-xs ${theme.muted}`}>{keyHint}</span>}
          </div>

          <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
            <div
              className={[
                'rounded-2xl border p-4 md:p-5',
                theme.card,
                mobileEditorPane === 'preview' ? 'hidden md:block' : '',
              ].join(' ')}
            >
              <p className={`mb-3 text-xs font-bold uppercase tracking-wide ${theme.muted}`}>Редактор</p>
              <SectionInsertToolbar dark={isStudio} onInsert={insertSectionMarkerLine} className="mb-3" />
              <textarea
                ref={editorRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onSelect={syncEditorSelection}
                onKeyUp={syncEditorSelection}
                onMouseUp={syncEditorSelection}
                rows={18}
                className={`w-full resize-y rounded-xl border p-4 font-mono text-sm leading-relaxed outline-none ${theme.input}`}
                placeholder={'# Куплет 1\n[Am]Когда качаются [C]фонарики [G]ночные\n\n# Припев\n[F]...'}
              />
            </div>
            <div
              className={[
                'rounded-2xl border p-4 md:p-5',
                theme.card,
                mobileEditorPane === 'editor' ? 'hidden md:block' : '',
              ].join(' ')}
            >
              <p className={`mb-3 text-xs font-bold uppercase tracking-wide ${theme.muted}`}>Превью</p>
              <div className={`min-h-[12rem] rounded-xl border p-4 ${theme.preview}`}>
                <LyricsWithChords
                  text={content}
                  transposeSemitones={0}
                  className="text-sm leading-relaxed text-[var(--studio-editor-text)]"
                />
              </div>
            </div>
          </div>

          <div className={`rounded-2xl border p-4 md:p-5 ${theme.card}`}>
            <p className={`mb-3 text-xs font-bold uppercase tracking-wide ${theme.muted}`}>Быстрые аккорды</p>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <label className={`flex items-center gap-2 text-sm ${theme.muted}`}>
                Тоника
                <select
                  value={quickRoot}
                  onChange={(e) => setQuickRoot(e.target.value)}
                  className={`rounded-lg border px-2 py-1.5 text-sm ${theme.input}`}
                >
                  {KEY_ROOTS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
              <select
                value={quickMode}
                onChange={(e) => setQuickMode(e.target.value as 'major' | 'minor')}
                className={`rounded-lg border px-2 py-1.5 text-sm ${theme.input}`}
              >
                <option value="major">мажор</option>
                <option value="minor">минор</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              {quick.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => insertChord(ch)}
                  className="studio-chip min-h-[36px] px-3 text-sm font-semibold"
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>

          <div className="hidden flex-wrap justify-between gap-2 md:flex">
            <button type="button" onClick={goPrev} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm ${theme.btnOutline}`}>
              <LuArrowLeft className="h-4 w-4" />
              Назад
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!canSaveDraft}
                onClick={() => draftMut.mutate()}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${theme.btnOutline}`}
              >
                {draftMut.isPending ? <LuLoader className="h-4 w-4 animate-spin" /> : <LuSave className="h-4 w-4" />}
                {editingDraftId ? 'Обновить черновик' : 'Сохранить черновик'}
              </button>
              <button
                type="button"
                onClick={goNext}
                className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold ${theme.primaryBtn}`}
              >
                {canPublishCatalog ? 'Далее' : 'Готово'}
                {canPublishCatalog ? <LuArrowRight className="h-4 w-4" /> : null}
              </button>
            </div>
          </div>
          {draftMut.isError ? (
            <p className="text-sm text-red-600">
              Не удалось сохранить черновик — добавьте текст песни.
            </p>
          ) : null}
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <p className={`text-sm ${theme.muted}`}>
            {canPublishCatalog
              ? 'Заполните минимум название и тональность. Остальное можно добавить позже.'
              : 'Укажите название и сохраните черновик — публикация в общий каталог доступна редакторам.'}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={`text-xs font-bold uppercase ${theme.muted}`}>Название{canPublishCatalog ? ' *' : ''}</span>
              <input
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => onEnterFocusNext(e, keyRef)}
                autoFocus
                className={`mt-1 min-h-[48px] w-full rounded-xl border px-3 py-2 text-sm ${theme.input}`}
                placeholder="Название песни"
              />
            </label>
            {canPublishCatalog ? (
              <>
            <label className="block">
              <span className={`text-xs font-bold uppercase ${theme.muted}`}>Тональность</span>
              <input
                ref={keyRef}
                value={defaultKey}
                onChange={(e) => setDefaultKey(e.target.value)}
                onKeyDown={(e) => onEnterFocusNext(e, tempoRef)}
                className={`mt-1 min-h-[48px] w-full rounded-xl border px-3 py-2 text-sm ${theme.input}`}
                placeholder="G, Am, …"
              />
            </label>
            <label className="block">
              <span className={`text-xs font-bold uppercase ${theme.muted}`}>Номер песни</span>
              <div className="mt-1 flex items-center gap-2">
                <label className={`inline-flex items-center gap-2 text-xs ${theme.muted}`}>
                  <input
                    type="checkbox"
                    checked={autoSongNumber}
                    onChange={(e) => setAutoSongNumber(e.target.checked)}
                  />
                  Авто по порядку
                </label>
                {!autoSongNumber ? (
                  <div className="space-y-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      value={songNumber}
                      onChange={(e) => setSongNumber(e.target.value.replace(/\D/g, ''))}
                      className={`min-h-[46px] w-28 rounded-xl border px-3 py-2 text-sm ${theme.input}`}
                      placeholder="№"
                    />
                    {manualSongNumberInvalid ? (
                      <p className="text-[11px] text-red-600">
                        Укажите целый номер больше 0.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </label>
            <label className="block">
              <span className={`text-xs font-bold uppercase ${theme.muted}`}>BPM</span>
              <input
                ref={tempoRef}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={tempo}
                onChange={(e) => setTempo(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => onEnterFocusNext(e, timeSigRef)}
                className={`mt-1 min-h-[48px] w-full rounded-xl border px-3 py-2 text-sm ${theme.input}`}
                placeholder="120"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {['60', '72', '90', '120'].map((x) => (
                  <button
                    key={x}
                    type="button"
                    onClick={() => setTempo(x)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${theme.btnOutline}`}
                  >
                    {x}
                  </button>
                ))}
              </div>
            </label>
            <label className="block">
              <span className={`text-xs font-bold uppercase ${theme.muted}`}>Размер</span>
              <input
                ref={timeSigRef}
                value={timeSig}
                onChange={(e) => setTimeSig(e.target.value)}
                onKeyDown={(e) => onEnterFocusNext(e, youtubeRef)}
                className={`mt-1 min-h-[48px] w-full rounded-xl border px-3 py-2 text-sm ${theme.input}`}
                placeholder="4/4"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {['4/4', '3/4', '6/8'].map((x) => (
                  <button
                    key={x}
                    type="button"
                    onClick={() => setTimeSig(x)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${theme.btnOutline}`}
                  >
                    {x}
                  </button>
                ))}
              </div>
            </label>
              </>
            ) : null}
          </div>

          {canPublishCatalog ? (
            <>
              <div className={`rounded-xl border p-4 ${theme.card}`}>
                <p className={`mb-2 flex items-center gap-2 text-xs font-bold uppercase ${theme.muted}`}>
                  <LuYoutube className="h-4 w-4 text-red-600" />
                  YouTube (опционально)
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={youtubeRef}
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    onKeyDown={(e) => onEnterFocusNext(e, tagsRef)}
                    className={`min-h-[48px] min-w-[200px] flex-1 rounded-xl border px-3 py-2 text-sm ${theme.input}`}
                    placeholder="https://www.youtube.com/watch?v=…"
                  />
                  <button
                    type="button"
                    onClick={() => void onFetchYoutube()}
                    className={`rounded-xl border px-4 py-2 text-sm ${theme.btnOutline}`}
                  >
                    Подставить название
                  </button>
                </div>
                <p className={`mt-2 text-xs ${theme.muted}`}>
                  Заголовок подтягивается через oEmbed (без API-ключа). При необходимости отредактируйте вручную.
                </p>
              </div>

              <label className="block">
                <span className={`text-xs font-bold uppercase ${theme.muted}`}>Теги (через запятую)</span>
                <input
                  ref={tagsRef}
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  className={`mt-1 min-h-[48px] w-full rounded-xl border px-3 py-2 text-sm ${theme.input}`}
                  placeholder="worship, fast"
                />
              </label>
            </>
          ) : null}

          {(createMut.isError || draftMut.isError) && (
            <p className="text-sm text-red-600">
              {createMut.isError ? 'Не удалось сохранить в каталог. Проверьте поля и права.' : null}
              {draftMut.isError ? 'Не удалось сохранить черновик — добавьте текст песни.' : null}
            </p>
          )}

          <div className="hidden flex-wrap justify-between gap-2 md:flex">
            <button type="button" onClick={goPrev} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm ${theme.btnOutline}`}>
              <LuArrowLeft className="h-4 w-4" />
              Назад
            </button>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!canSaveDraft}
                onClick={() => draftMut.mutate()}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${theme.btnOutline}`}
              >
                {draftMut.isPending ? <LuLoader className="h-4 w-4 animate-spin" /> : <LuSave className="h-4 w-4" />}
                {editingDraftId ? 'Обновить черновик' : 'Сохранить черновик'}
              </button>
              {canPublishCatalog ? (
            <button
              type="button"
              disabled={!canSaveSong}
              onClick={() => createMut.mutate({})}
              className={`inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold disabled:opacity-50 ${theme.saveBtn}`}
            >
              {createMut.isPending ? <LuLoader className="h-4 w-4 animate-spin" /> : null}
              Сохранить в каталог
            </button>
              ) : null}
            </div>
          </div>
        </section>
      )}

      <div
        className={`fixed inset-x-0 bottom-0 z-[var(--z-sticky)] border-t p-2 lg:hidden ${theme.dock}`}
        style={{
          boxShadow: 'var(--studio-dock-shadow)',
          paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
        }}
      >
        <div className="mx-auto flex max-w-6xl items-stretch gap-2">
          {step === 1 ? (
            <>
              <button
                type="button"
                onClick={() => void navigate(backPath)}
                className={`min-h-[44px] shrink-0 rounded-xl px-4 text-sm font-medium ${theme.btnOutline}`}
              >
                Назад
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={!hasImportedText}
                className={`min-h-[44px] flex-1 rounded-xl text-sm font-semibold disabled:opacity-50 ${theme.primaryBtn}`}
              >
                Далее
              </button>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <button
                type="button"
                onClick={goPrev}
                className={`min-h-[44px] shrink-0 rounded-xl px-4 text-sm font-medium ${theme.btnOutline}`}
              >
                Назад
              </button>
              <button
                type="button"
                disabled={!canSaveDraft}
                onClick={() => draftMut.mutate()}
                className={`min-h-[44px] shrink-0 rounded-xl px-3 text-xs font-semibold disabled:opacity-50 ${theme.btnOutline}`}
              >
                Черновик
              </button>
              <button
                type="button"
                onClick={goNext}
                className={`min-h-[44px] flex-1 rounded-xl text-sm font-semibold ${theme.primaryBtn}`}
              >
                {canPublishCatalog ? 'Далее' : 'Готово'}
              </button>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <button
                type="button"
                onClick={goPrev}
                className={`min-h-[44px] shrink-0 rounded-xl px-4 text-sm font-medium ${theme.btnOutline}`}
              >
                Назад
              </button>
              <button
                type="button"
                disabled={!canSaveDraft}
                onClick={() => draftMut.mutate()}
                className={`min-h-[44px] shrink-0 rounded-xl px-3 text-xs font-semibold disabled:opacity-50 ${theme.btnOutline}`}
              >
                Черновик
              </button>
              {canPublishCatalog ? (
                <button
                  type="button"
                  disabled={!canSaveSong}
                  onClick={() => createMut.mutate({})}
                  className={`min-h-[44px] flex-1 rounded-xl text-sm font-semibold disabled:opacity-50 ${theme.saveBtn}`}
                >
                  {createMut.isPending ? 'Сохраняем…' : 'В каталог'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!canSaveDraft}
                  onClick={() => draftMut.mutate()}
                  className={`min-h-[44px] flex-1 rounded-xl text-sm font-semibold disabled:opacity-50 ${theme.saveBtn}`}
                >
                  {draftMut.isPending ? 'Сохраняем…' : 'Сохранить'}
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
