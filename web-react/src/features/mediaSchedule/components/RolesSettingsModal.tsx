import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { useEffect, useState } from 'react';
import { LuGripVertical, LuLoaderCircle, LuPencil, LuTrash2, LuX } from 'react-icons/lu';

import { useMobileBottomNavLock } from '../../../app/useMobileBottomNavLock';
import type { MediaRole } from '../types';

const COLOR_PRESETS = [
  '#7d3640',
  '#0891b2',
  '#059669',
  '#16a34a',
  '#d97706',
  '#6366f1',
  '#9333ea',
  '#dc2626',
];

type Props = {
  open: boolean;
  onClose: () => void;
  roles: MediaRole[];
  onCreate: (input: { name: string; color: string; ministry_role_filter?: string | null }) => Promise<void>;
  onUpdate: (
    id: number,
    input: { name: string; color: string; ministry_role_filter?: string | null },
  ) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onReorder: (ids: number[]) => Promise<void>;
};

export function RolesSettingsModal({
  open,
  onClose,
  roles,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
}: Props) {
  const [ordered, setOrdered] = useState<MediaRole[]>(roles);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLOR_PRESETS[0]);
  const [newRoleFilter, setNewRoleFilter] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(COLOR_PRESETS[0]);
  const [editRoleFilter, setEditRoleFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useMobileBottomNavLock(open);

  useEffect(() => {
    if (open) {
      setOrdered(roles);
      setError(null);
    }
  }, [open, roles]);

  if (!open) return null;

  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const next = Array.from(ordered);
    const [removed] = next.splice(result.source.index, 1);
    next.splice(result.destination.index, 0, removed);
    setOrdered(next);
  }

  async function saveOrder() {
    setBusy(true);
    setError(null);
    try {
      await onReorder(ordered.map((r) => r.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить порядок');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        name,
        color: newColor,
        ministry_role_filter: newRoleFilter.trim() || null,
      });
      setNewName('');
      setNewColor(COLOR_PRESETS[0]);
      setNewRoleFilter('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать роль');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(id: number) {
    const name = editName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await onUpdate(id, {
        name,
        color: editColor,
        ministry_role_filter: editRoleFilter.trim() || null,
      });
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось обновить роль');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm('Удалить роль?')) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось удалить роль');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center p-0 sm:items-center sm:p-4" role="presentation">
      <button type="button" aria-label="Закрыть" className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-[111] flex max-h-[min(92dvh,700px)] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-stone-200/80 bg-white shadow-2xl sm:max-h-[min(90dvh,700px)] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-stone-100 px-4 py-3">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-stone-200 sm:hidden" />
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-extrabold text-stone-900">Роли медиа-служения</h2>
            <button
              type="button"
              onClick={onClose}
              className="tap-highlight-transparent grid h-11 w-11 place-items-center rounded-full bg-stone-100 text-stone-600"
            >
              <LuX className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {error ? <p className="mb-2 text-sm text-rose-600">{error}</p> : null}

          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="media-roles">
              {(provided) => (
                <ul ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                  {ordered.map((role, index) => (
                    <Draggable key={role.id} draggableId={String(role.id)} index={index}>
                      {(dragProvided) => (
                        <li
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2 py-2"
                        >
                          <button
                            type="button"
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-[var(--text-muted)]"
                            {...dragProvided.dragHandleProps}
                            aria-label="Перетащить"
                          >
                            <LuGripVertical className="h-4 w-4" />
                          </button>
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: role.color }}
                            aria-hidden
                          />
                          {editingId === role.id ? (
                            <div className="flex min-w-0 flex-1 flex-col gap-2">
                              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                                <input
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="min-w-0 flex-1 rounded-lg border border-[var(--border)] px-2 py-1 text-sm"
                                />
                                <ColorPicker value={editColor} onChange={setEditColor} />
                                <button
                                  type="button"
                                  onClick={() => void handleUpdate(role.id)}
                                  className="inline-flex min-h-11 items-center rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white"
                                >
                                  OK
                                </button>
                              </div>
                              <input
                                value={editRoleFilter}
                                onChange={(e) => setEditRoleFilter(e.target.value)}
                                placeholder="Роль в карточке (если пусто — как название слота)"
                                className="w-full rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
                              />
                            </div>
                          ) : (
                            <div className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{role.name}</span>
                              {role.ministry_role_filter ? (
                                <span className="block truncate text-[10px] text-[var(--text-muted)]">
                                  {role.ministry_role_filter}
                                </span>
                              ) : null}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(role.id);
                              setEditName(role.name);
                              setEditColor(role.color);
                              setEditRoleFilter(role.ministry_role_filter ?? '');
                            }}
                            className="grid h-11 w-11 place-items-center rounded-lg hover:bg-black/5"
                          >
                            <LuPencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(role.id)}
                            className="grid h-11 w-11 place-items-center rounded-lg text-rose-600 hover:bg-rose-50"
                          >
                            <LuTrash2 className="h-4 w-4" />
                          </button>
                        </li>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </ul>
              )}
            </Droppable>
          </DragDropContext>

          <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Новая роль
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Название"
                className="min-w-[140px] flex-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
              />
              <ColorPicker value={newColor} onChange={setNewColor} />
              <input
                value={newRoleFilter}
                onChange={(e) => setNewRoleFilter(e.target.value)}
                placeholder="Роль в карточке (если пусто — как название слота)"
                className="min-w-[140px] flex-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                disabled={busy || !newName.trim()}
                onClick={() => void handleCreate()}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
              >
                Добавить
              </button>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-stone-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveOrder()}
            className="tap-highlight-transparent flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-stone-900 text-sm font-extrabold text-white disabled:opacity-50"
          >
            {busy ? <LuLoaderCircle className="h-4 w-4 animate-spin" /> : null}
            Сохранить порядок
          </button>
        </div>
      </div>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {COLOR_PRESETS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Цвет ${c}`}
          onClick={() => onChange(c)}
          className={[
            'h-11 w-11 rounded-full ring-2 ring-offset-1 sm:h-8 sm:w-8',
            value === c ? 'ring-primary' : 'ring-transparent',
          ].join(' ')}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}
