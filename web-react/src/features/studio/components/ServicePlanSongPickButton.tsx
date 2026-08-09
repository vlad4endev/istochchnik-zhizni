import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { LuLoaderCircle, LuRefreshCw, LuSparkles, LuWand, LuX } from 'react-icons/lu';

import { emitAppToast } from '../../../lib/uiFeedback';
import {
  applyServicePlanSongPicks,
  pickServicePlanSongs,
  type ServicePlanSongPickAlternative,
  type ServicePlanSongPickResult,
  type SongPickMode,
} from '../api';
import { studioEditSongLink, useStudioEditorBackTo } from '../studioPaths';

const dateFmt = new Intl.DateTimeFormat('ru-RU', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const MODE_OPTIONS: Array<{ id: SongPickMode; label: string; hint: string }> = [
  { id: 'fresh', label: 'Свежий', hint: 'Сильная ротация, реже хиты' },
  { id: 'balanced', label: 'Баланс', hint: 'Тема + ротация' },
  { id: 'classic', label: 'Классика', hint: 'Знакомые песни уместны' },
];

function formatPlanDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return dateFmt.format(d);
}

function readPickError(err: unknown): string {
  if (isAxiosError(err)) {
    const apiMsg = err.response?.data;
    if (typeof apiMsg === 'object' && apiMsg !== null && 'error' in apiMsg) {
      const text = String((apiMsg as { error?: unknown }).error ?? '').trim();
      if (text) return text;
    }
    if (!err.response) {
      return 'Нет связи с сервером или запрос занял слишком много времени. Попробуйте ещё раз.';
    }
  }
  return 'Не удалось подобрать песни. Проверьте ИИ-настройки и программу служения.';
}

function songLabel(song: { song_number: number | null; song_title: string }): string {
  return song.song_number != null ? `${song.song_number}. ${song.song_title}` : song.song_title;
}

function freshnessLabel(days: number | null | undefined): string | null {
  if (days == null) return 'давно не пели';
  if (days <= 14) return `пели ${days}д назад`;
  if (days < 60) return `${days}д назад`;
  return `не пели ${Math.round(days / 7)} нед.`;
}

type EditablePick = ServicePlanSongPickResult['picks'][number];

function PickResults({
  result,
  mode,
  onClose,
  onApplied,
  onRegenerate,
  regenerating,
  editorBackTo,
}: {
  result: ServicePlanSongPickResult;
  mode: SongPickMode;
  onClose: () => void;
  onApplied: () => void;
  onRegenerate: () => void;
  regenerating: boolean;
  editorBackTo: string;
}) {
  const [picks, setPicks] = useState<EditablePick[]>(() =>
    result.picks.map((p) => ({ ...p, alternatives: [...(p.alternatives ?? [])] })),
  );

  const applyMut = useMutation({
    mutationFn: () =>
      applyServicePlanSongPicks(
        result.plan.id,
        picks.map((p) => ({ block_id: p.block_id, song_id: p.song_id })),
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

  const swapWithAlternative = (blockId: number, alt: ServicePlanSongPickAlternative) => {
    setPicks((prev) =>
      prev.map((pick) => {
        if (pick.block_id !== blockId) return pick;
        const previousPrimary: ServicePlanSongPickAlternative = {
          song_id: pick.song_id,
          song_title: pick.song_title,
          song_number: pick.song_number,
          default_key: pick.default_key,
          days_since_last_use: pick.days_since_last_use ?? null,
        };
        const rest = (pick.alternatives ?? []).filter((a) => a.song_id !== alt.song_id);
        return {
          ...pick,
          song_id: alt.song_id,
          song_title: alt.song_title,
          song_number: alt.song_number,
          default_key: alt.default_key,
          days_since_last_use: alt.days_since_last_use,
          reason: `Альтернатива: ${pick.reason}`,
          alternatives: [previousPrimary, ...rest].slice(0, 3),
        };
      }),
    );
  };

  const modeLabel = result.meta?.mode_label ?? MODE_OPTIONS.find((m) => m.id === mode)?.label ?? 'Баланс';

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-modal-bg)] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="song-pick-title"
    >
      <div className="flex max-h-[min(92dvh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-[var(--studio-editor-border)] bg-[var(--studio-editor-bg)] shadow-2xl sm:rounded-2xl z-[var(--z-modal)]">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--studio-editor-accent)]">
              ИИ-подбор · {modeLabel}
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
            {result.meta ? (
              <p className="mt-2 text-xs text-[var(--studio-editor-mute)]">
                Ротация: не предлагать песни последних {result.meta.hard_cooldown_days} дн.
                {result.meta.avoided_recent_count > 0
                  ? ` · в cooldown ${result.meta.avoided_recent_count}`
                  : ''}
              </p>
            ) : null}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-[var(--studio-editor-text)]">{result.ai_summary}</p>

          <ol className="mt-4 space-y-3">
            {picks.map((pick, index) => {
              const slot = result.song_blocks.find((b) => b.block_id === pick.block_id);
              const fresh = freshnessLabel(pick.days_since_last_use);
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
                        {slot?.role_hint ? ` · ${slot.role_hint}` : ''}
                      </p>
                      <Link
                        {...studioEditSongLink(pick.song_id, editorBackTo)}
                        className="mt-1 block text-base font-semibold text-[var(--studio-editor-text)] hover:text-[var(--studio-editor-accent)]"
                      >
                        {songLabel(pick)}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--studio-editor-mute)]">
                        {pick.default_key ? <span>Тональность: {pick.default_key}</span> : null}
                        {pick.tempo != null ? <span>Tempo: {pick.tempo}</span> : null}
                        {fresh ? <span>{fresh}</span> : null}
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--studio-editor-mute)]">{pick.reason}</p>
                      {slot?.current_song_title ? (
                        <p className="mt-2 text-xs text-amber-800">
                          Сейчас в блоке: {slot.current_song_title}
                        </p>
                      ) : null}

                      {(pick.alternatives?.length ?? 0) > 0 ? (
                        <div className="mt-3 space-y-1.5">
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--studio-editor-mute)]">
                            Заменить на
                          </p>
                          <div className="flex flex-col gap-1.5">
                            {pick.alternatives!.map((alt) => (
                              <button
                                key={alt.song_id}
                                type="button"
                                onClick={() => swapWithAlternative(pick.block_id, alt)}
                                className="rounded-lg border border-[var(--studio-editor-border)] bg-[var(--studio-editor-bg)] px-3 py-2 text-left text-sm text-[var(--studio-editor-text)] transition hover:border-[var(--studio-editor-accent)] hover:bg-[var(--studio-nav-active-bg)]"
                              >
                                <span className="font-medium">{songLabel(alt)}</span>
                                {alt.default_key ? (
                                  <span className="ml-2 text-xs text-[var(--studio-editor-mute)]">{alt.default_key}</span>
                                ) : null}
                                <span className="ml-2 text-xs text-[var(--studio-editor-mute)]">
                                  {freshnessLabel(alt.days_since_last_use)}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:flex-wrap sm:justify-end">
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating || applyMut.isPending}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--studio-editor-border)] px-4 text-sm font-semibold text-[var(--studio-editor-text)] hover:bg-[var(--studio-nav-active-bg)] disabled:opacity-50"
          >
            {regenerating ? <LuLoaderCircle className="h-4 w-4 animate-spin" /> : <LuRefreshCw className="h-4 w-4" />}
            Другой вариант
          </button>
          <Link
            to="/service-planner"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[var(--studio-editor-border)] px-4 text-sm font-semibold text-[var(--studio-editor-text)] hover:bg-[var(--studio-nav-active-bg)]"
          >
            Открыть планировщик
          </Link>
          <button
            type="button"
            onClick={() => applyMut.mutate()}
            disabled={applyMut.isPending || regenerating}
            className="studio-btn-primary inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold disabled:opacity-50"
          >
            {applyMut.isPending ? <LuLoaderCircle className="h-4 w-4 animate-spin" /> : <LuWand className="h-4 w-4" />}
            Применить в программу
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ServicePlanSongPickButton({ onApplied }: { onApplied?: () => void }) {
  const [result, setResult] = useState<ServicePlanSongPickResult | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [mode, setMode] = useState<SongPickMode>('balanced');
  const [resultKey, setResultKey] = useState(0);
  const editorBackTo = useStudioEditorBackTo();

  const pickMut = useMutation({
    mutationFn: (params: { excludeSongIds?: number[]; variationSeed?: string }) =>
      pickServicePlanSongs({
        mode,
        excludeSongIds: params.excludeSongIds,
        variationSeed: params.variationSeed,
      }),
    onMutate: () => setInlineError(null),
    onSuccess: (data) => {
      setInlineError(null);
      setResult(data);
      setResultKey((k) => k + 1);
    },
    onError: (err: unknown) => {
      const msg = readPickError(err);
      setInlineError(msg);
      emitAppToast(msg);
    },
  });

  const regenerate = () => {
    if (!result) {
      pickMut.mutate({});
      return;
    }
    const exclude = result.picks.map((p) => p.song_id);
    for (const pick of result.picks) {
      for (const alt of pick.alternatives ?? []) exclude.push(alt.song_id);
    }
    pickMut.mutate({
      excludeSongIds: [...new Set(exclude)],
      variationSeed: `${Date.now().toString(36)}-r`,
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div
          className="inline-flex rounded-xl border border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] p-1"
          role="group"
          aria-label="Режим подбора песен"
        >
          {MODE_OPTIONS.map((opt) => {
            const active = mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                title={opt.hint}
                onClick={() => setMode(opt.id)}
                disabled={pickMut.isPending}
                className={[
                  'min-h-[36px] rounded-lg px-3 text-xs font-semibold transition',
                  active
                    ? 'bg-[var(--studio-editor-accent)] text-white shadow-sm'
                    : 'text-[var(--studio-editor-mute)] hover:text-[var(--studio-editor-text)]',
                ].join(' ')}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => pickMut.mutate({})}
          disabled={pickMut.isPending}
          aria-busy={pickMut.isPending}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--studio-editor-accent)] to-[#9a4550] px-4 text-sm font-semibold text-white shadow-md transition hover:opacity-95 disabled:opacity-60"
        >
          {pickMut.isPending ? (
            <LuLoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <LuSparkles className="h-4 w-4" aria-hidden />
          )}
          {pickMut.isPending ? 'ИИ подбирает песни…' : 'Подбор песен'}
        </button>
      </div>

      <p className="max-w-xl text-xs leading-relaxed text-[var(--studio-editor-mute)]">
        {MODE_OPTIONS.find((m) => m.id === mode)?.hint}. Повторный запрос и «Другой вариант» исключают
        уже предложенные песни и усиливают ротацию.
      </p>

      {inlineError ? (
        <p className="max-w-xl rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm leading-relaxed text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
          {inlineError}
        </p>
      ) : null}

      {result ? (
        <PickResults
          key={resultKey}
          result={result}
          mode={mode}
          onClose={() => setResult(null)}
          onApplied={() => onApplied?.()}
          onRegenerate={regenerate}
          regenerating={pickMut.isPending}
          editorBackTo={editorBackTo}
        />
      ) : null}
    </div>
  );
}
