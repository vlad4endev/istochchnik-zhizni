import { useMutation } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import {
  LuArrowLeft,
  LuArrowRight,
  LuLoader2,
  LuMusic,
  LuSparkles,
  LuUpload,
  LuWand2,
  LuYoutube,
} from 'react-icons/lu';
import { Link, useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../auth/authStore';
import { canModerateSongCatalog } from '../../auth/studioAccess';
import { createSong, fetchYoutubeOembed } from '../api';
import { LyricsWithChords } from '../components/LyricsWithChords';
import { convertStackedChordsToChordPro } from '../addSong/chordProConversion';
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
  const role = useAuthStore((s) => s.role);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const selRef = useRef({ start: 0, end: 0 });

  const [step, setStep] = useState(1);
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
  const [dropActive, setDropActive] = useState(false);

  const applyConvert = useCallback((src: string) => convertStackedChordsToChordPro(src), []);

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
      <div className="mx-auto max-w-lg p-6">
        <p className="text-stone-600">Добавление песен доступно редакторам каталога.</p>
        <Link to="/songbook" className="mt-4 inline-block text-sky-600">
          ← В песенник
        </Link>
      </div>
    );
  }

  const quick = quickChordsForKey(quickRoot, quickMode);

  const goNext = () => {
    if (step === 1) {
      setContent(applyConvert(rawPaste));
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  };

  const goPrev = () => {
    if (step > 1) setStep((s) => s - 1);
  };

  const onDropFile = (e: React.DragEvent) => {
    e.preventDefault();
    setDropActive(false);
    const f = e.dataTransfer.files[0];
    if (!f) return;
    const ok = /\.(txt|chordpro|chopro|cho)$/i.test(f.name);
    if (!ok) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setRawPaste(text);
      setContent(applyConvert(text));
    };
    reader.readAsText(f);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/songbook" className="inline-flex items-center gap-2 text-sm text-stone-500 hover:text-stone-800">
          <LuArrowLeft className="h-4 w-4" />
          Песенник
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-bold text-stone-900">
          <LuMusic className="h-6 w-6 text-primary" />
          Новая песня
        </h1>
      </div>

      {/* Stepper */}
      <ol className="flex flex-wrap gap-2">
        {(['Вставка текста', 'Редактор и превью', 'Метаданные'] as const).map((label, i) => {
          const n = i + 1;
          const active = step === n;
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => n < step && setStep(n)}
                disabled={n > step}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-stone-900 text-white'
                    : n < step
                      ? 'bg-stone-200 text-stone-800 hover:bg-stone-300'
                      : 'bg-stone-100 text-stone-400'
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
          <p className="text-sm text-stone-600">
            Вставьте текст с сайта: аккорды строкой выше текста. Мы переведём его в ChordPro{' '}
            <code className="rounded bg-stone-100 px-1">[Am]Слово</code>.
          </p>
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDropFile}
            className={`rounded-2xl border-2 border-dashed p-4 transition-colors ${
              dropActive ? 'border-sky-500 bg-sky-50' : 'border-stone-200 bg-white'
            }`}
          >
            <textarea
              value={rawPaste}
              onChange={(e) => setRawPaste(e.target.value)}
              onBlur={() => setContent(applyConvert(rawPaste))}
              rows={14}
              placeholder={
                '   Am         C\n' +
                'Первая строка текста здесь\n\n' +
                'Или уже ChordPro: [Am]Первая строка'
              }
              className="w-full resize-y rounded-xl border border-stone-200 bg-white p-4 font-mono text-sm leading-relaxed text-stone-900 placeholder:text-stone-400"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setContent(applyConvert(rawPaste))}
                className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800"
              >
                <LuWand2 className="h-4 w-4" />
                Конвертировать в ChordPro
              </button>
              <span className="inline-flex items-center gap-1 text-xs text-stone-500">
                <LuUpload className="h-4 w-4" />
                Перетащите .txt или .chordpro
              </span>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={goNext}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white"
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
              onClick={onDetectKey}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50"
            >
              <LuSparkles className="h-4 w-4 text-amber-500" />
              Определить тональность
            </button>
            {keyHint && <span className="text-xs text-stone-600">{keyHint}</span>}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-bold uppercase text-stone-500">Редактор</p>
              <textarea
                ref={editorRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onSelect={syncEditorSelection}
                onKeyUp={syncEditorSelection}
                onMouseUp={syncEditorSelection}
                rows={18}
                className="w-full resize-y rounded-xl border border-stone-200 bg-white p-4 font-mono text-sm text-stone-900"
              />
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase text-stone-500">Превью</p>
              <div className="min-h-[12rem] rounded-xl border border-stone-200 bg-stone-50 p-4">
                <LyricsWithChords text={content} transposeSemitones={0} className="text-sm leading-relaxed text-stone-900" />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50/80 p-4">
            <p className="mb-2 text-xs font-bold uppercase text-amber-900">Быстрые аккорды</p>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className="text-xs text-stone-600">
                Тоника
                <select
                  value={quickRoot}
                  onChange={(e) => setQuickRoot(e.target.value)}
                  className="ml-2 rounded-lg border border-stone-200 bg-white px-2 py-1 text-sm"
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
                className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-sm"
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
                  className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-amber-950 shadow-sm ring-1 ring-amber-200 hover:bg-amber-100"
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
              className="inline-flex items-center gap-2 rounded-xl border border-stone-200 px-4 py-2 text-sm"
            >
              <LuArrowLeft className="h-4 w-4" />
              Назад
            </button>
            <button
              type="button"
              onClick={goNext}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white"
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
              <span className="text-xs font-bold uppercase text-stone-500">Название *</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
                placeholder="Название песни"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase text-stone-500">Тональность</span>
              <input
                value={defaultKey}
                onChange={(e) => setDefaultKey(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
                placeholder="G, Am, …"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase text-stone-500">BPM</span>
              <input
                type="number"
                value={tempo}
                onChange={(e) => setTempo(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
                placeholder="120"
              />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase text-stone-500">Размер</span>
              <input
                value={timeSig}
                onChange={(e) => setTimeSig(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
                placeholder="4/4"
              />
            </label>
          </div>

          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase text-stone-500">
              <LuYoutube className="h-4 w-4 text-red-600" />
              YouTube (опционально)
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                className="min-w-[200px] flex-1 rounded-xl border border-stone-200 px-3 py-2 text-sm"
                placeholder="https://www.youtube.com/watch?v=…"
              />
              <button
                type="button"
                onClick={() => void onFetchYoutube()}
                className="rounded-xl border border-stone-200 px-4 py-2 text-sm hover:bg-stone-50"
              >
                Подставить название
              </button>
            </div>
            <p className="mt-2 text-xs text-stone-500">
              Заголовок подтягивается через oEmbed (без API-ключа). При необходимости отредактируйте вручную.
            </p>
          </div>

          <label className="block">
            <span className="text-xs font-bold uppercase text-stone-500">Теги (через запятую)</span>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
              placeholder="worship, fast"
            />
          </label>

          {createMut.isError && (
            <p className="text-sm text-red-600">Не удалось сохранить. Проверьте поля и права.</p>
          )}

          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" onClick={goPrev} className="inline-flex items-center gap-2 rounded-xl border border-stone-200 px-4 py-2 text-sm">
              <LuArrowLeft className="h-4 w-4" />
              Назад
            </button>
            <button
              type="button"
              disabled={!title.trim() || createMut.isPending}
              onClick={() => createMut.mutate()}
              className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {createMut.isPending ? <LuLoader2 className="h-4 w-4 animate-spin" /> : null}
              Сохранить в каталог
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
