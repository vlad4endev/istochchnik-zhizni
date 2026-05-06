import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  LuFileSpreadsheet,
  LuFileText,
  LuLink2,
  LuLoader,
  LuPlay,
  LuSearch,
  LuSparkles,
  LuUpload,
  LuWand,
  LuX,
} from 'react-icons/lu';
import axios from 'axios';

import { extractTextFromPdfBufferWithMeta } from './extractTextFromPdf';
import { analyzeImportedSongText, type ImportedTextAnalysis } from './analyzeImportedSongText';
import { smartImportTextToChordPro } from './smartImportToBlocks';
import {
  aiSplitSongIntoBlocks,
  fetchImportUrlText,
  parseSongImportXlsxFile,
  startSongImportXlsxFile,
  type SongImportProgress,
  type SongImportResult,
  type XlsxImportParsedSong,
} from '../api';

export type SmartImportSourceTab = 'text' | 'pdf' | 'url';

type Props = {
  open: boolean;
  onClose: () => void;
  onApply: (payload: { raw: string; chordPro: string }) => void;
  initialRaw?: string;
  /** С какой вкладки открыть окно (после сброса при открытии). */
  initialTab?: SmartImportSourceTab;
  variant?: 'default' | 'studio';
};

export function SmartImportModal({
  open,
  onClose,
  onApply,
  initialRaw = '',
  initialTab = 'text',
  variant = 'default',
}: Props) {
  const baseId = useId();
  const [tab, setTab] = useState<SmartImportSourceTab>('text');
  const [raw, setRaw] = useState(initialRaw);
  const [dropActive, setDropActive] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [pdfBuffer, setPdfBuffer] = useState<ArrayBuffer | null>(null);
  const [pdfExtractedText, setPdfExtractedText] = useState('');
  const [pdfAnalysis, setPdfAnalysis] = useState<ImportedTextAnalysis | null>(null);
  const [pdfSafeModeInfo, setPdfSafeModeInfo] = useState<string | null>(null);
  const [pdfProgressText, setPdfProgressText] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiProgressText, setAiProgressText] = useState<string | null>(null);
  const aiProgressTimersRef = useRef<number[]>([]);
  const fileTxtRef = useRef<HTMLInputElement>(null);
  const filePdfRef = useRef<HTMLInputElement>(null);
  const fileXlsxRef = useRef<HTMLInputElement>(null);

  const [pdfFormat, setPdfFormat] = useState<'pdf' | 'xlsx'>('pdf');
  const [xlsxBusy, setXlsxBusy] = useState(false);
  const [xlsxError, setXlsxError] = useState<string | null>(null);
  const [xlsxName, setXlsxName] = useState<string | null>(null);
  const [xlsxSongs, setXlsxSongs] = useState<XlsxImportParsedSong[]>([]);
  const [xlsxSearch, setXlsxSearch] = useState('');
  const [xlsxParseErrors, setXlsxParseErrors] = useState<Array<{ row: number; field: string; message: string; value?: string }>>(
    [],
  );
  const [xlsxFile, setXlsxFile] = useState<File | null>(null);
  const [xlsxMassBusy, setXlsxMassBusy] = useState(false);
  const [xlsxJobId, setXlsxJobId] = useState<string | null>(null);
  const [xlsxProgress, setXlsxProgress] = useState<SongImportProgress | null>(null);
  const [xlsxResult, setXlsxResult] = useState<SongImportResult | null>(null);
  const xlsxEsRef = useRef<EventSource | null>(null);

  const isStudio = variant === 'studio';

  useEffect(() => {
    if (!open) return;
    setRaw(initialRaw);
    setTab(initialTab);
    setUrlInput('');
    setUrlError(null);
    setUrlBusy(false);
    setPdfError(null);
    setPdfBusy(false);
    setPdfName(null);
    setPdfBuffer(null);
    setPdfExtractedText('');
    setPdfAnalysis(null);
    setPdfSafeModeInfo(null);
    setPdfProgressText(null);
    setPdfFormat('pdf');
    setXlsxBusy(false);
    setXlsxError(null);
    setXlsxName(null);
    setXlsxFile(null);
    setXlsxSongs([]);
    setXlsxSearch('');
    setXlsxParseErrors([]);
    setXlsxMassBusy(false);
    setXlsxJobId(null);
    setXlsxProgress(null);
    setXlsxResult(null);
    xlsxEsRef.current?.close();
    xlsxEsRef.current = null;
    setAiBusy(false);
    setAiError(null);
    setAiProgressText(null);

    // cancel any previous staged progress timers
    for (const id of aiProgressTimersRef.current) {
      window.clearTimeout(id);
    }
    aiProgressTimersRef.current = [];
  }, [open, initialRaw, initialTab]);

  useEffect(() => {
    if (!xlsxJobId) return;
    xlsxEsRef.current?.close();
    setXlsxProgress(null);
    setXlsxResult(null);

    const es = new EventSource(`/api/song-import/progress/${encodeURIComponent(xlsxJobId)}`);
    xlsxEsRef.current = es;

    const onProgress = (ev: MessageEvent) => {
      try {
        setXlsxProgress(JSON.parse(ev.data) as SongImportProgress);
      } catch {
        // ignore
      }
    };
    const onDone = (ev: MessageEvent) => {
      try {
        setXlsxResult(JSON.parse(ev.data) as SongImportResult);
      } catch {
        // ignore
      } finally {
        es.close();
        xlsxEsRef.current = null;
        setXlsxMassBusy(false);
      }
    };

    es.addEventListener('progress', onProgress as any);
    es.addEventListener('done', onDone as any);
    es.onerror = () => {
      // In some auth modes EventSource may fail; surface a hint.
      setXlsxError((prev) => prev ?? 'Не удалось подключиться к прогрессу импорта. Откройте массовый импорт в админке.');
      es.close();
      xlsxEsRef.current = null;
      setXlsxMassBusy(false);
    };

    return () => {
      es.close();
      if (xlsxEsRef.current === es) xlsxEsRef.current = null;
    };
  }, [xlsxJobId]);

  const panel = isStudio
    ? 'border-zinc-600 bg-zinc-900 text-zinc-100'
    : 'border-stone-200 bg-white text-stone-900';
  const textarea = isStudio
    ? 'border-zinc-700 bg-zinc-950 text-zinc-100 placeholder:text-zinc-500'
    : 'border-stone-200 bg-white text-stone-900 placeholder:text-stone-400';
  const muted = isStudio ? 'text-zinc-400' : 'text-stone-500';
  const btnPrimary = isStudio
    ? 'bg-sky-600 text-white hover:bg-sky-500'
    : 'bg-stone-900 text-white hover:bg-stone-800';
  const btnGhost = isStudio
    ? 'border-zinc-600 text-zinc-200 hover:bg-zinc-800'
    : 'border-stone-200 text-stone-800 hover:bg-stone-50';
  const tabInactive = isStudio ? 'text-zinc-400 hover:bg-zinc-800/80' : 'text-stone-600 hover:bg-stone-100';
  const tabActive = isStudio ? 'bg-zinc-800 text-white shadow-sm' : 'bg-white text-stone-900 shadow-sm';

  const readTextFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setRaw(text);
    };
    reader.readAsText(f, 'UTF-8');
  };

  const onDropFile = (e: React.DragEvent) => {
    e.preventDefault();
    setDropActive(false);
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (/\.pdf$/i.test(f.name)) {
      setPdfName(f.name);
      setPdfError(null);
      void f.arrayBuffer().then((b) => setPdfBuffer(b));
      setTab('pdf');
      return;
    }
    if (!/\.(txt|chordpro|chopro|cho|cpm|pro)$/i.test(f.name)) return;
    readTextFile(f);
    setTab('text');
  };

  const onPickTxt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    readTextFile(f);
    setTab('text');
  };

  const onPickPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) {
      setPdfError('Файл слишком большой. Максимум 20 МБ.');
      return;
    }
    if (!f.name.toLowerCase().endsWith('.pdf') && f.type !== 'application/pdf') {
      setPdfError('Пожалуйста, выберите PDF файл.');
      return;
    }
    setPdfName(f.name);
    setPdfError(null);
    setPdfBuffer(await f.arrayBuffer());
  };

  const onPickXlsx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      setXlsxError('Файл слишком большой. Максимум 8 МБ.');
      return;
    }
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      setXlsxError('Пожалуйста, выберите .xlsx файл.');
      return;
    }
    setXlsxName(f.name);
    setXlsxFile(f);
    setXlsxError(null);
    setXlsxBusy(true);
    try {
      const parsed = await parseSongImportXlsxFile(f);
      setXlsxSongs(parsed.songs ?? []);
      setXlsxParseErrors(parsed.errors ?? []);
      if ((parsed.errors?.length ?? 0) > 0) {
        setXlsxError(
          `В файле найдены ошибки: ${parsed.errors.length}. Ниже список — исправьте и загрузите файл заново.`,
        );
      }
    } catch (err) {
      let msg = 'Не удалось прочитать XLSX';
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { error?: string } | undefined;
        if (d?.error) msg = d.error;
      } else if (err instanceof Error && err.message) {
        msg = err.message;
      }
      setXlsxError(msg);
    } finally {
      setXlsxBusy(false);
    }
  };

  const downloadXlsxErrorsJson = () => {
    const blob = new Blob([JSON.stringify({ errors: xlsxParseErrors }, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xlsx-import-errors-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const startXlsxMassImport = async () => {
    if (!xlsxFile) return;
    setXlsxMassBusy(true);
    setXlsxError(null);
    setXlsxJobId(null);
    setXlsxProgress(null);
    setXlsxResult(null);
    try {
      const r = await startSongImportXlsxFile(xlsxFile);
      setXlsxJobId(r.jobId);
    } catch (err) {
      let msg = 'Не удалось запустить массовый импорт';
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { error?: string } | undefined;
        if (d?.error) msg = d.error;
      } else if (err instanceof Error && err.message) {
        msg = err.message;
      }
      setXlsxError(msg);
      setXlsxMassBusy(false);
    }
  };

  const runPdfExtract = async () => {
    const buf = pdfBuffer;
    if (!buf || buf.byteLength === 0) {
      setPdfError('Сначала выберите PDF-файл.');
      return;
    }
    setPdfBusy(true);
    setPdfError(null);
    setPdfSafeModeInfo(null);
    setPdfProgressText('Подготовка распознавания PDF…');
    try {
      const { text, mode } = await extractTextFromPdfBufferWithMeta(buf, {
        onProgress: (p) => setPdfProgressText(p.message),
      });
      if (!text.trim()) {
        setPdfError('В PDF не найден текст (возможно, только картинки). Скопируйте текст вручную во вкладке «Текст».');
        return;
      }
      setPdfExtractedText(text);
      let analysis = null;
      try {
        analysis = analyzeImportedSongText(text);
      } catch {
        /* разбор метаданных не критичен для извлечения текста */
      }
      setPdfAnalysis(analysis);
      if (mode === 'safe-main-thread') {
        setPdfSafeModeInfo(
          'PDF прочитан в безопасном режиме (без worker). Это обход MIME-ограничений сервера и не влияет на результат распознавания текста.',
        );
      } else if (mode === 'ocr-fallback') {
        setPdfSafeModeInfo(
          'Текстовый слой PDF не читается или использует нестандартную кодировку — применён OCR (распознавание изображения). ' +
          'Проверьте орфографию и аккорды перед загрузкой.',
        );
      }
    } catch (err) {
      const details = err instanceof Error && err.message ? err.message : '';
      const isOcrUnavailable =
        details.includes('OCR-модуль недоступен') ||
        details.includes('OCR не помог') ||
        details.includes('даже после OCR');
      if (isOcrUnavailable) {
        setPdfError(
          'PDF содержит только изображения, а OCR-модуль сейчас недоступен. ' +
          'Попробуйте PDF с текстовым слоем или введите текст вручную.',
        );
      } else {
        const base = 'Не удалось прочитать PDF.';
        setPdfError(details ? `${base} ${details}` : `${base} Проверьте файл или попробуйте экспорт в текст из другого приложения.`);
      }
    } finally {
      setPdfProgressText(null);
      setPdfBusy(false);
    }
  };

  const filteredXlsxSongs = useMemo(() => {
    const q = xlsxSearch.trim().toLowerCase();
    const list = xlsxSongs ?? [];
    if (!q) return list.slice(0, 60);
    const out = list.filter((s) => {
      const blob = `${s.song_number} ${s.title} ${s.table_of_contents}`.toLowerCase();
      return blob.includes(q);
    });
    return out.slice(0, 60);
  }, [xlsxSongs, xlsxSearch]);

  // IMPORTANT: all hooks must run before conditional return
  if (!open) return null;

  const importFromXlsxRow = async (song: XlsxImportParsedSong, mode: 'chords' | 'lyrics') => {
    const url = mode === 'chords' ? song.url_chords : song.url_lyrics;
    if (!url?.trim()) {
      setXlsxError('В выбранной строке нет ссылки для загрузки.');
      return;
    }
    setXlsxBusy(true);
    setXlsxError(null);
    try {
      const { text } = await fetchImportUrlText(url);
      if (!text.trim()) {
        setXlsxError('По ссылке пришёл пустой текст.');
        return;
      }
      setRaw(text);
      setTab('text');
    } catch (err) {
      let msg = 'Не удалось загрузить текст песни';
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { error?: string } | undefined;
        if (d?.error) msg = d.error;
      } else if (err instanceof Error && err.message) {
        msg = err.message;
      }
      setXlsxError(msg);
    } finally {
      setXlsxBusy(false);
    }
  };

  const applyPdfAndContinueEditing = () => {
    if (!pdfExtractedText.trim()) return;
    setRaw(pdfExtractedText);
    setTab('text');
  };

  const runAiSplit = async (sourceText: string) => {
    const t = sourceText.trim();
    if (!t) return;
    setAiBusy(true);
    setAiError(null);
    setAiProgressText('Отправляем текст в ИИ…');

    // staged progress so user sees "what is happening" while waiting
    for (const id of aiProgressTimersRef.current) {
      window.clearTimeout(id);
    }
    aiProgressTimersRef.current = [
      window.setTimeout(() => setAiProgressText('ИИ анализирует текст и выделяет секции…'), 900),
      window.setTimeout(() => setAiProgressText('ИИ формирует блоки (куплет/припев/бридж)…'), 2400),
      window.setTimeout(() => setAiProgressText('Проверяем и подготавливаем результат…'), 4200),
    ];

    try {
      const { chordPro } = await aiSplitSongIntoBlocks(t);
      const next = typeof chordPro === 'string' ? chordPro : '';
      if (!next.trim()) {
        setAiError('ИИ вернул пустой результат. Попробуйте ещё раз.');
        return;
      }
      setRaw(next);
      setTab('text');
      setAiProgressText('Готово: секции добавлены. Можно редактировать и вставлять в форму.');
    } catch (err) {
      let msg = 'Не удалось разметить через ИИ';
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { error?: string } | undefined;
        if (d?.error) msg = d.error;
      } else if (err instanceof Error && err.message) {
        msg = err.message;
      }
      setAiError(msg);
    } finally {
      setAiBusy(false);
      for (const id of aiProgressTimersRef.current) {
        window.clearTimeout(id);
      }
      aiProgressTimersRef.current = [];
      // leave success text for a moment; clear on error or next open/reset
      if (aiError) setAiProgressText(null);
    }
  };

  const applyPdfImmediately = () => {
    if (!pdfExtractedText.trim()) return;
    onApply({ raw: pdfExtractedText, chordPro: smartImportTextToChordPro(pdfExtractedText) });
    onClose();
  };

  const runUrlFetch = async () => {
    const u = urlInput.trim();
    if (!u) {
      setUrlError('Вставьте ссылку');
      return;
    }
    setUrlBusy(true);
    setUrlError(null);
    try {
      const { text } = await fetchImportUrlText(u);
      if (!text.trim()) {
        setUrlError('По ссылке пришёл пустой ответ.');
        return;
      }
      setRaw(text);
      setTab('text');
    } catch (err) {
      let msg = 'Не удалось загрузить';
      if (axios.isAxiosError(err)) {
        const d = err.response?.data as { error?: string } | undefined;
        if (d?.error) msg = d.error;
      } else if (err instanceof Error && err.message) {
        msg = err.message;
      }
      setUrlError(msg);
    } finally {
      setUrlBusy(false);
    }
  };

  const handleApply = () => {
    const chordPro = smartImportTextToChordPro(raw);
    onApply({ raw, chordPro });
    onClose();
  };

  const tabBtn = (id: SmartImportSourceTab, label: string, Icon: typeof LuFileText) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={tab === id}
      id={`${baseId}-tab-${id}`}
      aria-controls={`${baseId}-panel-${id}`}
      onClick={() => setTab(id)}
      className={[
        'inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-colors sm:text-sm',
        tab === id ? tabActive : tabInactive,
      ].join(' ')}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4"
      role="dialog"
      aria-modal
      aria-labelledby="smart-import-title"
      onClick={onClose}
    >
      <div
        className={`max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border p-4 shadow-2xl sm:p-6 ${panel}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="smart-import-title" className="text-lg font-bold leading-tight">
              Импорт текста песни
            </h2>
            <p className={`mt-1.5 text-sm leading-relaxed ${muted}`}>
              Выберите источник: вставьте текст, загрузите PDF (текстовый слой) или укажите ссылку на текстовый файл
              либо на PDF (до 6 МБ). Затем нажмите «Вставить в форму» — аккорды над строками будут приведены к
              ChordPro.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`shrink-0 rounded-lg p-2 ${isStudio ? 'text-zinc-400 hover:bg-zinc-800' : 'text-stone-500 hover:bg-stone-100'}`}
            aria-label="Закрыть"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <div
          className={`mb-4 flex gap-1 rounded-xl p-1 ${isStudio ? 'bg-zinc-950/80' : 'bg-stone-100'}`}
          role="tablist"
          aria-label="Способ импорта"
        >
          {tabBtn('text', 'Текст', LuFileText)}
          {tabBtn('pdf', 'PDF', LuUpload)}
          {tabBtn('url', 'Ссылка', LuLink2)}
        </div>

        <input ref={fileTxtRef} type="file" accept=".txt,.cho,.chopro,.chordpro,.cpm,.pro,text/plain" className="hidden" onChange={onPickTxt} />
        <input ref={filePdfRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={onPickPdf} />
        <input ref={fileXlsxRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={onPickXlsx} />

        {tab === 'text' ? (
          <div
            id={`${baseId}-panel-text`}
            role="tabpanel"
            aria-labelledby={`${baseId}-tab-text`}
            onDragEnter={(e) => {
              e.preventDefault();
              setDropActive(true);
            }}
            onDragLeave={() => setDropActive(false)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDropFile}
            className={`rounded-xl border-2 border-dashed p-3 transition-colors ${
              dropActive
                ? isStudio
                  ? 'border-sky-500 bg-sky-950/40'
                  : 'border-sky-500 bg-sky-50'
                : isStudio
                  ? 'border-zinc-700'
                  : 'border-stone-200'
            }`}
          >
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={14}
              placeholder={'Вставьте текст с аккордами над строками или уже в ChordPro:\n\n   Am         C\nСтрока…\n\n[Am]ChordPro'}
              className={`w-full resize-y rounded-lg border p-3 font-mono text-sm leading-relaxed ${textarea}`}
            />
            {aiError ? <p className="mt-2 text-sm text-red-500">{aiError}</p> : null}
            {aiBusy && aiProgressText ? <p className={`mt-2 text-sm ${muted}`}>{aiProgressText}</p> : null}
            <div className={`mt-3 flex flex-col gap-2 text-xs sm:flex-row sm:flex-wrap sm:items-center ${muted}`}>
              <button
                type="button"
                onClick={() => fileTxtRef.current?.click()}
                className={`w-full rounded-lg border px-3 py-2 text-xs font-semibold sm:w-auto ${btnGhost}`}
              >
                Выбрать .txt / ChordPro
              </button>
              <button
                type="button"
                disabled={aiBusy || !raw.trim()}
                onClick={() => void runAiSplit(raw)}
                className={`inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50 sm:w-auto ${btnGhost}`}
                title={!raw.trim() ? 'Сначала вставьте текст' : 'ИИ разложит текст по секциям и вернёт ChordPro'}
              >
                {aiBusy ? <LuLoader className="h-4 w-4 animate-spin" /> : <LuSparkles className="h-4 w-4" />}
                ИИ: по блокам
              </button>
              <span className="inline-flex items-center justify-center gap-1 sm:justify-start">
                <LuUpload className="h-4 w-4" aria-hidden />
                Можно перетащить файл сюда (.txt, .cho, .pdf → откроется вкладка PDF)
              </span>
            </div>
          </div>
        ) : null}

        {tab === 'pdf' ? (
          <div id={`${baseId}-panel-pdf`} role="tabpanel" aria-labelledby={`${baseId}-tab-pdf`} className="space-y-4">
            <div className={`rounded-[10px] ${isStudio ? 'bg-zinc-950/70' : 'bg-stone-100'} p-1`}>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  className={
                    pdfFormat === 'pdf'
                      ? `rounded-lg px-3 py-2.5 text-sm font-semibold shadow ${isStudio ? 'bg-zinc-800 text-white' : 'bg-white text-stone-900'}`
                      : `rounded-lg px-3 py-2.5 text-sm font-semibold ${muted}`
                  }
                  onClick={() => setPdfFormat('pdf')}
                >
                  PDF
                </button>
                <button
                  type="button"
                  className={
                    pdfFormat === 'xlsx'
                      ? `rounded-lg px-3 py-2.5 text-sm font-semibold shadow ${isStudio ? 'bg-zinc-800 text-white' : 'bg-white text-stone-900'}`
                      : `rounded-lg px-3 py-2.5 text-sm font-semibold ${muted}`
                  }
                  onClick={() => setPdfFormat('xlsx')}
                >
                  XLSX
                </button>
              </div>
            </div>

            {pdfFormat === 'pdf' ? (
              <>
                <p className={`text-sm leading-relaxed ${muted}`}>
                  Перетащите PDF сюда или нажмите для выбора. Подойдёт PDF с выделяемым текстом (не скан без OCR).
                </p>
            <div
              className={`rounded-xl border-2 border-dashed p-4 ${
                isStudio ? 'border-zinc-700 bg-zinc-950/60' : 'border-stone-200 bg-stone-50'
              }`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (!f) return;
                if (!/\.pdf$/i.test(f.name)) {
                  setPdfError('Нужен PDF-файл.');
                  return;
                }
                setPdfName(f.name);
                setPdfError(null);
                void f.arrayBuffer().then((b) => setPdfBuffer(b));
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => filePdfRef.current?.click()}
                  className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold ${btnGhost}`}
                >
                  <LuUpload className="h-4 w-4" />
                  Выбрать PDF
                </button>
                {pdfName ? (
                  <span className={`text-sm ${isStudio ? 'text-zinc-300' : 'text-stone-700'}`}>{pdfName}</span>
                ) : (
                  <span className={`text-sm ${muted}`}>Файл не выбран</span>
                )}
              </div>
              <p className={`mt-2 text-xs ${muted}`}>Drag & drop работает прямо в эту область.</p>
            </div>
            {pdfError ? <p className="text-sm text-red-500">{pdfError}</p> : null}
            {pdfBusy && pdfProgressText ? (
              <p className={`text-xs ${muted}`}>{pdfProgressText}</p>
            ) : null}
            {pdfSafeModeInfo ? (
              <p
                className={`rounded-lg px-3 py-2 text-xs ${
                  isStudio ? 'bg-sky-950/40 text-sky-200' : 'bg-sky-50 text-sky-900'
                }`}
              >
                {pdfSafeModeInfo}
              </p>
            ) : null}
            <button
              type="button"
              disabled={pdfBusy || !pdfBuffer}
              onClick={() => void runPdfExtract()}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50 ${btnPrimary}`}
            >
              {pdfBusy ? <LuLoader className="h-4 w-4 animate-spin" /> : null}
              Извлечь текст из PDF
            </button>

            {pdfExtractedText.trim() ? (
              <div className={`space-y-3 rounded-xl border p-3 ${isStudio ? 'border-zinc-700 bg-zinc-950/50' : 'border-stone-200 bg-white'}`}>
                <p className={`text-sm font-medium ${isStudio ? 'text-zinc-100' : 'text-stone-900'}`}>
                  Предпросмотр извлечённого текста
                </p>
                <textarea
                  value={pdfExtractedText}
                  onChange={(e) => {
                    const next = e.target.value;
                    setPdfExtractedText(next);
                    setPdfAnalysis(analyzeImportedSongText(next));
                  }}
                  rows={8}
                  className={`w-full resize-y rounded-lg border p-3 font-mono text-sm ${textarea}`}
                />
                {pdfAnalysis ? (
                  <div className={`space-y-2 rounded-lg p-2 text-xs ${isStudio ? 'bg-zinc-900 text-zinc-300' : 'bg-stone-50 text-stone-700'}`}>
                    <p>
                      Мы нашли <strong>{pdfAnalysis.chordCount}</strong> аккордов и <strong>{pdfAnalysis.sectionCount}</strong>{' '}
                      блоков. Всё верно?
                    </p>
                    {pdfAnalysis.sectionTitles.length > 0 ? (
                      <p>Блоки: {pdfAnalysis.sectionTitles.join(', ')}</p>
                    ) : null}
                    {pdfAnalysis.uncertainChords.length > 0 ? (
                      <p className="text-amber-500">
                        Проверьте сомнительные аккорды: {pdfAnalysis.uncertainChords.join(', ')}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {aiError ? <p className="text-sm text-red-500">{aiError}</p> : null}
                {aiBusy && aiProgressText ? <p className={`text-sm ${muted}`}>{aiProgressText}</p> : null}
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <button
                    type="button"
                    onClick={applyPdfImmediately}
                    className={`inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold sm:w-auto ${btnPrimary}`}
                  >
                    Загрузить
                  </button>
                  <button
                    type="button"
                    disabled={aiBusy}
                    onClick={() => void runAiSplit(pdfExtractedText)}
                    className={`inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50 sm:w-auto ${btnGhost}`}
                  >
                    {aiBusy ? <LuLoader className="h-4 w-4 animate-spin" /> : <LuSparkles className="h-4 w-4" />}
                    ИИ: распределить по блокам
                  </button>
                  <button
                    type="button"
                    onClick={applyPdfAndContinueEditing}
                    className={`w-full rounded-xl border px-4 py-2 text-sm sm:w-auto ${btnGhost}`}
                  >
                    Редактировать перед загрузкой
                  </button>
                </div>
              </div>
            ) : null}
              </>
            ) : (
              <>
                <p className={`text-sm leading-relaxed ${muted}`}>
                  Загрузите таблицу песен `.xlsx`, найдите песню и импортируйте текст (с аккордами в приоритете).
                </p>
                <div className={`rounded-xl border p-4 ${isStudio ? 'border-zinc-700 bg-zinc-950/60' : 'border-stone-200 bg-stone-50'}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileXlsxRef.current?.click()}
                      className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold ${btnGhost}`}
                    >
                      <LuFileSpreadsheet className="h-4 w-4" />
                      Выбрать XLSX
                    </button>
                    {xlsxName ? (
                      <span className={`text-sm ${isStudio ? 'text-zinc-300' : 'text-stone-700'}`}>{xlsxName}</span>
                    ) : (
                      <span className={`text-sm ${muted}`}>Файл не выбран</span>
                    )}
                  </div>
                  {xlsxError ? <p className="mt-2 text-sm text-red-500">{xlsxError}</p> : null}
                  {xlsxBusy ? <p className={`mt-2 text-xs ${muted}`}>Читаем XLSX…</p> : null}
                  {xlsxParseErrors.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className={`text-xs ${muted}`}>Ошибки файла (первые 12):</p>
                        <button
                          type="button"
                          onClick={downloadXlsxErrorsJson}
                          className={`inline-flex min-h-[36px] items-center justify-center rounded-lg border px-3 text-xs font-semibold ${btnGhost}`}
                        >
                          Скачать отчёт (JSON)
                        </button>
                      </div>
                      <ul className={`rounded-xl border p-3 text-xs ${isStudio ? 'border-zinc-700 bg-zinc-950/40 text-zinc-200' : 'border-stone-200 bg-white text-stone-800'}`}>
                        {xlsxParseErrors.slice(0, 12).map((e, idx) => (
                          <li key={`${e.row}-${e.field}-${idx}`} className="py-1">
                            <strong>Строка {e.row}</strong>, поле <strong>{e.field}</strong>: {e.message}
                            {typeof e.value === 'string' && e.value.trim() ? (
                              <>
                                {' '}
                                <span className={muted}>(значение: {e.value})</span>
                              </>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <button
                      type="button"
                      disabled={!xlsxFile || xlsxMassBusy || xlsxParseErrors.length > 0}
                      onClick={() => void startXlsxMassImport()}
                      className={`inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50 sm:w-auto ${btnPrimary}`}
                      title={xlsxParseErrors.length > 0 ? 'Сначала исправьте ошибки файла и загрузите заново.' : undefined}
                    >
                      {xlsxMassBusy ? <LuLoader className="h-4 w-4 animate-spin" /> : <LuPlay className="h-4 w-4" />}
                      Импортировать все в каталог
                    </button>
                    {xlsxJobId ? (
                      <p className={`text-xs ${muted}`}>
                        Job: <span className={isStudio ? 'text-zinc-200' : 'text-stone-700'}>{xlsxJobId}</span>
                      </p>
                    ) : null}
                  </div>
                  {xlsxProgress ? (
                    <p className={`mt-2 text-xs ${muted}`}>
                      {xlsxProgress.current}/{xlsxProgress.total} — {xlsxProgress.song_title} ({xlsxProgress.status})
                    </p>
                  ) : null}
                  {xlsxResult ? (
                    <p className={`mt-2 text-xs ${muted}`}>
                      Готово. Успешно: <strong>{xlsxResult.success}</strong>, ошибок: <strong>{xlsxResult.failed}</strong>, пропущено:{' '}
                      <strong>{xlsxResult.skipped}</strong>.
                    </p>
                  ) : null}

                  {xlsxSongs.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${isStudio ? 'border-zinc-700 bg-zinc-950' : 'border-stone-200 bg-white'}`}>
                        <LuSearch className={`h-4 w-4 ${muted}`} />
                        <input
                          value={xlsxSearch}
                          onChange={(e) => setXlsxSearch(e.target.value)}
                          placeholder="Поиск по номеру или названию…"
                          className={`w-full bg-transparent text-sm outline-none ${isStudio ? 'text-zinc-100 placeholder:text-zinc-500' : 'text-stone-900 placeholder:text-stone-400'}`}
                        />
                      </div>
                      <div className={`max-h-[360px] overflow-auto rounded-xl border ${isStudio ? 'border-zinc-700' : 'border-stone-200'}`}>
                        <ul className={`${isStudio ? 'divide-y divide-zinc-800' : 'divide-y divide-stone-200'}`}>
                          {filteredXlsxSongs.map((s) => (
                            <li key={s.external_id} className={`p-3 ${isStudio ? 'bg-zinc-950/40' : 'bg-white'}`}>
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <p className={`truncate text-sm font-semibold ${isStudio ? 'text-zinc-100' : 'text-stone-900'}`}>
                                    {s.song_number}. {s.title}
                                  </p>
                                  <p className={`truncate text-xs ${muted}`}>{s.table_of_contents}</p>
                                </div>
                                <div className="flex flex-col gap-2 sm:flex-row">
                                  <button
                                    type="button"
                                    disabled={xlsxBusy}
                                    onClick={() => void importFromXlsxRow(s, 'chords')}
                                    className={`inline-flex min-h-[40px] items-center justify-center rounded-lg px-3 text-xs font-semibold disabled:opacity-50 ${btnPrimary}`}
                                  >
                                    С аккордами
                                  </button>
                                  <button
                                    type="button"
                                    disabled={xlsxBusy}
                                    onClick={() => void importFromXlsxRow(s, 'lyrics')}
                                    className={`inline-flex min-h-[40px] items-center justify-center rounded-lg border px-3 text-xs font-semibold disabled:opacity-50 ${btnGhost}`}
                                  >
                                    Без аккордов
                                  </button>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <p className={`text-xs ${muted}`}>Показано: {filteredXlsxSongs.length} (из {xlsxSongs.length}).</p>
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        ) : null}

        {tab === 'url' ? (
          <div id={`${baseId}-panel-url`} role="tabpanel" aria-labelledby={`${baseId}-tab-url`} className="space-y-4">
            <p className={`text-sm leading-relaxed ${muted}`}>
              Укажите прямую ссылку на файл в интернете (например <code className={isStudio ? 'text-sky-300' : 'text-stone-700'}>https://…/pesnya.txt</code>
              ) или ссылку на страницу Telegraph (<code className={isStudio ? 'text-sky-300' : 'text-stone-700'}>https://telegra.ph/…</code>). Загрузка идёт через сервер приложения:
              доступны только публичные адреса (локальная сеть недоступна).
            </p>
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/song.txt"
              className={`w-full min-h-[48px] rounded-xl border px-3 py-2.5 text-sm outline-none ${textarea}`}
            />
            {urlError ? <p className="text-sm text-red-500">{urlError}</p> : null}
            <button
              type="button"
              disabled={urlBusy}
              onClick={() => void runUrlFetch()}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50 ${btnPrimary}`}
            >
              {urlBusy ? <LuLoader className="h-4 w-4 animate-spin" /> : null}
              Загрузить по ссылке
            </button>
          </div>
        ) : null}

        <div
          className={`mt-5 flex flex-wrap items-center gap-2 border-t pt-4 sm:justify-between ${
            isStudio ? 'border-zinc-800' : 'border-stone-200'
          }`}
        >
          <p className={`w-full text-xs sm:w-auto ${muted}`}>
            Длина текста: {raw.length.toLocaleString('ru-RU')} симв.
          </p>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            <button type="button" onClick={onClose} className={`rounded-xl border px-4 py-2.5 text-sm ${btnGhost}`}>
              Отмена
            </button>
            <button
              type="button"
              disabled={!raw.trim()}
              onClick={handleApply}
              className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40 ${btnPrimary}`}
            >
              <LuWand className="h-4 w-4" />
              Вставить в форму
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
