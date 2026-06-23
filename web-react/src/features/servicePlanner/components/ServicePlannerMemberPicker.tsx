import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { LuChevronDown, LuSearch, LuUser, LuX } from 'react-icons/lu';
import {
  filterServicePlannerMembers,
  formatServicePlannerMemberLabel,
  formatServicePlannerMemberSubtitle,
  getServicePlannerMemberInitials,
  type ServicePlannerMemberOption,
} from '../memberPickerUtils';

export type ServicePlannerMemberPickerProps = {
  id?: string;
  members: ServicePlannerMemberOption[];
  value: number | null;
  onChange: (memberId: number | null, member: ServicePlannerMemberOption | null) => void;
  placeholder?: string;
  clearLabel?: string;
  orphanLabel?: string | null;
  disabled?: boolean;
  disabledHint?: string | null;
  className?: string;
  listClassName?: string;
  autoFocus?: boolean;
};

export function ServicePlannerMemberPicker({
  id,
  members,
  value,
  onChange,
  placeholder = 'Поиск по имени, роли или направлению…',
  clearLabel = 'Ответственный не назначен',
  orphanLabel = null,
  disabled = false,
  disabledHint = null,
  className = '',
  listClassName = '',
  autoFocus = false,
}: ServicePlannerMemberPickerProps) {
  const reactId = useId();
  const inputId = id ?? `service-planner-member-${reactId}`;
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

  const selectedMember = useMemo(
    () => (value != null ? members.find((member) => member.id === value) ?? null : null),
    [members, value],
  );

  const filteredMembers = useMemo(() => filterServicePlannerMembers(members, query), [members, query]);

  const orphanSelected = value != null && !selectedMember;
  const resolvedLabel = selectedMember
    ? formatServicePlannerMemberLabel(selectedMember)
    : orphanSelected
      ? orphanLabel ?? `Участник #${value} (нет в списке)`
      : null;
  const selectedLabel = disabled ? disabledHint ?? resolvedLabel : resolvedLabel;

  const optionCount = filteredMembers.length + 1;

  const scrollHighlightedIntoView = useCallback((index: number) => {
    const list = listRef.current;
    if (!list) return;
    const option = list.querySelector<HTMLElement>(`[data-option-index="${index}"]`);
    option?.scrollIntoView({ block: 'nearest' });
  }, []);

  const selectMember = useCallback(
    (memberId: number | null) => {
      if (disabled) return;
      const member = memberId != null ? members.find((item) => item.id === memberId) ?? null : null;
      onChange(memberId, member);
      setQuery('');
      setOpen(false);
      setHighlightIndex(0);
    },
    [disabled, members, onChange],
  );

  const openPicker = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    queueMicrotask(() => {
      updateDropdownPosition();
      inputRef.current?.focus();
    });
  }, [disabled, updateDropdownPosition]);

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
  }, [open, updateDropdownPosition, filteredMembers.length, query]);

  useEffect(() => {
    if (!open) return;
    const selectedIndex = value != null ? filteredMembers.findIndex((member) => member.id === value) : -1;
    const nextIndex = selectedIndex >= 0 ? selectedIndex + 1 : 0;
    setHighlightIndex(nextIndex);
    queueMicrotask(() => scrollHighlightedIntoView(nextIndex));
  }, [open, value, filteredMembers, scrollHighlightedIntoView]);

  useEffect(() => {
    if (!autoFocus || disabled) return;
    openPicker();
  }, [autoFocus, disabled, openPicker]);

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
    if (disabled) return;
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
        selectMember(null);
        return;
      }
      const member = filteredMembers[highlightIndex - 1];
      if (member) selectMember(member.id);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
    }
  };

  if (disabled) {
    return (
      <div className={`min-w-0 ${className}`.trim()}>
        <div className="flex min-h-11 items-center rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-700 sm:min-h-9 sm:py-2">
          <LuUser className="mr-2 size-4 shrink-0 text-stone-400" aria-hidden />
          <span className="min-w-0 truncate">{selectedLabel ?? clearLabel}</span>
        </div>
        {disabledHint ? (
          <p className="mt-1 text-[11px] leading-snug text-stone-500">Меняется в настройках программы</p>
        ) : null}
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`.trim()}>
      <div
        className={[
          'flex min-h-11 items-stretch overflow-hidden rounded-lg border bg-white shadow-sm transition-colors touch-manipulation sm:min-h-9',
          open ? 'border-violet-400 ring-2 ring-violet-100' : 'border-stone-300 hover:border-stone-400',
        ].join(' ')}
      >
        <label htmlFor={inputId} className="sr-only">
          Поиск ответственного
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
            onClick={() => selectMember(null)}
            className="flex shrink-0 items-center px-2 text-stone-400 transition-colors hover:text-stone-700"
            aria-label="Сбросить выбор ответственного"
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
          aria-label={open ? 'Закрыть список участников' : 'Открыть список участников'}
        >
          <LuChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {selectedLabel != null ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-stone-600">
          <LuUser className="size-3.5 shrink-0 text-violet-600" aria-hidden />
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
              aria-label="Список участников"
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
                onClick={() => selectMember(null)}
                className={[
                  'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors sm:py-2',
                  highlightIndex === 0 ? 'bg-violet-50 text-violet-900' : 'text-stone-600 hover:bg-stone-50',
                  value == null ? 'font-medium' : '',
                ].join(' ')}
              >
                <span className="size-8 shrink-0 rounded-full border border-dashed border-stone-300 bg-stone-50" aria-hidden />
                <span>{clearLabel}</span>
              </button>

              {filteredMembers.length === 0 ? (
                <p className="px-3 py-3 text-sm text-stone-500">Никого не найдено. Попробуйте другой запрос.</p>
              ) : (
                filteredMembers.map((member, index) => {
                  const optionIndex = index + 1;
                  const isSelected = value === member.id;
                  const isHighlighted = highlightIndex === optionIndex;
                  const subtitle = formatServicePlannerMemberSubtitle(member);

                  return (
                    <button
                      key={member.id}
                      type="button"
                      role="option"
                      id={`${listboxId}-option-${optionIndex}`}
                      data-option-index={optionIndex}
                      aria-selected={isSelected}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setHighlightIndex(optionIndex)}
                      onClick={() => selectMember(member.id)}
                      className={[
                        'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition-colors sm:py-2',
                        isHighlighted ? 'bg-violet-50' : 'hover:bg-stone-50',
                        isSelected ? 'font-medium text-violet-900' : 'text-stone-800',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                          isSelected ? 'bg-violet-100 text-violet-800' : 'bg-stone-100 text-stone-600',
                        ].join(' ')}
                        aria-hidden
                      >
                        {getServicePlannerMemberInitials(member)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{formatServicePlannerMemberLabel(member)}</span>
                        {subtitle ? (
                          <span className="block truncate text-xs font-normal text-stone-500">{subtitle}</span>
                        ) : null}
                      </span>
                    </button>
                  );
                })
              )}
            </div>,
            document.body,
          )
        : null}

      {open && filteredMembers.length > 0 ? (
        <p className="mt-1 text-[11px] text-stone-500">
          {filteredMembers.length === members.length
            ? `${filteredMembers.length} ${filteredMembers.length === 1 ? 'участник' : filteredMembers.length < 5 ? 'участника' : 'участников'}`
            : `Найдено: ${filteredMembers.length} из ${members.length}`}
          {' · '}
          ↑↓ и Enter для выбора
        </p>
      ) : null}
    </div>
  );
}
