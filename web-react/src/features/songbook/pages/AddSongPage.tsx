import { useMutation } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
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
import { convertToChordPro } from '../addSong/chordProConversion';
import { SmartImportModal } from '../addSong/SmartImportModal';
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
  const isStudio = location.pathname.startsWith('/studio/');
  const role = useAuthStore((s) => s.role);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const selRef = useRef({ start: 0, end: 0 });

  const [step, setStep] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const [rawPaste, setRawPaste] = useState('');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [defaultKey, setDefaultKey] = useState('');
  const [quickRoot, setQuickRoot] = useState('G');
  const [quickMode, setQuickMode] = useState<'major' | 'minor'>('major');
  const [tempo, setTempo] = useState('');
  const [timeSig, setTimeSig] = useState('');
  const [tags, setTags] = useState('');
  const [keyHint, setKeyHint] = useState<string | null>(null);

  const applyConvert = useCallback((src: string) => convertToChordPro(src), []);

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
          to={isStudio ? '/studio/my-songs' : '/songbook'}
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

  return (
    <div className={`mx-auto max-w-6xl space-y-6 pb-24 ${theme.page}`}>
      <SmartImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onApply={handleSmartImport}
        initialRaw={rawPaste}
        variant={isStudio ? 'studio' : 'default'}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={isStudio ? '/studio/my-songs' : '/songbook'}
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
      <ol className="flex flex-wrap gap-2">
        {(['Умный импорт', 'Редактор и превью', 'Метаданные'] as const).map((label, i) => {
          const n = i + 1;
          const active = step === n;
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => n < step && setStep(n)}
                disabled={n > step}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  active ? theme.stepActive : n < step ? theme.stepDone : theme.stepTodo
                }`}
              >
                {n}. {label}
              </button>
            </li>
          );
        })}
      </ol>

      {step === 1 && (
        <section className="space-y-4">
          <p className={`text-sm ${theme.muted}`}>
            Откройте окно импорта: вставьте текст с аккордами над строками или перетащите файл. Используется{' '}
            <code className={isStudio ? 'text-sky-300' : 'rounded bg-stone-100 px-1 text-stone-800'}>
              convertToChordPro
            </code>{' '}
            → ChordPro <code className={isStudio ? 'text-sky-300' : ''}>[Am]</code>.
          </p>
          <div className={`rounded-2xl border p-6 ${theme.card}`}>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-4 text-sm font-semibold sm:w-auto ${theme.primaryBtn}`}
            >
              <LuUpload className="h-5 w-5" />
              Импорт из текста
            </button>
            <p className={`mt-4 text-sm ${theme.muted}`}>
              {(content.trim() || rawPaste.trim()) && (
                <span className="text-emerald-500">Текст загружен — можно переходить к правке.</span>
              )}
              {!content.trim() && !rawPaste.trim() && 'Сначала импортируйте текст или откройте окно позже на шаге 2.'}
            </p>
          </div>
          <div className="flex justify-end">
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

      {step === 2 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${theme.btnOutline}`}
            >
              <LuUpload className="h-4 w-4" />
              Импорт из текста
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
            <div>
              <p className={`mb-2 text-xs font-bold uppercase ${theme.muted}`}>Редактор</p>
              <textarea
                ref={editorRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onSelect={syncEditorSelection}
                onKeyUp={syncEditorSelection}
                onMouseUp={syncEditorSelection}
                rows={18}
                className={`w-full resize-y rounded-xl border p-4 font-mono text-sm ${theme.input}`}
              />
            </div>
            <div>
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

          <div className="flex flex-wrap justify-between gap-2">
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
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={`text-xs font-bold uppercase ${theme.muted}`}>Название *</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${theme.input}`}
                placeholder="Название песни"
              />
            </label>
            <label className="block">
              <span className={`text-xs font-bold uppercase ${theme.muted}`}>Тональность</span>
              <input
                value={defaultKey}
                onChange={(e) => setDefaultKey(e.target.value)}
                className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${theme.input}`}
                placeholder="G, Am, …"
              />
            </label>
            <label className="block">
              <span className={`text-xs font-bold uppercase ${theme.muted}`}>BPM</span>
              <input
                type="number"
                value={tempo}
                onChange={(e) => setTempo(e.target.value)}
                className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${theme.input}`}
                placeholder="120"
              />
            </label>
            <label className="block">
              <span className={`text-xs font-bold uppercase ${theme.muted}`}>Размер</span>
              <input
                value={timeSig}
                onChange={(e) => setTimeSig(e.target.value)}
                className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${theme.input}`}
                placeholder="4/4"
              />
            </label>
          </div>

          <div className={`rounded-xl border p-4 ${theme.card}`}>
            <p className={`mb-2 flex items-center gap-2 text-xs font-bold uppercase ${theme.muted}`}>
              <LuYoutube className="h-4 w-4 text-red-600" />
              YouTube (опционально)
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                className={`min-w-[200px] flex-1 rounded-xl border px-3 py-2 text-sm ${theme.input}`}
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
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm ${theme.input}`}
              placeholder="worship, fast"
            />
          </label>

          {createMut.isError && (
            <p className={`text-sm ${isStudio ? 'text-red-400' : 'text-red-600'}`}>
              Не удалось сохранить. Проверьте поля и права.
            </p>
          )}

          <div className="flex flex-wrap justify-between gap-2">
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
              disabled={!title.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
              className={`inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold disabled:opacity-50 ${theme.saveBtn}`}
            >
              {createMut.isPending ? <LuLoader className="h-4 w-4 animate-spin" /> : null}
              Сохранить в каталог
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
