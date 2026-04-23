import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import {
  LuArrowLeft,
  LuArrowRight,
  LuLoader,
  LuMusic,
  LuSparkles,
  LuUpload,
  LuYoutube,
} from 'react-icons/lu';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../auth/authStore';
import { canModerateSongCatalog } from '../../auth/studioAccess';
import { createSong, fetchYoutubeOembed } from '../api';
import { LyricsWithChords } from '../components/LyricsWithChords';
import { SectionInsertToolbar } from '../components/SectionInsertToolbar';
import { convertToChordPro } from '../addSong/chordProConversion';
import { SmartImportModal, type SmartImportSourceTab } from '../addSong/SmartImportModal';
import { extractChordsFromText, guessKeyFromChords } from '../addSong/keyDetection';
import { quickChordsForKey } from '../addSong/quickChords';

const KEY_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

function parseKeyForApi(guessLabel: string): string {
  const t = guessLabel.trim();
  if (!t) return '';
  const first = t.split(/\s+/)[0];
  return first ?? t;
}

export function AddSongPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isStudio =
    location.pathname.startsWith('/studio/') || location.pathname.startsWith('/songbook/studio');
  const role = useAuthStore((s) => s.role);
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

  const theme = isStudio
    ? {
        page: 'text-zinc-100',
        link: 'text-zinc-400 hover:text-white',
        title: 'text-white',
        muted: 'text-zinc-400',
        stepActive: 'bg-zinc-700 text-white',
        stepDone: 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700',
        stepTodo: 'bg-zinc-900/80 text-zinc-500',
        border: 'border-zinc-700',
        input: 'border-zinc-600 bg-zinc-950 text-zinc-100 placeholder:text-zinc-500',
        card: 'border-zinc-700 bg-zinc-900/60',
        preview: 'border-zinc-700 bg-zinc-900/40',
        amber: 'border-amber-900/50 bg-amber-950/40 text-amber-100',
        btnOutline: 'border-zinc-600 text-zinc-200 hover:bg-zinc-800',
        primaryBtn: 'bg-sky-600 text-white hover:bg-sky-500',
        saveBtn: 'bg-sky-600 text-white hover:bg-sky-500',
      }
    : {
        page: '',
        link: 'text-stone-500 hover:text-stone-800',
        title: 'text-stone-900',
        muted: 'text-stone-600',
        stepActive: 'bg-stone-900 text-white',
        stepDone: 'bg-stone-200 text-stone-800 hover:bg-stone-300',
        stepTodo: 'bg-stone-100 text-stone-400',
        border: 'border-stone-200',
        input: 'border-stone-200 bg-white text-stone-900 placeholder:text-stone-400',
        card: 'border-stone-200 bg-white',
        preview: 'border-stone-200 bg-stone-50',
        amber: 'border-amber-100 bg-amber-50/80 text-amber-900',
        btnOutline: 'border-stone-200 text-stone-800 hover:bg-stone-50',
        primaryBtn: 'bg-primary text-white',
        saveBtn: 'bg-stone-900 text-white hover:bg-stone-800',
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

  const createMut = useMutation({
    mutationFn: () =>
      createSong({
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
      }),
    onSuccess: (song) => {
      void navigate(`/songbook/${song.id}`);
    },
  });

  if (!canModerateSongCatalog(role)) {
    return (
      <div className={`mx-auto max-w-lg p-6 ${isStudio ? 'text-zinc-300' : 'text-stone-600'}`}>
        <p>Добавление песен доступно редакторам каталога.</p>
        <Link
          to={isStudio ? (location.pathname.startsWith('/songbook') ? '/songbook/studio' : '/studio/my-songs') : '/songbook'}
          className={`mt-4 inline-block ${isStudio ? 'text-sky-400' : 'text-sky-600'}`}
        >
          ← Назад
        </Link>
      </div>
    );
  }

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

  const handleSmartImport = ({ raw, chordPro }: { raw: string; chordPro: string }) => {
    setRawPaste(raw);
    setContent(chordPro);
  };

  const goPrev = () => {
    if (step > 1) setStep((s) => s - 1);
  };

  const manualSongNumberInvalid =
    !autoSongNumber &&
    (!!songNumber.trim() ? !Number.isInteger(Number(songNumber)) || Number(songNumber) <= 0 : true);
  const hasImportedText = Boolean((content.trim() || rawPaste.trim()).length > 0);
  const canSaveSong = Boolean(title.trim()) && !createMut.isPending && !manualSongNumberInvalid;
  const backPath = isStudio
    ? location.pathname.startsWith('/songbook')
      ? '/songbook/studio'
      : '/studio/my-songs'
    : '/songbook';

  const onEnterFocusNext = (e: KeyboardEvent<HTMLInputElement>, next: RefObject<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    next.current?.focus();
  };

  return (
    <div className={`mx-auto max-w-6xl space-y-6 pb-36 md:pb-24 ${theme.page}`}>
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={isStudio ? (location.pathname.startsWith('/songbook') ? '/songbook/studio' : '/studio/my-songs') : '/songbook'}
          className={`inline-flex items-center gap-2 text-sm ${theme.link}`}
        >
          <LuArrowLeft className="h-4 w-4" />
          {isStudio ? 'Студия' : 'Песенник'}
        </Link>
        <h1 className={`flex items-center gap-2 text-xl font-bold ${theme.title}`}>
          <LuMusic className={`h-6 w-6 ${isStudio ? 'text-sky-400' : 'text-primary'}`} />
          Новая песня
        </h1>
      </div>

      {/* Stepper */}
      <ol className="flex flex-nowrap gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">
        {(['Источник текста', 'Редактор и превью', 'Метаданные'] as const).map((label, i) => {
          const n = i + 1;
          const active = step === n;
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => n < step && setStep(n)}
                disabled={n > step}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  active ? theme.stepActive : n < step ? theme.stepDone : theme.stepTodo
                }`}
              >
                {n}. {label}
              </button>
            </li>
          );
        })}
      </ol>

      {showWelcome ? (
        <div className={`rounded-xl border p-3 text-sm ${isStudio ? 'border-sky-900/50 bg-sky-950/30 text-sky-100' : 'border-sky-200 bg-sky-50 text-sky-900'}`}>
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
          <div className={`grid grid-cols-2 gap-1 rounded-xl p-1 md:hidden ${isStudio ? 'bg-zinc-900/80' : 'bg-stone-100'}`}>
            <button
              type="button"
              onClick={() => setMobileEditorPane('editor')}
              className={`min-h-[40px] rounded-lg text-xs font-semibold ${
                mobileEditorPane === 'editor'
                  ? isStudio
                    ? 'bg-zinc-700 text-white'
                    : 'bg-white text-stone-900 shadow-sm'
                  : isStudio
                    ? 'text-zinc-400'
                    : 'text-stone-600'
              }`}
            >
              Редактор
            </button>
            <button
              type="button"
              onClick={() => setMobileEditorPane('preview')}
              className={`min-h-[40px] rounded-lg text-xs font-semibold ${
                mobileEditorPane === 'preview'
                  ? isStudio
                    ? 'bg-zinc-700 text-white'
                    : 'bg-white text-stone-900 shadow-sm'
                  : isStudio
                    ? 'text-zinc-400'
                    : 'text-stone-600'
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

          <div className="grid gap-4 lg:grid-cols-2">
            <div className={mobileEditorPane === 'preview' ? 'hidden md:block' : ''}>
              <p className={`mb-2 text-xs font-bold uppercase ${theme.muted}`}>Редактор</p>
              <SectionInsertToolbar dark={isStudio} onInsert={insertSectionMarkerLine} className="mb-3" />
              <textarea
                ref={editorRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onSelect={syncEditorSelection}
                onKeyUp={syncEditorSelection}
                onMouseUp={syncEditorSelection}
                rows={18}
                className={`w-full resize-y rounded-xl border p-4 font-mono text-sm ${theme.input}`}
                placeholder={'# Куплет 1\n[Am]Когда качаются [C]фонарики [G]ночные\n\n# Припев\n[F]...'}
              />
            </div>
            <div className={mobileEditorPane === 'editor' ? 'hidden md:block' : ''}>
              <p className={`mb-2 text-xs font-bold uppercase ${theme.muted}`}>Превью</p>
              <div className={`min-h-[12rem] rounded-xl border p-4 ${theme.preview}`}>
                <LyricsWithChords
                  text={content}
                  transposeSemitones={0}
                  className={`text-sm leading-relaxed ${isStudio ? 'text-zinc-100' : 'text-stone-900'}`}
                />
              </div>
            </div>
          </div>

          <div className={`rounded-xl border p-4 ${theme.amber}`}>
            <p className={`mb-2 text-xs font-bold uppercase ${isStudio ? 'text-amber-200' : 'text-amber-900'}`}>
              Быстрые аккорды
            </p>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className={`text-xs ${theme.muted}`}>
                Тоника
                <select
                  value={quickRoot}
                  onChange={(e) => setQuickRoot(e.target.value)}
                  className={`ml-2 rounded-lg border px-2 py-1 text-sm ${theme.input}`}
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
                className={`rounded-lg border px-2 py-1 text-sm ${theme.input}`}
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
                  className={
                    isStudio
                      ? 'rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-amber-100 ring-1 ring-amber-800/80 hover:bg-zinc-700'
                      : 'rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-amber-950 shadow-sm ring-1 ring-amber-200 hover:bg-amber-100'
                  }
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>

          <div className="hidden flex-wrap justify-between gap-2 md:flex">
            <button
              type="button"
              onClick={goPrev}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm ${theme.btnOutline}`}
            >
              <LuArrowLeft className="h-4 w-4" />
              Назад
            </button>
            <button
              type="button"
              onClick={goNext}
              className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold ${theme.primaryBtn}`}
            >
              Далее
              <LuArrowRight className="h-4 w-4" />
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="space-y-4">
          <p className={`text-sm ${theme.muted}`}>
            Заполните минимум название и тональность. Остальное можно добавить позже.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={`text-xs font-bold uppercase ${theme.muted}`}>Название *</span>
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
                      type="number"
                      min={1}
                      value={songNumber}
                      onChange={(e) => setSongNumber(e.target.value)}
                      className={`min-h-[46px] w-28 rounded-xl border px-3 py-2 text-sm ${theme.input}`}
                      placeholder="№"
                    />
                    {manualSongNumberInvalid ? (
                      <p className={`text-[11px] ${isStudio ? 'text-red-400' : 'text-red-600'}`}>
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
                type="number"
                value={tempo}
                onChange={(e) => setTempo(e.target.value)}
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
          </div>

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

          {createMut.isError && (
            <p className={`text-sm ${isStudio ? 'text-red-400' : 'text-red-600'}`}>
              Не удалось сохранить. Проверьте поля и права.
            </p>
          )}

          <div className="hidden flex-wrap justify-between gap-2 md:flex">
            <button
              type="button"
              onClick={goPrev}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm ${theme.btnOutline}`}
            >
              <LuArrowLeft className="h-4 w-4" />
              Назад
            </button>
            <button
              type="button"
              disabled={!canSaveSong}
              onClick={() => createMut.mutate()}
              className={`inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold disabled:opacity-50 ${theme.saveBtn}`}
            >
              {createMut.isPending ? <LuLoader className="h-4 w-4 animate-spin" /> : null}
              Сохранить в каталог
            </button>
          </div>
        </section>
      )}

      <div className={`fixed inset-x-0 bottom-0 z-50 border-t p-2 md:hidden ${isStudio ? 'border-zinc-700 bg-zinc-950/95' : 'border-stone-200 bg-white/95'}`}>
        <div className="mx-auto flex max-w-6xl items-center gap-2">
          {step === 1 ? (
            <>
              <button
                type="button"
                onClick={() => void navigate(backPath)}
                className={`min-h-[44px] rounded-xl border px-4 text-sm ${theme.btnOutline}`}
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
                className={`min-h-[44px] rounded-xl border px-4 text-sm ${theme.btnOutline}`}
              >
                Назад
              </button>
              <button
                type="button"
                onClick={goNext}
                className={`min-h-[44px] flex-1 rounded-xl text-sm font-semibold ${theme.primaryBtn}`}
              >
                Далее
              </button>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <button
                type="button"
                onClick={goPrev}
                className={`min-h-[44px] rounded-xl border px-4 text-sm ${theme.btnOutline}`}
              >
                Назад
              </button>
              <button
                type="button"
                disabled={!canSaveSong}
                onClick={() => createMut.mutate()}
                className={`min-h-[44px] flex-1 rounded-xl text-sm font-semibold disabled:opacity-50 ${theme.saveBtn}`}
              >
                {createMut.isPending ? 'Сохраняем…' : 'Сохранить в каталог'}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
