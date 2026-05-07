import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import { ActionIcon, Avatar, Box, Group, Image, Modal, Stack, Text, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconChevronLeft, IconChevronRight, IconDownload, IconShare, IconX } from '@tabler/icons-react';

import { MediaStrip } from './MediaStrip';
import classes from './MediaViewer.module.css';
import { useMediaViewer } from './useMediaViewer';

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

function touchDistance(tl: TouchList) {
  if (tl.length < 2) return 0;
  const a = tl[0];
  const b = tl[1];
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
}

export function MediaViewer() {
  const { open, items, index, closeViewer, navigate, setIndex } = useMediaViewer();
  const item = items[index];
  const videoRef = useRef<HTMLVideoElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(1);
  const translateRef = useRef({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dismissDragY, setDismissDragY] = useState(0);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const dragBase = useRef({ x: 0, y: 0 });
  const touchStartX = useRef<number | null>(null);
  const isMobile = useMediaQuery('(max-width: 48em)');
  const hasMultipleItems = items.length > 1;
  const mediaMaxHeight = isMobile
    ? hasMultipleItems
      ? 'calc(100dvh - 190px)'
      : 'calc(100dvh - 128px)'
    : '82vh';

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useEffect(() => {
    translateRef.current = translate;
  }, [translate]);

  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    setDismissDragY(0);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [index, open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') navigate(-1);
      if (event.key === 'ArrowRight') navigate(1);
      if (event.key === 'Escape') closeViewer();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, navigate, closeViewer]);

  const onTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0].clientX;
  };

  const onTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return;
    const dx = event.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) navigate(dx < 0 ? 1 : -1);
    touchStartX.current = null;
  };

  const onDoubleClick = useCallback(
    (event: MouseEvent) => {
      if (item?.type !== 'photo') return;
      if (scale > 1) {
        setScale(1);
        setTranslate({ x: 0, y: 0 });
        return;
      }
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const cx = event.clientX - rect.left - rect.width / 2;
      const cy = event.clientY - rect.top - rect.height / 2;
      setScale(2);
      setTranslate({ x: -cx * 0.5, y: -cy * 0.5 });
    },
    [scale, item],
  );

  const onMouseDown = (event: MouseEvent) => {
    if (scale <= 1) return;
    dragStart.current = { x: event.clientX, y: event.clientY };
    dragBase.current = { ...translate };
    setDragging(true);
  };

  const onMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!dragStart.current) return;
      const dx = (event.clientX - dragStart.current.x) / scale;
      const dy = (event.clientY - dragStart.current.y) / scale;
      setTranslate({ x: dragBase.current.x + dx, y: dragBase.current.y + dy });
    },
    [scale],
  );

  const onMouseUp = () => {
    dragStart.current = null;
    setDragging(false);
  };

  const [touchGestureActive, setTouchGestureActive] = useState(false);

  useEffect(() => {
    setTouchGestureActive(false);
  }, [index, open]);

  useLayoutEffect(() => {
    if (!open || !isMobile || !item) return;
    const root = contentRef.current;
    if (!root) return;

    const fromStrip = (target: EventTarget | null) =>
      target instanceof Element && target.closest('[data-media-strip]') != null;

    type Mode = 'idle' | 'pinch' | 'pan' | 'swipe';
    let mode: Mode = 'idle';
    let pinch: { d0: number; s0: number } | null = null;
    let pan: { x: number; y: number; tx: number; ty: number } | null = null;
    let swipe: { x: number; y: number } | null = null;
    let swipeDismissOffset = 0;

    const clampScale = (s: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s));

    const snapOutOfZoom = () => {
      if (scaleRef.current < 1.02) {
        setScale(1);
        setTranslate({ x: 0, y: 0 });
      }
    };

    const onStart = (e: TouchEvent) => {
      if (fromStrip(e.target)) return;

      if (item.type === 'photo' && e.touches.length === 2) {
        mode = 'pinch';
        const d0 = touchDistance(e.touches);
        pinch = { d0: Math.max(d0, 24), s0: scaleRef.current };
        pan = null;
        swipe = null;
        swipeDismissOffset = 0;
        setDismissDragY(0);
        setTouchGestureActive(true);
        return;
      }

      if (e.touches.length !== 1) return;
      const t = e.touches[0];

      if (item.type === 'photo' && scaleRef.current > 1) {
        mode = 'pan';
        pan = { x: t.clientX, y: t.clientY, tx: translateRef.current.x, ty: translateRef.current.y };
        swipe = null;
        pinch = null;
        setTouchGestureActive(true);
        return;
      }

      mode = 'swipe';
      swipe = { x: t.clientX, y: t.clientY };
      pan = null;
      pinch = null;
      swipeDismissOffset = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (fromStrip(e.target)) return;

      if (item.type === 'photo' && e.touches.length === 2 && pinch) {
        e.preventDefault();
        const d = touchDistance(e.touches);
        const next = clampScale(pinch.s0 * (d / pinch.d0));
        setScale(next);
        if (next <= 1) setTranslate({ x: 0, y: 0 });
        return;
      }

      if (mode === 'pan' && pan && e.touches.length === 1) {
        e.preventDefault();
        const t = e.touches[0];
        const s = Math.max(scaleRef.current, MIN_ZOOM);
        const dx = (t.clientX - pan.x) / s;
        const dy = (t.clientY - pan.y) / s;
        setTranslate({ x: pan.tx + dx, y: pan.ty + dy });
        return;
      }

      if (mode === 'swipe' && swipe && e.touches.length === 1) {
        const t = e.touches[0];
        const dx = t.clientX - swipe.x;
        const dy = t.clientY - swipe.y;
        if (scaleRef.current <= 1 && dy > 0 && dy > Math.abs(dx) * 0.55) {
          e.preventDefault();
          swipeDismissOffset = Math.min(dy, 260);
          setDismissDragY(swipeDismissOffset);
        } else {
          swipeDismissOffset = 0;
          setDismissDragY(0);
        }
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (item.type === 'photo' && mode === 'pinch' && e.touches.length === 1) {
        mode = 'pan';
        const t = e.touches[0];
        pan = { x: t.clientX, y: t.clientY, tx: translateRef.current.x, ty: translateRef.current.y };
        pinch = null;
        return;
      }

      if (e.touches.length > 0) return;

      setTouchGestureActive(false);

      if (mode === 'pinch') {
        pinch = null;
        mode = 'idle';
        snapOutOfZoom();
        return;
      }

      if (mode === 'pan') {
        pan = null;
        mode = 'idle';
        snapOutOfZoom();
        return;
      }

      if (mode === 'swipe' && swipe) {
        const t = e.changedTouches[0];
        const dx = t.clientX - swipe.x;
        const dy = t.clientY - swipe.y;
        const canSwipeHoriz =
          scaleRef.current <= 1 &&
          Math.abs(dx) > 52 &&
          Math.abs(dx) > Math.abs(dy) * 1.05;

        if (swipeDismissOffset > 72 || (dy > 96 && dy > Math.abs(dx) * 0.65)) {
          closeViewer();
        } else if (canSwipeHoriz) {
          navigate(dx < 0 ? 1 : -1);
        }
        setDismissDragY(0);
        swipeDismissOffset = 0;
      }

      mode = 'idle';
      swipe = null;
      pinch = null;
      pan = null;
    };

    root.addEventListener('touchstart', onStart, { passive: true });
    root.addEventListener('touchmove', onMove, { passive: false });
    root.addEventListener('touchend', onEnd, { passive: true });
    root.addEventListener('touchcancel', onEnd, { passive: true });

    return () => {
      root.removeEventListener('touchstart', onStart);
      root.removeEventListener('touchmove', onMove);
      root.removeEventListener('touchend', onEnd);
      root.removeEventListener('touchcancel', onEnd);
    };
  }, [open, isMobile, item?.id, item?.type, closeViewer, navigate]);

  if (!open || !item) return null;

  const dismissActive = dismissDragY > 0;
  const contentShellStyle: CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    transform: dismissActive ? `translateY(${dismissDragY}px)` : undefined,
    opacity: dismissActive ? Math.max(0.36, 1 - dismissDragY / 300) : 1,
    transition: dismissActive ? 'none' : 'transform 0.2s ease-out, opacity 0.2s ease-out',
  };

  return (
    <Modal
      opened={open}
      onClose={closeViewer}
      fullScreen
      withCloseButton={false}
      padding={0}
      styles={{
        body: {
          background: '#0e0e0e',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        },
        content: { background: '#0e0e0e' },
      }}
    >
      <Box ref={contentRef} style={contentShellStyle}>
      <Group
        px={isMobile ? 'xs' : 'md'}
        py={isMobile ? 8 : 'sm'}
        justify="space-between"
        className={classes.header}
      >
        <Group gap={isMobile ? 8 : 'sm'} wrap="nowrap">
          <Avatar
            size={isMobile ? 30 : 36}
            radius="xl"
            src={item.sender?.avatar}
            color={item.sender?.color ?? 'blue'}
          >
            {item.sender?.initials ?? '??'}
          </Avatar>
          <Stack gap={0} style={{ minWidth: 0 }}>
            <Text size={isMobile ? 'xs' : 'sm'} fw={500} c="white" truncate>
              {item.sender?.name ?? 'Неизвестно'}
            </Text>
            <Text size="xs" c="rgba(255,255,255,.5)" truncate>
              {item.date ?? ''}
            </Text>
          </Stack>
        </Group>
        <Group gap={isMobile ? 4 : 'xs'} wrap="nowrap">
          <Tooltip label="Скачать" disabled={isMobile}>
            <ActionIcon
              variant="subtle"
              color="gray"
              radius="xl"
              size={isMobile ? 'md' : 'lg'}
              component="a"
              href={item.src}
              download
            >
              <IconDownload size={18} color="white" />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Поделиться" disabled={isMobile}>
            <ActionIcon
              variant="subtle"
              color="gray"
              radius="xl"
              size={isMobile ? 'md' : 'lg'}
              onClick={() => {
                void navigator.share?.({ url: item.src });
              }}
            >
              <IconShare size={18} color="white" />
            </ActionIcon>
          </Tooltip>
          <ActionIcon
            variant="subtle"
            color="gray"
            radius="xl"
            size={isMobile ? 'md' : 'lg'}
            onClick={closeViewer}
          >
            <IconX size={18} color="white" />
          </ActionIcon>
        </Group>
      </Group>

      <Box
        className={classes.stage}
        onDoubleClick={onDoubleClick}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={isMobile ? undefined : onTouchStart}
        onTouchEnd={isMobile ? undefined : onTouchEnd}
        style={{
          cursor:
            scale > 1 ? (dragging ? 'grabbing' : 'grab') : item.type === 'photo' ? 'zoom-in' : 'default',
          padding: isMobile ? '4px 8px' : '8px 16px',
          touchAction: isMobile && item.type === 'photo' ? 'none' : undefined,
        }}
      >
        {index > 0 ? (
          <ActionIcon
            className={classes.navLeft}
            onClick={() => navigate(-1)}
            radius="xl"
            size={isMobile ? 'lg' : 'xl'}
            variant="subtle"
            color="gray"
          >
            <IconChevronLeft size={22} color="white" />
          </ActionIcon>
        ) : null}
        {index < items.length - 1 ? (
          <ActionIcon
            className={classes.navRight}
            onClick={() => navigate(1)}
            radius="xl"
            size={isMobile ? 'lg' : 'xl'}
            variant="subtle"
            color="gray"
          >
            <IconChevronRight size={22} color="white" />
          </ActionIcon>
        ) : null}

        {item.type === 'photo' ? (
          <Image
            src={item.src}
            alt={item.caption ?? ''}
            fit="contain"
            style={{
              maxHeight: mediaMaxHeight,
              maxWidth: '100%',
              transform: `scale(${scale}) translate(${translate.x}px, ${translate.y}px)`,
              transition:
                dragging || touchGestureActive ? 'none' : 'transform .2s cubic-bezier(.4,0,.2,1)',
              pointerEvents: 'none',
            }}
          />
        ) : (
          <video
            ref={videoRef}
            src={item.src}
            controls
            style={{ maxHeight: mediaMaxHeight, maxWidth: '100%', borderRadius: 6 }}
          />
        )}
      </Box>

      <Box
        className={classes.footer}
        data-mobile={isMobile ? 'true' : 'false'}
        style={{ touchAction: isMobile ? 'pan-x' : undefined }}
      >
        {item.caption ? (
          <Text
            size={isMobile ? 'xs' : 'sm'}
            c="rgba(255,255,255,.85)"
            px={isMobile ? 'sm' : 'md'}
            pb="xs"
            style={{ lineHeight: 1.4 }}
          >
            {item.caption}
          </Text>
        ) : null}
        {hasMultipleItems ? (
          <>
            <Text size="xs" c="rgba(255,255,255,.4)" ta="center" pb="xs">
              {index + 1} / {items.length}
            </Text>
            <MediaStrip items={items} current={index} onSelect={setIndex} />
          </>
        ) : null}
      </Box>
      </Box>
    </Modal>
  );
}
