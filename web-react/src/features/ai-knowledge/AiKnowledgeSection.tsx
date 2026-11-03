import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { LuFileUp, LuLoader, LuRefreshCw, LuTrash2 } from 'react-icons/lu';

import { apiErrorMessage } from '../admin/api';
import {
  createAiKnowledgeText,
  deleteAiKnowledgeDocument,
  fetchAiKnowledgeDocuments,
  reindexAiKnowledgeDocument,
  uploadAiKnowledgeFile,
  type AiKnowledgeDocStatus,
  type AiKnowledgeDocument,
} from './api';

const Q_KNOWLEDGE = ['admin', 'ai', 'knowledge'] as const;

const STATUS_LABEL: Record<AiKnowledgeDocStatus, string> = {
  pending: 'В очереди',
  processing: 'Индексация…',
  ready: 'Готово',
  failed: 'Ошибка',
};

function statusClass(status: AiKnowledgeDocStatus): string {
  switch (status) {
    case 'ready':
      return 'bg-emerald-100 text-emerald-800';
    case 'failed':
      return 'bg-red-100 text-red-700';
    case 'processing':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-stone-100 text-stone-600';
  }
}

function prettyDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'd MMM yyyy HH:mm', { locale: ru });
}

export function AiKnowledgeSection() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [note, setNote] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const listQ = useQuery({
    queryKey: Q_KNOWLEDGE,
    queryFn: fetchAiKnowledgeDocuments,
    refetchInterval: (query) => {
      const docs = query.state.data?.documents ?? [];
      const busy = docs.some((d) => d.status === 'pending' || d.status === 'processing');
      return busy ? 2500 : false;
    },
  });

  const documents = listQ.data?.documents ?? [];
  const busyCount = useMemo(
    () => documents.filter((d) => d.status === 'pending' || d.status === 'processing').length,
    [documents],
  );

  const invalidate = () => void qc.invalidateQueries({ queryKey: Q_KNOWLEDGE });

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadAiKnowledgeFile(file, title || undefined),
    onSuccess: () => {
      setNote({ type: 'ok', text: 'Файл принят, индексация запущена.' });
      setTitle('');
      if (fileRef.current) fileRef.current.value = '';
      invalidate();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось загрузить файл.') }),
  });

  const textMut = useMutation({
    mutationFn: () =>
      createAiKnowledgeText({
        title: title.trim() || 'Текстовый фрагмент',
        text: pasteText,
      }),
    onSuccess: () => {
      setNote({ type: 'ok', text: 'Текст добавлен, индексация запущена.' });
      setTitle('');
      setPasteText('');
      invalidate();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось сохранить текст.') }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteAiKnowledgeDocument(id),
    onSuccess: () => {
      setNote({ type: 'ok', text: 'Документ удалён.' });
      invalidate();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось удалить.') }),
  });

  const reindexMut = useMutation({
    mutationFn: (id: number) => reindexAiKnowledgeDocument(id),
    onSuccess: () => {
      setNote({ type: 'ok', text: 'Переиндексация запущена.' });
      invalidate();
    },
    onError: (e) => setNote({ type: 'err', text: apiErrorMessage(e, 'Не удалось переиндексировать.') }),
  });

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
        <h3 className="text-base font-semibold text-stone-900">Документы для локальной RAG</h3>
        <p className="mt-1 text-sm text-stone-500">
          Загружайте PDF, DOCX, ODT, XLSX, PPTX, TXT, MD, CSV, RTF или вставьте текст. Файлы
          превращаются в векторы и ограничивают ответы «ИИ помощника» вместе с Библией.
        </p>

        {note ? (
          <p
            className={
              note.type === 'ok'
                ? 'mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
                : 'mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700'
            }
          >
            {note.text}
          </p>
        ) : null}

        <div className="mt-4 grid gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-600">Название (необязательно)</label>
            <input
              className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-stone-400"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Устав церкви"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.odt,.xlsx,.xls,.pptx,.txt,.csv,.md,.markdown,.rtf,text/plain,application/pdf"
              className="block w-full max-w-md text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                uploadMut.mutate(file);
              }}
            />
            {(uploadMut.isPending || textMut.isPending) && (
              <LuLoader className="h-4 w-4 animate-spin text-stone-500" aria-hidden />
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-600">Или вставить текст</label>
            <textarea
              className="min-h-[120px] w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm outline-none focus:border-stone-400"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Вставьте фрагмент учения, устава, конспекта…"
            />
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-stone-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={!pasteText.trim() || textMut.isPending}
              onClick={() => textMut.mutate()}
            >
              <LuFileUp className="h-4 w-4" aria-hidden />
              Добавить текст
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-stone-900">
            Документы{documents.length ? ` (${documents.length})` : ''}
            {busyCount > 0 ? (
              <span className="ml-2 text-xs font-normal text-amber-700">индексируется: {busyCount}</span>
            ) : null}
          </h3>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-1 text-xs text-stone-600 hover:bg-stone-50"
            onClick={() => invalidate()}
          >
            <LuRefreshCw className="h-3.5 w-3.5" aria-hidden />
            Обновить
          </button>
        </div>

        {listQ.isLoading ? (
          <p className="text-sm text-stone-500">Загрузка…</p>
        ) : listQ.isError ? (
          <p className="text-sm text-red-600">{apiErrorMessage(listQ.error, 'Не удалось загрузить список.')}</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-stone-500">Пока пусто — загрузите первый документ.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {documents.map((doc: AiKnowledgeDocument) => (
              <li key={doc.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-stone-900">{doc.title}</p>
                    <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${statusClass(doc.status)}`}>
                      {STATUS_LABEL[doc.status]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {doc.source_filename || 'текст'} · {doc.chunk_count} чанк.
                    {doc.char_count ? ` · ${doc.char_count.toLocaleString('ru-RU')} симв.` : ''} ·{' '}
                    {prettyDate(doc.updated_at)}
                  </p>
                  {doc.error_text ? (
                    <p className="mt-1 text-xs text-red-600">{doc.error_text}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-1 text-xs text-stone-600 hover:bg-stone-50 disabled:opacity-50"
                    disabled={reindexMut.isPending || doc.status === 'processing'}
                    onClick={() => reindexMut.mutate(doc.id)}
                    title="Переиндексировать"
                  >
                    <LuRefreshCw className="h-3.5 w-3.5" aria-hidden />
                    Переиндекс.
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                    disabled={deleteMut.isPending}
                    onClick={() => {
                      if (!window.confirm(`Удалить «${doc.title}» из базы знаний?`)) return;
                      deleteMut.mutate(doc.id);
                    }}
                  >
                    <LuTrash2 className="h-3.5 w-3.5" aria-hidden />
                    Удалить
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
