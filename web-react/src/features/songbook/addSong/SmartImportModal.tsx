import { useEffect, useId, useRef, useState } from 'react';
import { LuFileText, LuLink2, LuLoader, LuUpload, LuWand, LuX } from 'react-icons/lu';
import axios from 'axios';

import { convertToChordPro } from './chordProConversion';
import { extractTextFromPdfBufferWithMeta } from './extractTextFromPdf';
import { analyzeImportedSongText, type ImportedTextAnalysis } from './analyzeImportedSongText';
import { fetchImportUrlText } from '../api';

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
  const fileTxtRef = useRef<HTMLInputElement>(null);
  const filePdfRef = useRef<HTMLInputElement>(null);

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
  }, [open, initialRaw, initialTab]);

  if (!open) return null;

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

  const applyPdfAndContinueEditing = () => {
    if (!pdfExtractedText.trim()) return;
    setRaw(pdfExtractedText);
    setTab('text');
  };

  const applyPdfImmediately = () => {
    if (!pdfExtractedText.trim()) return;
    onApply({ raw: pdfExtractedText, chordPro: convertToChordPro(pdfExtractedText) });
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
    const chordPro = convertToChordPro(raw);
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
            <div className={`mt-3 flex flex-wrap items-center gap-2 text-xs ${muted}`}>
              <button
                type="button"
                onClick={() => fileTxtRef.current?.click()}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold ${btnGhost}`}
              >
                Выбрать .txt / ChordPro
              </button>
              <span className="inline-flex items-center gap-1">
                <LuUpload className="h-4 w-4" aria-hidden />
                Можно перетащить файл сюда (.txt, .cho, .pdf → откроется вкладка PDF)
              </span>
            </div>
          </div>
        ) : null}

        {tab === 'pdf' ? (
          <div id={`${baseId}-panel-pdf`} role="tabpanel" aria-labelledby={`${baseId}-tab-pdf`} className="space-y-4">
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
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={applyPdfImmediately}
                    className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${btnPrimary}`}
                  >
                    Загрузить
                  </button>
                  <button
                    type="button"
                    onClick={applyPdfAndContinueEditing}
                    className={`rounded-xl border px-4 py-2 text-sm ${btnGhost}`}
                  >
                    Редактировать перед загрузкой
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'url' ? (
          <div id={`${baseId}-panel-url`} role="tabpanel" aria-labelledby={`${baseId}-tab-url`} className="space-y-4">
            <p className={`text-sm leading-relaxed ${muted}`}>
              Укажите прямую ссылку на файл в интернете (например <code className={isStudio ? 'text-sky-300' : 'text-stone-700'}>https://…/pesnya.txt</code>
              ). Загрузка идёт через сервер приложения: доступны только публичные адреса, не HTML-страницы и не
              локальная сеть.
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
