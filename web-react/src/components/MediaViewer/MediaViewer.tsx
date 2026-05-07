import { useCallback, useEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react';
import { ActionIcon, Avatar, Box, Group, Image, Modal, Stack, Text, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconChevronLeft, IconChevronRight, IconDownload, IconShare, IconX } from '@tabler/icons-react';

import { MediaStrip } from './MediaStrip';
import classes from './MediaViewer.module.css';
import { useMediaViewer } from './useMediaViewer';

export function MediaViewer() {
  const { open, items, index, closeViewer, navigate, setIndex } = useMediaViewer();
  const item = items[index];
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
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
    setScale(1);
    setTranslate({ x: 0, y: 0 });
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

  const onTouchStart = (event: TouchEvent) => {
    touchStartX.current = event.touches[0].clientX;
  };

  const onTouchEnd = (event: TouchEvent) => {
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

  if (!open || !item) return null;

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
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{
          cursor:
            scale > 1 ? (dragging ? 'grabbing' : 'grab') : item.type === 'photo' ? 'zoom-in' : 'default',
          padding: isMobile ? '4px 8px' : '8px 16px',
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
              transition: dragging ? 'none' : 'transform .2s cubic-bezier(.4,0,.2,1)',
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

      <Box className={classes.footer} data-mobile={isMobile ? 'true' : 'false'}>
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
    </Modal>
  );
}
