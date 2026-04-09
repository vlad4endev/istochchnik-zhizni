import { useEffect, useMemo, useRef, useState } from 'react';
import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd';
import { LuGripHorizontal, LuImagePlus, LuPlay, LuTrash2 } from 'react-icons/lu';

import { useProfileDraftStore } from '../profileDraftStore';
import profileShell from '../profileShell.module.css';
import igStyles from './PostEditor.module.css';

type MediaKind = 'image' | 'video';

type MediaDraftItem = {
  id: string;
  file: File;
  kind: MediaKind;
  previewUrl: string;
};

function isSupportedFile(file: File): boolean {
  const mt = (file.type || '').toLowerCase();
  return mt.startsWith('image/') || mt.startsWith('video/');
}

function inferKind(file: File): MediaKind {
  return (file.type || '').toLowerCase().startsWith('video/') ? 'video' : 'image';
}

function reorder<T>(list: T[], startIndex: number, endIndex: number): T[] {
  const result = [...list];
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
}

function renderHashtags(text: string): Array<string | { tag: string }> {
  const re = /#[\p{L}\p{N}_]+/gu;
  const out: Array<string | { tag: string }> = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    out.push({ tag: m[0] });
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function PostEditor(props: {
  maxFiles?: number;
  onChange?: (draft: { caption: string; files: File[] }) => void;
  /** Компоновка как в Instagram: квадрат медиа + колонка подписи (для модалки). */
  instagramLayout?: boolean;
}) {
  const maxFiles = props.maxFiles ?? 10;
  const instagramLayout = props.instagramLayout ?? false;
  const [items, setItems] = useState<MediaDraftItem[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [caption, setCaption] = useState('');

  const inputRef = useRef<HTMLInputElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const mirrorScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const hasDraft = caption.trim().length > 0 || items.length > 0;
    useProfileDraftStore.getState().setHasActivePostDraft(hasDraft);
    return () => {
      useProfileDraftStore.getState().setHasActivePostDraft(false);
    };
  }, [caption, items]);

  useEffect(() => {
    props.onChange?.({ caption, files: items.map((x) => x.file) });
  }, [caption, items, props]);

  useEffect(() => {
    return () => {
      for (const it of items) URL.revokeObjectURL(it.previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = items[activeIdx] ?? null;
  const gridPreview = items[0] ?? null;
  const canAddMore = items.length < maxFiles;
  const hashtagTokens = useMemo(() => renderHashtags(caption), [caption]);

  const onPickFiles = (filesLike: FileList | File[] | null | undefined) => {
    if (!filesLike) return;
    const list = Array.from(filesLike);
    const filtered = list.filter(isSupportedFile);
    if (filtered.length === 0) return;

    setItems((prev) => {
      const left = Math.max(0, maxFiles - prev.length);
      const take = filtered.slice(0, left);
      const next: MediaDraftItem[] = [
        ...prev,
        ...take.map((file) => ({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          file,
          kind: inferKind(file),
          previewUrl: URL.createObjectURL(file),
        })),
      ];
      return next;
    });
    setActiveIdx((i) => (items.length === 0 ? 0 : i));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canAddMore) return;
    onPickFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const removeAt = (idx: number) => {
    setItems((prev) => {
      const it = prev[idx];
      if (it) URL.revokeObjectURL(it.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
    setActiveIdx((cur) => {
      if (idx < cur) return Math.max(0, cur - 1);
      if (idx === cur) return Math.max(0, cur - 1);
      return cur;
    });
  };

  const onReorder = (r: DropResult) => {
    if (!r.destination) return;
    const from = r.source.index;
    const to = r.destination.index;
    if (from === to) return;
    setItems((prev) => reorder(prev, from, to));
    setActiveIdx((cur) => {
      if (cur === from) return to;
      if (from < cur && to >= cur) return cur - 1;
      if (from > cur && to <= cur) return cur + 1;
      return cur;
    });
  };

  const syncScroll = () => {
    const ta = taRef.current;
    const mirror = mirrorScrollRef.current;
    if (!ta || !mirror) return;
    mirror.scrollTop = ta.scrollTop;
    mirror.scrollLeft = ta.scrollLeft;
  };

  /* ─── Instagram layout (модалка) ─── */
  if (instagramLayout) {
    return (
      <div className={igStyles.igRoot} data-profile-root>
        <div className={igStyles.igGrid}>
          <div className={igStyles.igMediaPane}>
            <div
              className={igStyles.igPreviewSquare}
              onDrop={onDrop}
              onDragOver={onDragOver}
              role="presentation"
            >
              {items.length === 0 ? (
                <button
                  type="button"
                  className={igStyles.igEmpty}
                  onClick={() => inputRef.current?.click()}
                >
                  <LuImagePlus className={igStyles.igEmptyIcon} strokeWidth={1} aria-hidden />
                  <span className={igStyles.igEmptyTitle}>Перетащите фото и видео сюда</span>
                  <span className={igStyles.igEmptyHint}>или нажмите, чтобы выбрать</span>
                </button>
              ) : active ? (
                <>
                  {active.kind === 'video' ? (
                    <video
                      src={active.previewUrl}
                      className={igStyles.igVideo}
                      controls
                      playsInline
                    />
                  ) : (
                    <img
                      src={active.previewUrl}
                      alt=""
                      className={igStyles.igPreviewMedia}
                    />
                  )}
                  {items.length > 1 ? (
                    <div className={igStyles.igDots}>
                      {items.map((it, i) => (
                        <span
                          key={it.id}
                          className={i === activeIdx ? `${igStyles.igDot} ${igStyles.igDotActive}` : igStyles.igDot}
                        />
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => {
                onPickFiles(e.target.files);
                e.currentTarget.value = '';
              }}
            />

            {items.length > 0 ? (
              <DragDropContext onDragEnd={onReorder}>
                <Droppable droppableId="ig-media" direction="horizontal">
                  {(dropProvided) => (
                    <div
                      ref={dropProvided.innerRef}
                      {...dropProvided.droppableProps}
                      className={igStyles.igThumbRow}
                    >
                      {items.map((it, idx) => (
                        <Draggable key={it.id} draggableId={it.id} index={idx}>
                          {(dragProvided, snapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              role="button"
                              tabIndex={0}
                              className={[
                                igStyles.igThumb,
                                idx === activeIdx ? igStyles.igThumbActive : '',
                                snapshot.isDragging ? 'opacity-90' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              onClick={() => setActiveIdx(idx)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setActiveIdx(idx);
                                }
                              }}
                              aria-label={`Кадр ${idx + 1}`}
                            >
                              <div className="relative h-full w-full">
                                {it.kind === 'video' ? (
                                  <>
                                    <video
                                      src={it.previewUrl}
                                      className={igStyles.igThumbImg}
                                      muted
                                      playsInline
                                    />
                                    <div className="absolute inset-0 grid place-items-center bg-black/15">
                                      <LuPlay className="h-4 w-4 text-white drop-shadow" aria-hidden />
                                    </div>
                                  </>
                                ) : (
                                  <img src={it.previewUrl} alt="" className={igStyles.igThumbImg} />
                                )}
                                <span
                                  {...dragProvided.dragHandleProps}
                                  className={igStyles.igThumbGrip}
                                  title="Порядок"
                                >
                                  <LuGripHorizontal className="h-3 w-3" aria-hidden />
                                  {idx + 1}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeAt(idx);
                                  }}
                                  className={igStyles.igThumbRemove}
                                  aria-label="Удалить"
                                >
                                  <LuTrash2 className="h-3 w-3" aria-hidden />
                                </button>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {dropProvided.placeholder}
                      {canAddMore ? (
                        <button
                          type="button"
                          className={igStyles.igAddTile}
                          onClick={() => inputRef.current?.click()}
                          aria-label="Добавить ещё"
                        >
                          <LuImagePlus className="h-5 w-5" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            ) : null}
          </div>

          <div className={igStyles.igCaptionPane}>
            <div className={igStyles.igCaptionHeader}>Подпись</div>
            <div className={igStyles.igCaptionInner}>
              <div ref={mirrorScrollRef} aria-hidden className={igStyles.igMirror}>
                {hashtagTokens.map((t, i) =>
                  typeof t === 'string' ? (
                    <span key={i}>{t}</span>
                  ) : (
                    <span key={i} className={igStyles.igTag}>
                      {t.tag}
                    </span>
                  ),
                )}
                {caption.length === 0 ? <span style={{ color: '#c7c7c7' }}>Напишите подпись…</span> : null}
              </div>
              <textarea
                ref={taRef}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                onScroll={syncScroll}
                className={igStyles.igTextarea}
                maxLength={2200}
                autoComplete="off"
                spellCheck
              />
            </div>
            <div className={igStyles.igCaptionFooter}>
              <span>#хештеги подсвечиваются</span>
              <span>{caption.length} / 2200</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Полная форма (страница) ─── */
  return (
    <section
      className={`${profileShell.profileRoot} rounded-3xl bg-[color:var(--profile-card-bg)] p-5 shadow-[0_10px_30px_rgba(28,25,23,0.08)] ring-1 ring-[color:var(--profile-card-ring)] backdrop-blur`}
      data-profile-root
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[color:var(--profile-text-soft)]">
            Новый пост
          </p>
          <p className="mt-1 text-sm font-semibold text-[color:var(--profile-text-body)]">
            Фото/видео, подпись, live-preview
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={!canAddMore}
            className="inline-flex items-center gap-2 rounded-full bg-[color:var(--profile-primary)] px-4 py-2 text-xs font-extrabold text-white shadow-[0_8px_24px_color-mix(in_srgb,var(--profile-primary)_20%,transparent)] disabled:opacity-60"
          >
            <LuImagePlus className="h-4 w-4" aria-hidden />
            Добавить медиа
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              onPickFiles(e.target.files);
              e.currentTarget.value = '';
            }}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-4">
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            className="group relative grid min-h-[160px] cursor-pointer place-items-center overflow-hidden rounded-3xl border border-dashed border-[color:var(--profile-card-ring)] bg-[color:color-mix(in_srgb,var(--profile-surface-elevated)_65%,var(--profile-surface))] p-5 transition hover:bg-[color:color-mix(in_srgb,var(--profile-surface-elevated)_85%,var(--profile-surface))]"
            aria-label="Зона загрузки: перетащите файлы или нажмите"
          >
            <div className="text-center">
              <p className="text-sm font-extrabold text-[color:var(--profile-text-body)]">Перетащи фото/видео сюда</p>
              <p className="mt-1 text-sm font-semibold text-[color:var(--profile-text-muted)]">
                или нажми, чтобы выбрать файлы (до {maxFiles})
              </p>
              {!canAddMore && (
                <p className="mt-2 text-xs font-semibold text-amber-700">Достигнут лимит файлов</p>
              )}
            </div>
          </div>

          <div className="rounded-3xl bg-[color:color-mix(in_srgb,var(--profile-card-bg)_72%,var(--profile-surface))] p-4 ring-1 ring-[color:var(--profile-card-ring)]">
            <div className="flex items-center justify-between">
              <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[color:var(--profile-text-soft)]">
                Предпросмотр
              </p>
              <p className="text-xs font-semibold text-[color:var(--profile-text-muted)]">
                {items.length} / {maxFiles}
              </p>
            </div>

            <div className="mt-3">
              {active ? (
                <div className="relative aspect-square overflow-hidden rounded-2xl bg-[color:var(--profile-media-placeholder-mid)]">
                  {active.kind === 'video' ? (
                    <video
                      src={active.previewUrl}
                      className="h-full w-full object-cover"
                      controls
                      playsInline
                    />
                  ) : (
                    <img src={active.previewUrl} alt="Выбранное медиа" className="h-full w-full object-cover" />
                  )}
                </div>
              ) : (
                <div className="grid aspect-square place-items-center rounded-2xl bg-[color:var(--profile-media-placeholder-mid)] text-center">
                  <p className="text-sm font-semibold text-[color:var(--profile-text-muted)]">
                    Добавь медиа, чтобы увидеть карусель.
                  </p>
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="mt-4">
                <DragDropContext onDragEnd={onReorder}>
                  <Droppable droppableId="media" direction="horizontal">
                    {(dropProvided) => (
                      <div
                        ref={dropProvided.innerRef}
                        {...dropProvided.droppableProps}
                        className="flex gap-2 overflow-x-auto pb-1"
                      >
                        {items.map((it, idx) => (
                          <Draggable key={it.id} draggableId={it.id} index={idx}>
                            {(dragProvided, snapshot) => (
                              <button
                                type="button"
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                className={[
                                  'relative shrink-0 overflow-hidden rounded-2xl ring-1 transition',
                                  idx === activeIdx ? 'ring-[color:var(--profile-primary)]' : 'ring-[color:var(--profile-card-ring)]',
                                  snapshot.isDragging ? 'opacity-90' : 'opacity-100',
                                ].join(' ')}
                                onClick={() => setActiveIdx(idx)}
                                aria-label={`Медиа ${idx + 1}`}
                              >
                                <div className="relative h-20 w-20 bg-[color:var(--profile-media-placeholder-mid)]">
                                  {it.kind === 'video' ? (
                                    <>
                                      <video
                                        src={it.previewUrl}
                                        className="h-full w-full object-cover"
                                        muted
                                        playsInline
                                      />
                                      <div className="absolute inset-0 grid place-items-center bg-black/20">
                                        <LuPlay className="h-5 w-5 text-white" aria-hidden />
                                      </div>
                                    </>
                                  ) : (
                                    <img src={it.previewUrl} alt="" className="h-full w-full object-cover" />
                                  )}
                                </div>

                                <div
                                  {...dragProvided.dragHandleProps}
                                  className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-1 text-[10px] font-extrabold text-white"
                                  title="Перетащи, чтобы поменять порядок"
                                >
                                  <LuGripHorizontal className="h-3 w-3" aria-hidden />
                                  {idx + 1}
                                </div>

                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeAt(idx);
                                  }}
                                  className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--profile-card-bg)_92%,transparent)] text-[color:var(--profile-text-body)] ring-1 ring-[color:var(--profile-card-ring)] transition hover:bg-[color:var(--profile-card-bg)]"
                                  aria-label="Удалить медиа"
                                  title="Удалить"
                                >
                                  <LuTrash2 className="h-4 w-4" aria-hidden />
                                </button>
                              </button>
                            )}
                          </Draggable>
                        ))}
                        {dropProvided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
                <p className="mt-2 text-xs font-semibold text-[color:var(--profile-text-muted)]">
                  Можно перетаскивать миниатюры, чтобы изменить порядок в карусели.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-[color:color-mix(in_srgb,var(--profile-card-bg)_72%,var(--profile-surface))] p-4 ring-1 ring-[color:var(--profile-card-ring)]">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[color:var(--profile-text-soft)]">
              Подпись (хештеги подсвечиваются)
            </p>

            <div className="relative mt-3">
              <div
                ref={mirrorScrollRef}
                aria-hidden
                className="pointer-events-none absolute inset-0 overflow-auto rounded-2xl border border-[color:var(--profile-card-ring)] bg-white px-4 py-3 text-[15px] font-semibold leading-[1.45] text-[color:var(--profile-text-heading)]"
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
              >
                {hashtagTokens.map((t, i) =>
                  typeof t === 'string' ? (
                    <span key={i} className="text-[color:var(--profile-text-heading)]">
                      {t}
                    </span>
                  ) : (
                    <span key={i} className="text-[color:var(--profile-accent-blue)]">
                      {t.tag}
                    </span>
                  ),
                )}
                {caption.length === 0 ? (
                  <span className="text-[color:var(--profile-text-faint)]">Напиши подпись…</span>
                ) : null}
              </div>

              <textarea
                ref={taRef}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                onScroll={syncScroll}
                placeholder="Напиши подпись… #хештег"
                className="relative min-h-[120px] w-full resize-y rounded-2xl border border-[color:var(--profile-card-ring)] bg-transparent px-4 py-3 text-[15px] font-semibold leading-[1.45] text-transparent outline-none caret-[color:var(--profile-text-heading)]"
                style={{ WebkitTextFillColor: 'transparent' }}
                maxLength={2200}
              />
            </div>

            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-[color:var(--profile-text-muted)]">
                Пример: <span className="text-[color:var(--profile-accent-blue)]">#источникЖизни</span>
              </p>
              <p className="text-xs font-semibold text-[color:var(--profile-text-muted)]">{caption.length} / 2200</p>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-3xl bg-[color:color-mix(in_srgb,var(--profile-card-bg)_72%,var(--profile-surface))] p-4 ring-1 ring-[color:var(--profile-card-ring)]">
            <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[color:var(--profile-text-soft)]">
              Live-preview
            </p>
            <p className="mt-1 text-sm font-semibold text-[color:var(--profile-text-soft)]">
              Так пост будет выглядеть в основной сетке профиля.
            </p>

            <div className="mt-4 rounded-3xl bg-[color:var(--profile-surface)] p-4 ring-1 ring-[color:var(--profile-card-ring)]">
              <div className="grid grid-cols-3 gap-2">
                <div className="aspect-square rounded-2xl bg-[color:color-mix(in_srgb,var(--profile-media-placeholder)_50%,transparent)]" />
                <div className="aspect-square rounded-2xl bg-[color:color-mix(in_srgb,var(--profile-media-placeholder)_50%,transparent)]" />
                <div className="aspect-square rounded-2xl bg-[color:color-mix(in_srgb,var(--profile-media-placeholder)_50%,transparent)]" />

                <div className="relative aspect-square overflow-hidden rounded-2xl ring-2 ring-[color:var(--profile-primary)] shadow-[0_10px_22px_color-mix(in_srgb,var(--profile-primary)_18%,transparent)]">
                  {gridPreview ? (
                    gridPreview.kind === 'video' ? (
                      <>
                        <video
                          src={gridPreview.previewUrl}
                          className="h-full w-full object-cover"
                          muted
                          playsInline
                        />
                        <div className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[10px] font-extrabold text-white">
                          <LuPlay className="h-3 w-3" aria-hidden />
                          VIDEO
                        </div>
                      </>
                    ) : (
                      <img src={gridPreview.previewUrl} alt="Live preview" className="h-full w-full object-cover" />
                    )
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-[color:var(--profile-media-placeholder-mid)]">
                      <p className="text-xs font-semibold text-[color:var(--profile-text-muted)]">Нет медиа</p>
                    </div>
                  )}
                </div>

                <div className="aspect-square rounded-2xl bg-[color:color-mix(in_srgb,var(--profile-media-placeholder)_50%,transparent)]" />
                <div className="aspect-square rounded-2xl bg-[color:color-mix(in_srgb,var(--profile-media-placeholder)_50%,transparent)]" />
                <div className="aspect-square rounded-2xl bg-[color:color-mix(in_srgb,var(--profile-media-placeholder)_50%,transparent)]" />
              </div>
            </div>

            <div className="mt-4 rounded-3xl bg-[color:color-mix(in_srgb,var(--profile-card-bg)_60%,var(--profile-surface))] p-4 ring-1 ring-[color:var(--profile-card-ring)]">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[color:var(--profile-text-soft)]">
                Текст под постом (пример)
              </p>
              <p className="mt-2 text-sm font-semibold text-[color:var(--profile-text-body)]">
                {caption.trim().length > 0 ? caption : 'Подпись появится здесь…'}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
