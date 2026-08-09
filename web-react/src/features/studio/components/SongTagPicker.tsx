import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { LuPlus, LuX } from 'react-icons/lu';

import { emitAppToast } from '../../../lib/uiFeedback';
import { createStudioSongTag, fetchStudioSongTags } from '../api';

type SongTagPickerProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  /** Allow creating a new tag from the search field. */
  allowCreate?: boolean;
  className?: string;
  chipClassName?: string;
  inputClassName?: string;
  mutedClassName?: string;
};

function normalizeLocal(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function SongTagPicker({
  value,
  onChange,
  disabled = false,
  allowCreate = true,
  className = '',
  chipClassName,
  inputClassName,
  mutedClassName,
}: SongTagPickerProps) {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');

  const tagsQ = useQuery({
    queryKey: ['studio', 'tags'],
    queryFn: fetchStudioSongTags,
    staleTime: 60_000,
  });

  const selectedLower = useMemo(
    () => new Set(value.map((t) => t.toLowerCase())),
    [value],
  );

  const catalog = tagsQ.data ?? [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = catalog.filter((t) => !selectedLower.has(t.name.toLowerCase()));
    if (!q) return rows;
    return rows.filter((t) => t.name.toLowerCase().includes(q));
  }, [catalog, query, selectedLower]);

  const exactExists = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return catalog.some((t) => t.name.toLowerCase() === q) || selectedLower.has(q);
  }, [catalog, query, selectedLower]);

  const createMut = useMutation({
    mutationFn: (name: string) => createStudioSongTag(name),
    onSuccess: (tag) => {
      void qc.invalidateQueries({ queryKey: ['studio', 'tags'] });
      if (!selectedLower.has(tag.name.toLowerCase())) {
        onChange([...value, tag.name]);
      }
      setQuery('');
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number; data?: { error?: string } } })?.response;
      if (status?.status === 409) {
        const name = normalizeLocal(query);
        if (name && !selectedLower.has(name.toLowerCase())) {
          onChange([...value, name]);
          setQuery('');
        }
        void qc.invalidateQueries({ queryKey: ['studio', 'tags'] });
        return;
      }
      // Fallback: keep selection local; song save will ensure the tag.
      const name = normalizeLocal(query);
      if (name && !selectedLower.has(name.toLowerCase())) {
        onChange([...value, name]);
        setQuery('');
        return;
      }
      emitAppToast(status?.data?.error || 'Не удалось создать тег');
    },
  });

  const toggle = (name: string) => {
    if (disabled) return;
    const key = name.toLowerCase();
    if (selectedLower.has(key)) {
      onChange(value.filter((t) => t.toLowerCase() !== key));
    } else {
      onChange([...value, name]);
    }
  };

  const addFromQuery = () => {
    const name = normalizeLocal(query);
    if (!name || disabled) return;
    if (selectedLower.has(name.toLowerCase())) {
      setQuery('');
      return;
    }
    const existing = catalog.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      onChange([...value, existing.name]);
      setQuery('');
      return;
    }
    if (!allowCreate) {
      onChange([...value, name]);
      setQuery('');
      return;
    }
    createMut.mutate(name);
  };

  const chipBase =
    chipClassName ??
    'inline-flex min-h-[36px] items-center gap-1 rounded-lg border px-2.5 text-sm transition';
  const selectedChip =
    `${chipBase} border-[var(--studio-editor-accent)] bg-[var(--studio-nav-active-bg)] font-semibold text-[var(--studio-editor-accent)]`;
  const idleChip =
    `${chipBase} border-[var(--studio-editor-border)] bg-[var(--studio-editor-block)] text-[var(--studio-editor-text)] hover:border-[var(--studio-editor-accent)]/50`;
  const inputCls = inputClassName ?? 'studio-input';
  const muteCls = mutedClassName ?? 'text-[var(--studio-editor-mute)]';

  return (
    <div className={['space-y-2', className].filter(Boolean).join(' ')}>
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Выбранные теги">
          {value.map((tag) => (
            <button
              key={tag}
              type="button"
              disabled={disabled}
              onClick={() => toggle(tag)}
              className={selectedChip}
              title="Снять тег"
            >
              {tag}
              <LuX className="h-3.5 w-3.5 opacity-70" aria-hidden />
            </button>
          ))}
        </div>
      ) : (
        <p className={`text-xs ${muteCls}`}>Теги не выбраны</p>
      )}

      <div className="flex gap-2">
        <input
          type="search"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addFromQuery();
            }
          }}
          className={`min-h-[42px] flex-1 ${inputCls}`}
          placeholder="Найти или создать тег…"
          autoComplete="off"
          aria-label="Поиск тегов"
        />
        {allowCreate && query.trim() && !exactExists ? (
          <button
            type="button"
            disabled={disabled || createMut.isPending}
            onClick={addFromQuery}
            className="studio-btn-primary inline-flex min-h-[42px] shrink-0 items-center gap-1 rounded-xl px-3 text-sm disabled:opacity-50"
            title={`Создать «${normalizeLocal(query)}»`}
          >
            <LuPlus className="h-4 w-4" aria-hidden />
            Создать
          </button>
        ) : null}
      </div>

      {tagsQ.isLoading ? (
        <p className={`text-xs ${muteCls}`}>Загрузка тегов…</p>
      ) : filtered.length > 0 ? (
        <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto" aria-label="Доступные теги">
          {filtered.slice(0, 40).map((tag) => (
            <button
              key={tag.id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(tag.name)}
              className={idleChip}
              title={tag.song_count ? `${tag.song_count} песен` : 'Добавить тег'}
            >
              {tag.name}
            </button>
          ))}
        </div>
      ) : query.trim() && !exactExists ? (
        <p className={`text-xs ${muteCls}`}>
          Нажмите Enter или «Создать», чтобы добавить «{normalizeLocal(query)}».
        </p>
      ) : catalog.length === 0 ? (
        <p className={`text-xs ${muteCls}`}>
          Пока нет тегов — введите название и нажмите Enter.
        </p>
      ) : null}
    </div>
  );
}
