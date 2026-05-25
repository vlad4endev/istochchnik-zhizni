import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { LuPlus, LuSave, LuTrash2 } from 'react-icons/lu';

import { IntegerTextInput } from '@/components/IntegerTextInput';
import { emitAppToast } from '../../../lib/uiFeedback';
import { patchSetlistItemMusicianNotes, type SetlistItemRow } from '../api';
import { emptyMusicianNotes, notesFromItem, type MusicianNotesV1 } from '../performNotes';

type LineRow = { line: number; text: string };
type BlockRow = { from: number; to: number; text: string };

function toLineRows(n: MusicianNotesV1): LineRow[] {
  const o = n.lineComments ?? {};
  return Object.keys(o)
    .map((k) => ({ line: Number(k), text: o[k] ?? '' }))
    .filter((r) => Number.isInteger(r.line) && r.line >= 0 && r.text.trim())
    .sort((a, b) => a.line - b.line);
}

function fromLineRows(rows: LineRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const t = r.text.trim();
    if (!t || !Number.isInteger(r.line) || r.line < 0) continue;
    out[String(r.line)] = t;
  }
  return out;
}

type Props = {
  setlistId: number;
  item: SetlistItemRow;
};

export function SetlistMusicianNotesEditor({ setlistId, item }: Props) {
  const qc = useQueryClient();
  const [lines, setLines] = useState<LineRow[]>([]);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);

  useEffect(() => {
    const n = notesFromItem(item.musician_notes);
    setLines(toLineRows(n));
    setBlocks(n.blockComments?.map((b) => ({ ...b })) ?? []);
  }, [item.id, item.musician_notes]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const lineComments = fromLineRows(lines);
      const blockComments = blocks
        .map((b) => ({
          from: Math.min(b.from, b.to),
          to: Math.max(b.from, b.to),
          text: b.text.trim(),
        }))
        .filter((b) => b.text && Number.isInteger(b.from) && Number.isInteger(b.to) && b.from >= 0 && b.to >= b.from);
      const payload: MusicianNotesV1 =
        Object.keys(lineComments).length === 0 && blockComments.length === 0
          ? emptyMusicianNotes()
          : {
              v: 1,
              ...(Object.keys(lineComments).length ? { lineComments } : {}),
              ...(blockComments.length ? { blockComments } : {}),
            };
      await patchSetlistItemMusicianNotes(setlistId, Number(item.id), payload);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['studio', 'setlist', setlistId, 'items'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'perform', setlistId] });
      emitAppToast({ kind: 'success', message: 'Заметки сохранены' });
    },
    onError: () => emitAppToast('Не удалось сохранить заметки'),
  });

  const clearMut = useMutation({
    mutationFn: () => patchSetlistItemMusicianNotes(setlistId, Number(item.id), emptyMusicianNotes()),
    onSuccess: () => {
      setLines([]);
      setBlocks([]);
      void qc.invalidateQueries({ queryKey: ['studio', 'setlist', setlistId, 'items'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'perform', setlistId] });
      emitAppToast({ kind: 'success', message: 'Заметки удалены' });
    },
    onError: () => emitAppToast('Не удалось очистить'),
  });

  const lineCount = (item.effective_content || item.song.content || '').split('\n').length;

  return (
    <div className="mt-3 space-y-4 border-t border-stone-100 pt-3">
      <p className="text-xs leading-relaxed text-stone-500">
        Видно только в <strong className="font-medium text-stone-700">режиме выступления</strong> после входа. В публичной ссылке и PDF не попадает. Номера строк — как в тексте песни (первая
        строка = 1), пустые строки считаются.
      </p>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">Заметки к строке</p>
        <div className="space-y-2">
          {lines.map((row, idx) => (
            <div key={idx} className="flex flex-wrap items-start gap-2 rounded-lg bg-stone-50 p-2">
              <label className="flex shrink-0 flex-col text-[10px] font-medium text-stone-500">
                Стр.
                <IntegerTextInput
                  syncKey={`line-note-${idx}`}
                  value={row.line + 1}
                  min={1}
                  max={Math.max(1, lineCount)}
                  maxDigits={4}
                  onChange={(displayLine) => {
                    const next = [...lines];
                    next[idx] = { ...row, line: displayLine - 1 };
                    setLines(next);
                  }}
                  className="mt-0.5 w-14 rounded border border-stone-200 px-1 py-1 text-sm"
                />
              </label>
              <textarea
                value={row.text}
                onChange={(e) => {
                  const next = [...lines];
                  next[idx] = { ...row, text: e.target.value };
                  setLines(next);
                }}
                rows={2}
                placeholder="Напр.: rit., повтор 2×, каденция…"
                className="min-w-0 flex-1 rounded border border-stone-200 px-2 py-1 text-sm text-stone-900"
              />
              <button
                type="button"
                onClick={() => setLines(lines.filter((_, j) => j !== idx))}
                className="shrink-0 rounded p-2 text-stone-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Удалить строку заметки"
              >
                <LuTrash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setLines([...lines, { line: 0, text: '' }])}
            className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100"
          >
            <LuPlus className="h-4 w-4" />
            Добавить заметку к строке
          </button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-700">Заметка к блоку строк</p>
        <div className="space-y-2">
          {blocks.map((row, idx) => (
            <div key={idx} className="space-y-2 rounded-lg bg-violet-50/50 p-2 ring-1 ring-violet-100">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[10px] font-medium text-stone-600">
                  С строки
                  <IntegerTextInput
                    syncKey={`block-from-${idx}`}
                    value={row.from + 1}
                    min={1}
                    max={Math.max(1, lineCount)}
                    maxDigits={4}
                    onChange={(displayFrom) => {
                      const next = [...blocks];
                      const from = displayFrom - 1;
                      next[idx] = { ...row, from, to: Math.max(from, row.to) };
                      setBlocks(next);
                    }}
                    className="ml-1 w-14 rounded border border-stone-200 px-1 py-1 text-sm"
                  />
                </label>
                <label className="text-[10px] font-medium text-stone-600">
                  по
                  <IntegerTextInput
                    syncKey={`block-to-${idx}`}
                    value={row.to + 1}
                    min={row.from + 1}
                    max={Math.max(1, lineCount)}
                    maxDigits={4}
                    onChange={(displayTo) => {
                      const next = [...blocks];
                      const to = displayTo - 1;
                      next[idx] = { ...row, to: Math.max(row.from, to) };
                      setBlocks(next);
                    }}
                    className="ml-1 w-14 rounded border border-stone-200 px-1 py-1 text-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setBlocks(blocks.filter((_, j) => j !== idx))}
                  className="ml-auto rounded p-2 text-stone-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Удалить блок"
                >
                  <LuTrash2 className="h-4 w-4" />
                </button>
              </div>
              <textarea
                value={row.text}
                onChange={(e) => {
                  const next = [...blocks];
                  next[idx] = { ...row, text: e.target.value };
                  setBlocks(next);
                }}
                rows={2}
                placeholder="Напр.: весь припев — удвоить бэк, соло гитары после второго куплета…"
                className="w-full rounded border border-violet-200 bg-white px-2 py-1 text-sm text-stone-900"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setBlocks([...blocks, { from: 0, to: 0, text: '' }])}
            className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-50"
          >
            <LuPlus className="h-4 w-4" />
            Добавить блок
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saveMut.isPending}
          onClick={() => saveMut.mutate()}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
        >
          <LuSave className="h-4 w-4" />
          Сохранить заметки
        </button>
        <button
          type="button"
          disabled={clearMut.isPending}
          onClick={() => clearMut.mutate()}
          className="rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-600 hover:bg-stone-50 disabled:opacity-50"
        >
          Очистить всё
        </button>
      </div>
    </div>
  );
}
