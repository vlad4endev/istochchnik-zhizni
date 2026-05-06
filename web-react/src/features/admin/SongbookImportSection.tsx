import { useEffect, useMemo, useRef, useState } from 'react';
import { LuFileSpreadsheet, LuLoader, LuPlay, LuRefreshCcw, LuSave } from 'react-icons/lu';

import { apiClient } from '../../lib/apiClient';

type ParsedSongPreview = {
  external_id: string;
  song_number: number;
  title: string;
  table_of_contents: string;
  url_lyrics: string;
  url_chords: string;
  url_youtube: string | null;
};

type ValidationError = {
  row: number;
  field: string;
  message: string;
  value?: string;
};

type PreviewResponse = {
  totalRows: number;
  parsedSongs: number;
  preview: ParsedSongPreview[];
  errors: ValidationError[];
};

type ImportProgress = {
  current: number;
  total: number;
  song_title: string;
  status: 'fetching' | 'saving' | 'done' | 'error';
  message?: string;
};

type ImportResult = {
  success: number;
  failed: number;
  skipped: number;
  errors: Array<{ song_number: number; title: string; error: string }>;
};

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function postXlsxPreview(file: File): Promise<PreviewResponse> {
  const fd = new FormData();
  fd.set('file', file);
  const { data } = await apiClient.post<PreviewResponse>('/api/song-import/preview', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

async function postXlsxStart(file: File): Promise<{ jobId: string; total: number }> {
  const fd = new FormData();
  fd.set('file', file);
  const { data } = await apiClient.post<{ jobId: string; total: number }>('/api/song-import/start', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

async function postRetryFailed(): Promise<{ jobId: string; total: number } | { ok: true; total: 0; message: string }> {
  const { data } = await apiClient.post('/api/song-import/retry-failed', {});
  return data as any;
}

async function getSnapshot(jobId: string): Promise<{
  total: number;
  done: boolean;
  progress: ImportProgress | null;
  result: ImportResult | null;
  log: Array<{ ts: number; kind: string; message: string }>;
}> {
  const { data } = await apiClient.get(`/api/song-import/snapshot/${encodeURIComponent(jobId)}`);
  return data as any;
}

export function SongbookImportSection() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [busyPreview, setBusyPreview] = useState(false);
  const [busyStart, setBusyStart] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [log, setLog] = useState<Array<{ ts: number; kind: string; message: string }>>([]);
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const canStart = file != null && (preview?.errors?.length ?? 0) === 0;

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const startPolling = (id: string) => {
    stopPolling();
    pollRef.current = setInterval(() => {
      void (async () => {
        try {
          const snap = await getSnapshot(id);
          setProgress(snap.progress ?? null);
          setResult(snap.result ?? null);
          if (Array.isArray(snap.log)) setLog(snap.log);
          if (snap.done) stopPolling();
        } catch (e) {
          // polling is a fallback; keep quiet unless it permanently fails
          const msg = e instanceof Error ? e.message : '';
          if (msg) setError((prev) => prev ?? msg);
        }
      })();
    }, 1200);
  };

  const setXlsx = async (f: File) => {
    setFile(f);
    setPreview(null);
    setJobId(null);
    setProgress(null);
    setResult(null);
    setLog([]);
    setError(null);
    esRef.current?.close();
    stopPolling();

    setBusyPreview(true);
    try {
      const p = await postXlsxPreview(f);
      setPreview(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось прочитать файл');
    } finally {
      setBusyPreview(false);
    }
  };

  const start = async () => {
    if (!file) return;
    setBusyStart(true);
    setError(null);
    setResult(null);
    setLog([]);
    try {
      const r = await postXlsxStart(file);
      setJobId(r.jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось запустить импорт');
    } finally {
      setBusyStart(false);
    }
  };

  const retryFailed = async () => {
    setBusyStart(true);
    setError(null);
    setResult(null);
    setLog([]);
    try {
      const r = await postRetryFailed();
      if ('ok' in r && r.ok === true && r.total === 0) {
        setError(r.message);
        return;
      }
      setJobId((r as any).jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось запустить повтор');
    } finally {
      setBusyStart(false);
    }
  };

  useEffect(() => {
    if (!jobId) return;
    esRef.current?.close();
    const es = new EventSource(`/api/song-import/progress/${encodeURIComponent(jobId)}`);
    esRef.current = es;

    const onSnapshot = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as { progress?: ImportProgress | null; result?: ImportResult | null; log?: any[] };
        setProgress(data.progress ?? null);
        setResult(data.result ?? null);
        if (Array.isArray(data.log)) setLog(data.log);
      } catch {
        // ignore
      }
    };
    const onProgress = (ev: MessageEvent) => {
      try {
        const p = JSON.parse(ev.data) as ImportProgress;
        setProgress(p);
      } catch {
        // ignore
      }
    };
    const onDone = (ev: MessageEvent) => {
      try {
        const r = JSON.parse(ev.data) as ImportResult;
        setResult(r);
      } catch {
        // ignore
      } finally {
        es.close();
      }
    };

    es.addEventListener('snapshot', onSnapshot as any);
    es.addEventListener('progress', onProgress as any);
    es.addEventListener('done', onDone as any);
    es.onerror = () => {
      // Fallback for bearer-only sessions: EventSource can't send Authorization header.
      startPolling(jobId);
      es.close();
    };

    return () => {
      es.close();
      stopPolling();
    };
  }, [jobId]);

  const progressLabel = useMemo(() => {
    if (!progress) return '';
    return `${progress.current}/${progress.total} — ${progress.song_title}`;
  }, [progress]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-stone-900">Импорт песен из XLSX</h3>
            <p className="mt-1 text-xs text-stone-500">
              Загрузите `.xlsx` с колонками ID/Номер/Наименование/Оглавление/Telegraph ссылки. Импорт идёт последовательно с задержкой, чтобы не получить бан.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100">
            <LuFileSpreadsheet className="h-4 w-4" />
            Выбрать XLSX
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void setXlsx(f);
              }}
            />
          </label>
        </div>

        {busyPreview ? (
          <p className="mt-3 inline-flex items-center gap-2 text-xs text-stone-600">
            <LuLoader className="h-4 w-4 animate-spin" /> Читаем XLSX и валидируем…
          </p>
        ) : null}

        {file ? (
          <p className="mt-3 text-xs text-stone-600">
            Файл: <span className="font-semibold text-stone-800">{file.name}</span> ({Math.round(file.size / 1024)} КБ)
          </p>
        ) : null}

        {preview ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-stone-700">
              Строк в файле: <strong>{preview.totalRows}</strong>, валидных песен: <strong>{preview.parsedSongs}</strong>
            </p>
            {preview.errors.length > 0 ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <p className="font-semibold">Ошибки в файле ({preview.errors.length})</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {preview.errors.slice(0, 10).map((e, i) => (
                    <li key={`${e.row}-${e.field}-${i}`}>
                      Строка {e.row}: {e.field} — {e.message}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 sm:w-auto"
                    onClick={() => downloadJson('song-import-errors.json', preview.errors)}
                  >
                    <LuSave className="h-4 w-4" />
                    Скачать ошибки
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                Файл выглядит корректным. Можно начинать импорт.
              </div>
            )}

            {preview.preview.length > 0 ? (
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs">
                <p className="font-semibold text-stone-800">Превью (первые {preview.preview.length})</p>
                <ul className="mt-2 space-y-1 text-stone-700">
                  {preview.preview.map((s) => (
                    <li key={s.external_id} className="truncate">
                      <strong>{s.song_number}.</strong> {s.title}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={!canStart || busyStart}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
            onClick={() => void start()}
          >
            {busyStart ? <LuLoader className="h-4 w-4 animate-spin" /> : <LuPlay className="h-4 w-4" />}
            Начать импорт
          </button>
          <button
            type="button"
            disabled={busyStart}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-800 disabled:opacity-50 sm:w-auto"
            onClick={() => void retryFailed()}
          >
            <LuRefreshCcw className="h-4 w-4" />
            Повторить неудачные
          </button>
        </div>
      </section>

      {(progress || result) ? (
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-stone-900">Прогресс</h3>
          {progress ? (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-stone-700">{progressLabel}</p>
              <div className="h-2 w-full rounded-full bg-stone-100">
                <div
                  className="h-2 rounded-full bg-emerald-500 transition-[width]"
                  style={{
                    width: `${Math.max(0, Math.min(100, Math.round((progress.current / Math.max(1, progress.total)) * 100)))}%`,
                  }}
                />
              </div>
            </div>
          ) : null}

          {result ? (
            <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs text-stone-800">
              <p>
                Успешно: <strong>{result.success}</strong>, ошибок: <strong>{result.failed}</strong>, пропущено: <strong>{result.skipped}</strong>
              </p>
              {result.errors.length > 0 ? (
                <button
                  type="button"
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-800 sm:w-auto"
                  onClick={() => downloadJson('song-import-result.json', result)}
                >
                  <LuSave className="h-4 w-4" />
                  Скачать отчёт
                </button>
              ) : null}
            </div>
          ) : null}

          {log.length > 0 ? (
            <div className="mt-3 rounded-xl border border-stone-200 bg-white">
              <div className="border-b border-stone-200 px-3 py-2 text-xs font-semibold text-stone-700">Лог</div>
              <div className="max-h-[320px] overflow-auto p-3 text-xs text-stone-700">
                <ul className="space-y-1">
                  {log.slice(-200).map((l, i) => (
                    <li key={`${l.ts}-${i}`} className="break-words">
                      {l.message}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

