import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { LuChevronDown, LuMusic, LuSearch, LuX } from 'react-icons/lu';
import {
  filterServicePlannerSongs,
  formatServicePlannerSongLabel,
  servicePlannerSongId,
  type ServicePlannerSongOption,
} from '../songPickerUtils';

export type ServicePlannerSongPickerProps = {
  id?: string;
  songs: ServicePlannerSongOption[];
  value: number | null;
  onChange: (songId: number | null, song: ServicePlannerSongOption | null) => void;
  placeholder?: string;
  clearLabel?: string;
  orphanTitle?: string | null;
  orphanKey?: string | null;
  className?: string;
  listClassName?: string;
  autoFocus?: boolean;
};

export function ServicePlannerSongPicker({
  id,
  songs,
  value,
  onChange,
  placeholder = 'Поиск по названию, номеру или тональности…',
  clearLabel = 'Песня не назначена',
  orphanTitle = null,
  orphanKey = null,
  className = '',
  listClassName = '',
  autoFocus = false,
}: ServicePlannerSongPickerProps) {
  const reactId = useId();
  const inputId = id ?? `service-planner-song-${reactId}`;
  const listboxId = `${inputId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dropdownStyle, setDropdownStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  const updateDropdownPosition = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    setDropdownStyle({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  const selectedSong = useMemo(
    () => (value != null ? songs.find((s) => servicePlannerSongId(s) === value) ?? null : null),
    [songs, value],
  );

  const filteredSongs = useMemo(() => filterServicePlannerSongs(songs, query), [query, songs]);

  const orphanSelected = value != null && !selectedSong;
  const selectedLabel = selectedSong
    ? formatServicePlannerSongLabel(selectedSong)
    : orphanSelected
      ? orphanTitle
        ? formatServicePlannerSongLabel({ title: orphanTitle, default_key: orphanKey })
        : `Песня #${value} (нет в списке)`
      : null;

  const optionCount = filteredSongs.length + 1;

  const scrollHighlightedIntoView = useCallback((index: number) => {
    const list = listRef.current;
    if (!list) return;
    const option = list.querySelector<HTMLElement>(`[data-option-index="${index}"]`);
    option?.scrollIntoView({ block: 'nearest' });
  }, []);

  const selectSong = useCallback(
    (songId: number | null) => {
      const song = songId != null ? songs.find((s) => servicePlannerSongId(s) === songId) ?? null : null;
      onChange(songId, song);
      setQuery('');
      setOpen(false);
      setHighlightIndex(0);
    },
    [onChange, songs],
  );

  const openPicker = useCallback(() => {
    setOpen(true);
    queueMicrotask(() => {
      updateDropdownPosition();
      inputRef.current?.focus();
    });
  }, [updateDropdownPosition]);

  useEffect(() => {
    if (!open) {
      setDropdownStyle(null);
      return;
    }
    updateDropdownPosition();
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);
    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [open, updateDropdownPosition, filteredSongs.length, query]);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = value != null ? filteredSongs.findIndex((s) => servicePlannerSongId(s) === value) : -1;
    const nextIndex = selectedIndex >= 0 ? selectedIndex + 1 : 0;
    setHighlightIndex(nextIndex);
    queueMicrotask(() => scrollHighlightedIntoView(nextIndex));
  }, [open, value, filteredSongs, scrollHighlightedIntoView]);

  useEffect(() => {
    if (!autoFocus) return;
    openPicker();
  }, [autoFocus, openPicker]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
      setQuery('');
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) setOpen(true);
      setHighlightIndex((prev) => {
        const next = Math.min(prev + 1, optionCount - 1);
        scrollHighlightedIntoView(next);
        return next;
      });
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) setOpen(true);
      setHighlightIndex((prev) => {
        const next = Math.max(prev - 1, 0);
        scrollHighlightedIntoView(next);
        return next;
      });
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (highlightIndex === 0) {
        selectSong(null);
        return;
      }
      const song = filteredSongs[highlightIndex - 1];
      if (song) selectSong(servicePlannerSongId(song));
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`.trim()}>
      <div
        className={[
          'flex min-h-11 items-stretch overflow-hidden rounded-lg border bg-white shadow-sm transition-colors touch-manipulation sm:min-h-9',
          open ? 'border-sky-400 ring-2 ring-sky-100' : 'border-stone-300 hover:border-stone-400',
        ].join(' ')}
      >
        <label htmlFor={inputId} className="sr-only">
          Поиск песни
        </label>
        <span className="flex shrink-0 items-center pl-3 text-stone-400" aria-hidden>
          <LuSearch className="size-4" />
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listboxId}-option-${highlightIndex}` : undefined}
          value={open ? query : selectedLabel ?? ''}
          readOnly={!open && selectedLabel != null}
          placeholder={selectedLabel == null ? placeholder : undefined}
          onFocus={() => {
            setOpen(true);
            updateDropdownPosition();
            if (selectedLabel != null) setQuery('');
          }}
          onClick={() => {
            if (!open) openPicker();
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            if (!open) setOpen(true);
            setHighlightIndex(0);
          }}
          onKeyDown={handleInputKeyDown}
          className={[
            'min-w-0 flex-1 border-0 bg-transparent py-2.5 pl-2 pr-1 text-base text-stone-900 outline-none placeholder:text-stone-400 sm:py-2 sm:text-sm',
            !open && selectedLabel != null ? 'cursor-pointer' : '',
          ].join(' ')}
          autoComplete="off"
          spellCheck={false}
        />
        {value != null ? (
          <button
            type="button"
            onClick={() => selectSong(null)}
            className="flex shrink-0 items-center px-2 text-stone-400 transition-colors hover:text-stone-700"
            aria-label="Сбросить выбор песни"
          >
            <LuX className="size-4" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            if (open) {
              setOpen(false);
              setQuery('');
              inputRef.current?.blur();
            } else {
              openPicker();
            }
          }}
          className="flex shrink-0 items-center border-l border-stone-200 px-2.5 text-stone-500 transition-colors hover:bg-stone-50 hover:text-stone-700"
          aria-label={open ? 'Закрыть список песен' : 'Открыть список песен'}
        >
          <LuChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {selectedLabel != null ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-stone-600">
          <LuMusic className="size-3.5 shrink-0 text-sky-600" aria-hidden />
          <span className="truncate">
            Выбрано: <span className="font-medium text-stone-800">{selectedLabel}</span>
          </span>
        </p>
      ) : null}

      {open && dropdownStyle
        ? createPortal(
            <div
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-label="Список песен"
              style={{
                position: 'fixed',
                top: dropdownStyle.top,
                left: dropdownStyle.left,
                width: dropdownStyle.width,
              }}
              className={[
                'z-[10050] max-h-64 overflow-y-auto rounded-xl border border-stone-200 bg-white py-1 shadow-lg',
                listClassName,
              ].join(' ')}
            >
              <button
                type="button"
                role="option"
                id={`${listboxId}-option-0`}
                data-option-index={0}
                aria-selected={value == null}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectSong(null)}
                className={[
                  'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors sm:py-2',
                  highlightIndex === 0 ? 'bg-sky-50 text-sky-900' : 'text-stone-600 hover:bg-stone-50',
                  value == null ? 'font-medium' : '',
                ].join(' ')}
              >
                <span className="size-8 shrink-0 rounded-md border border-dashed border-stone-300 bg-stone-50" aria-hidden />
                <span>{clearLabel}</span>
              </button>

              {filteredSongs.length === 0 ? (
                <p className="px-3 py-3 text-sm text-stone-500">Ничего не найдено. Попробуйте другой запрос.</p>
              ) : (
                filteredSongs.map((song, index) => {
                  const songId = servicePlannerSongId(song);
                  const optionIndex = index + 1;
                  const isSelected = value === songId;
                  const isHighlighted = highlightIndex === optionIndex;
                  const keyLabel = String(song.default_key ?? '').trim();

                  return (
                    <button
                      key={songId}
                      type="button"
                      role="option"
                      id={`${listboxId}-option-${optionIndex}`}
                      data-option-index={optionIndex}
                      aria-selected={isSelected}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setHighlightIndex(optionIndex)}
                      onClick={() => selectSong(songId)}
                      className={[
                        'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors sm:py-2',
                        isHighlighted ? 'bg-sky-50' : 'hover:bg-stone-50',
                        isSelected ? 'font-medium text-sky-900' : 'text-stone-800',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums',
                          isSelected ? 'bg-sky-100 text-sky-800' : 'bg-stone-100 text-stone-600',
                        ].join(' ')}
                        aria-hidden
                      >
                        {song.song_number != null ? song.song_number : '—'}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{song.title}</span>
                      {keyLabel ? (
                        <span className="shrink-0 rounded-md bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                          {keyLabel}
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>,
            document.body,
          )
        : null}

      {open && filteredSongs.length > 0 ? (
        <p className="mt-1 text-[11px] text-stone-500">
          {filteredSongs.length === songs.length
            ? `${filteredSongs.length} ${filteredSongs.length === 1 ? 'песня' : filteredSongs.length < 5 ? 'песни' : 'песен'}`
            : `Найдено: ${filteredSongs.length} из ${songs.length}`}
          {' · '}
          ↑↓ и Enter для выбора
        </p>
      ) : null}
    </div>
  );
}
