import { useMemo, useState } from 'react';
import { addMinutes, format, isValid, parse } from 'date-fns';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { LuClock3, LuUsers } from 'react-icons/lu';

import { SectionHeroToolbarEnd } from '@/components/SectionHeroToolbarEnd';
import { sectionHeroHeaderClass, sectionHeroStickyClass } from '../../../lib/sectionHeroChrome';
import type { ServiceItem, ServiceItemType, ServiceItemWithTime } from '../types';

function parseStartTimeToDate(startTime: string): Date {
  // startTime: "10:00" (24h). Anchor on today's date.
  const base = new Date();
  const d = parse(startTime, 'HH:mm', base);
  return isValid(d) ? d : base;
}

export function calculateTimes(items: ServiceItem[], startTime: string): ServiceItemWithTime[] {
  let cursor = parseStartTimeToDate(startTime);
  return items.map((it) => {
    const calculatedStartTime = format(cursor, 'HH:mm');
    cursor = addMinutes(cursor, Math.max(0, Math.round(it.durationMinutes || 0)));
    return { ...it, calculatedStartTime };
  });
}

function reorder<T>(list: T[], startIndex: number, endIndex: number): T[] {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
}

function typeLabel(t: ServiceItemType): { label: string; className: string } {
  switch (t) {
    case 'song':
      return { label: 'Песня', className: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200/70' };
    case 'sermon':
      return { label: 'Проповедь', className: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200/70' };
    case 'announcement':
      return { label: 'Объявления', className: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200/70' };
    default:
      return { label: 'Другое', className: 'bg-stone-50 text-stone-700 ring-1 ring-stone-200/70' };
  }
}

function GripDots() {
  return (
    <div className="grid w-4 grid-cols-2 gap-1 text-stone-400">
      {Array.from({ length: 6 }).map((_, i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      ))}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = useMemo(() => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? '?';
    const second = parts[1]?.[0] ?? '';
    return (first + second).toUpperCase();
  }, [name]);

  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-stone-100 text-xs font-extrabold text-stone-700 ring-1 ring-stone-200/70">
      {initials}
    </div>
  );
}

export function ServiceFlowComponent() {
  const [serviceDate] = useState<Date>(() => new Date());
  const [startTime] = useState('10:00');

  const [items, setItems] = useState<ServiceItem[]>(() => [
    { id: 'open', title: 'Открытие', type: 'other', durationMinutes: 3, assignedTo: 'Ведущий' },
    { id: 'worship-1', title: 'Блок прославления', type: 'song', durationMinutes: 18, assignedTo: 'Группа' },
    { id: 'announce', title: 'Объявления', type: 'announcement', durationMinutes: 5, assignedTo: 'Админ' },
    { id: 'sermon', title: 'Проповедь', type: 'sermon', durationMinutes: 35, assignedTo: 'Пастор' },
    { id: 'song-2', title: 'Ответная песня', type: 'song', durationMinutes: 6, assignedTo: 'Группа' },
    { id: 'end', title: 'Завершение + молитва', type: 'other', durationMinutes: 6, assignedTo: 'Ведущий' },
  ]);

  const timedItems = useMemo(() => calculateTimes(items, startTime), [items, startTime]);
  const dateText = useMemo(
    () => new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(serviceDate),
    [serviceDate],
  );

  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    if (result.destination.index === result.source.index) return;
    setItems((prev) => reorder(prev, result.source.index, result.destination!.index));
  }

  return (
    <div className="min-h-full bg-[var(--surface)] max-lg:pb-0 lg:pb-8">
      <div className={sectionHeroStickyClass}>
        <header className={`${sectionHeroHeaderClass} prayer-hero`}>
          <div
            className="pointer-events-none absolute -right-4 -top-20 h-48 w-48 rounded-full bg-white/[0.13] blur-3xl animate-prayer-header-breathe motion-reduce:animate-none"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-12 -left-10 h-40 w-40 rounded-full bg-black/18 blur-2xl"
            aria-hidden
          />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-extrabold leading-tight tracking-tight sm:text-2xl md:text-3xl lg:text-[1.65rem] xl:text-3xl animate-prayer-fade-up motion-reduce:animate-none">
                План служения
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-white/90">
                <span className="capitalize">{dateText}</span>
                <span className="hidden text-white/55 sm:inline">•</span>
                <span className="inline-flex items-center gap-2">
                  <LuClock3 className="h-4 w-4" strokeWidth={2} aria-hidden />
                  Начало: <span className="font-extrabold text-white">{startTime}</span>
                </span>
              </div>
              <p className="mt-2 max-w-3xl text-sm text-white/85 md:text-base">
                Перетаскивайте блоки — время начала пересчитается автоматически.
              </p>
            </div>
            <SectionHeroToolbarEnd />
          </div>
        </header>
      </div>

      <div className="px-3 py-6 sm:px-4 sm:py-8 md:px-6 lg:px-8 xl:px-10">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 sm:gap-6">
          <section className="rounded-[1.35rem] border border-stone-200/70 bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-card)] sm:rounded-3xl sm:p-6 sm:shadow-[var(--shadow)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-extrabold text-[var(--text)] sm:text-lg">Service Flow</h2>
                <p className="mt-0.5 text-xs font-semibold text-[var(--text-secondary)]">
                  {timedItems.length} блоков • перетаскивание мышью или пальцем
                </p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-2xl bg-[var(--surface)] px-3 py-2 text-xs font-extrabold text-[var(--text-secondary)] ring-1 ring-stone-200/70">
                <LuUsers className="h-4 w-4" strokeWidth={2} aria-hidden />
                Команда: черновик
              </div>
            </div>

            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="service-flow">
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={[
                      'space-y-3 rounded-3xl p-1 transition',
                      snapshot.isDraggingOver ? 'bg-primary/5 ring-1 ring-primary/15' : '',
                    ].join(' ')}
                  >
                    {timedItems.map((item, index) => {
                      const badge = typeLabel(item.type);
                      return (
                        <Draggable key={item.id} draggableId={item.id} index={index}>
                          {(dragProvided, dragSnapshot) => (
                            <article
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              className={[
                                'group rounded-3xl border border-stone-200/70 bg-[var(--surface-elevated)] p-4 shadow-sm transition sm:p-5',
                                dragSnapshot.isDragging ? 'shadow-lg ring-2 ring-primary/20' : 'hover:bg-[var(--surface)]',
                              ].join(' ')}
                            >
                              <div className="flex items-start gap-3 sm:gap-4">
                                <div className="flex shrink-0 items-start gap-3">
                                  <button
                                    type="button"
                                    aria-label="Перетащить"
                                    {...dragProvided.dragHandleProps}
                                    className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-stone-200/70 bg-[var(--surface-elevated)] text-[var(--text-secondary)] shadow-sm hover:bg-[var(--surface)] active:scale-[0.98]"
                                  >
                                    <GripDots />
                                  </button>
                                  <div className="min-w-[58px]">
                                    <div className="text-base font-extrabold leading-none text-[var(--text)]">
                                      {item.calculatedStartTime}
                                    </div>
                                    <div className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">
                                      старт
                                    </div>
                                  </div>
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-start gap-2">
                                    <h3 className="min-w-0 flex-1 truncate text-base font-extrabold leading-snug text-[var(--text)]">
                                      {item.title}
                                    </h3>
                                    <span className={['inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-extrabold', badge.className].join(' ')}>
                                      {badge.label}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">
                                    Перетащите, чтобы изменить порядок
                                  </p>
                                </div>

                                <div className="flex shrink-0 items-start gap-3">
                                  <div className="text-right">
                                    <div className="text-sm font-extrabold text-[var(--text)]">
                                      {item.durationMinutes} мин
                                    </div>
                                    <div className="mt-1 text-xs font-semibold text-[var(--text-secondary)]">
                                      {item.assignedTo}
                                    </div>
                                  </div>
                                  <Avatar name={item.assignedTo} />
                                </div>
                              </div>
                            </article>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </section>
        </div>
      </div>
    </div>
  );
}

