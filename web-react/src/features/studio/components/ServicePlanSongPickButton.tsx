import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LuLoaderCircle, LuSparkles, LuWand, LuX } from 'react-icons/lu';

import { emitAppToast } from '../../../lib/uiFeedback';
import {
  applyServicePlanSongPicks,
  pickServicePlanSongs,
  type ServicePlanSongPickResult,
} from '../api';
import { studioEditSongLink, useStudioEditorBackTo } from '../studioPaths';

const dateFmt = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function formatPlanDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return dateFmt.format(d);
}

function songLabel(song: { song_number: number | null; song_title: string }): string {
  return song.song_number != null ? `${song.song_number}. ${song.song_title}` : song.song_title;
}

function PickResults({
  result,
  onClose,
  onApplied,
  editorBackTo,
}: {
  result: ServicePlanSongPickResult;
  onClose: () => void;
  onApplied: () => void;
  editorBackTo: string;
}) {
  const applyMut = useMutation({
    mutationFn: () =>
      applyServicePlanSongPicks(
        result.plan.id,
        result.picks.map((p) => ({ block_id: p.block_id, song_id: p.song_id })),
      ),
    onSuccess: (data) => {
      emitAppToast({
        kind: 'success',
        message:
          data.applied > 0
            ? `В программу добавлено песен: ${data.applied}`
            : 'Не удалось обновить блоки программы',
      });
      onApplied();
      onClose();
    },
    onError: () => emitAppToast('Не удалось применить подбор к программе'),
  });

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="song-pick-title"
    >
      <div className="flex max-h-[min(92dvh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-[var(--studio-editor-border)] bg-[var(--studio-editor-bg)] shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--studio-editor-accent)]">
              ИИ-подбор
            </p>
            <h2 id="song-pick-title" className="mt-1 text-lg font-bold text-[var(--studio-editor-text)]">
              Песни под проповедь
            </h2>
            <p className="mt-1 text-sm text-[var(--studio-editor-mute)]">
              {formatPlanDate(result.plan.service_date)}
              {result.plan.start_time ? ` · ${result.plan.start_time}` : ''}
              {result.plan.template_name ? ` · ${result.plan.template_name}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="studio-touch-target flex shrink-0 items-center justify-center rounded-xl border border-[var(--studio-editor-border)] text-[var(--studio-editor-text)]"
            aria-label="Закрыть"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="rounded-xl border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--studio-editor-mute)]">
              Тема проповеди
            </p>
            {result.sermon.topic ? (
              <p className="mt-1 text-sm font-semibold text-[var(--studio-editor-text)]">{result.sermon.topic}</p>
            ) : (
              <p className="mt-1 text-sm text-[var(--studio-editor-mute)]">Тема не указана</p>
            )}
            {result.sermon.scripture ? (
              <p className="mt-2 text-sm text-[var(--studio-editor-mute)]">
                Писание: <span className="font-medium text-[var(--studio-editor-text)]">{result.sermon.scripture}</span>
              </p>
            ) : null}
            {result.sermon.preacher_name ? (
              <p className="mt-1 text-xs text-[var(--studio-editor-mute)]">Проповедник: {result.sermon.preacher_name}</p>
            ) : null}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-[var(--studio-editor-text)]">{result.ai_summary}</p>

          <ol className="mt-4 space-y-3">
            {result.picks.map((pick, index) => {
              const slot = result.song_blocks.find((b) => b.block_id === pick.block_id);
              return (
                <li
                  key={pick.block_id}
                  className="rounded-xl border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--studio-nav-active-bg)] text-sm font-bold text-[var(--studio-editor-accent)]">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--studio-editor-mute)]">
                        {slot?.title ?? 'Блок песни'}
                      </p>
                      <Link
                        {...studioEditSongLink(pick.song_id, editorBackTo)}
                        className="mt-1 block text-base font-semibold text-[var(--studio-editor-text)] hover:text-[var(--studio-editor-accent)]"
                      >
                        {songLabel(pick)}
                      </Link>
                      {pick.default_key ? (
                        <p className="mt-0.5 text-xs text-[var(--studio-editor-mute)]">Тональность: {pick.default_key}</p>
                      ) : null}
                      <p className="mt-2 text-sm leading-relaxed text-[var(--studio-editor-mute)]">{pick.reason}</p>
                      {slot?.current_song_title ? (
                        <p className="mt-2 text-xs text-amber-800">
                          Сейчас в блоке: {slot.current_song_title}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] p-4 sm:flex-row sm:justify-end">
          <Link
            to="/service-planner"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--studio-editor-border)] px-4 text-sm font-semibold text-[var(--studio-editor-text)] hover:bg-[var(--studio-nav-active-bg)]"
          >
            Открыть планировщик
          </Link>
          <button
            type="button"
            onClick={() => applyMut.mutate()}
            disabled={applyMut.isPending}
            className="studio-btn-primary inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold disabled:opacity-50"
          >
            {applyMut.isPending ? <LuLoaderCircle className="h-4 w-4 animate-spin" /> : <LuWand className="h-4 w-4" />}
            Применить в программу
          </button>
        </div>
      </div>
    </div>
  );
}

export function ServicePlanSongPickButton({ onApplied }: { onApplied?: () => void }) {
  const [result, setResult] = useState<ServicePlanSongPickResult | null>(null);
  const editorBackTo = useStudioEditorBackTo();

  const pickMut = useMutation({
    mutationFn: () => pickServicePlanSongs(),
    onSuccess: (data) => setResult(data),
    onError: (err: unknown) => {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? String((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? '')
          : '';
      emitAppToast(msg || 'Не удалось подобрать песни. Проверьте ИИ-настройки и программу служения.');
    },
  });

  return (
    <>
      <button
        type="button"
        onClick={() => pickMut.mutate()}
        disabled={pickMut.isPending}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--studio-editor-accent)] to-[#9a4550] px-4 text-sm font-semibold text-white shadow-md transition hover:opacity-95 disabled:opacity-60"
      >
        {pickMut.isPending ? (
          <LuLoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <LuSparkles className="h-4 w-4" aria-hidden />
        )}
        {pickMut.isPending ? 'ИИ подбирает песни…' : 'Подбор песен'}
      </button>

      {result ? (
        <PickResults
          result={result}
          onClose={() => setResult(null)}
          onApplied={() => onApplied?.()}
          editorBackTo={editorBackTo}
        />
      ) : null}
    </>
  );
}
