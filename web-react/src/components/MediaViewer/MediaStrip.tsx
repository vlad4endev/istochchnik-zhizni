import { useEffect, useRef } from 'react';
import { Box, Image } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { IconPlayerPlay } from '@tabler/icons-react';

import type { MediaItem } from './useMediaViewer';

export function MediaStrip({
  items,
  current,
  onSelect,
}: {
  items: MediaItem[];
  current: number;
  onSelect: (i: number) => void;
}) {
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const isMobile = useMediaQuery('(max-width: 48em)');
  const thumbSize = isMobile ? 38 : 44;
  const borderRadius = isMobile ? 8 : 6;
  const gap = isMobile ? 6 : 4;
  const sidePadding = isMobile ? 10 : 12;

  useEffect(() => {
    const active = itemRefs.current[current];
    if (!active) return;
    active.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [current]);

  return (
    <Box
      style={{
        display: 'flex',
        gap,
        overflowX: 'auto',
        padding: `0 ${sidePadding}px`,
        justifyContent: isMobile ? 'flex-start' : 'center',
        scrollSnapType: 'x proximity',
        touchAction: 'pan-x',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
    >
      {items.map((item, i) => (
        <Box
          key={item.id}
          ref={(node) => {
            itemRefs.current[i] = node;
          }}
          onClick={() => onSelect(i)}
          style={{
            width: thumbSize,
            height: thumbSize,
            borderRadius,
            overflow: 'hidden',
            flexShrink: 0,
            cursor: 'pointer',
            opacity: i === current ? 1 : 0.5,
            border: i === current ? '2px solid #fff' : '2px solid transparent',
            transition: 'opacity .15s, border-color .15s',
            background: '#1e3a5f',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            scrollSnapAlign: 'center',
          }}
        >
          {item.type === 'photo' && item.thumb ? (
            <Image src={item.thumb} w={thumbSize} h={thumbSize} fit="cover" />
          ) : (
            <IconPlayerPlay size={isMobile ? 14 : 16} color="white" opacity={0.8} />
          )}
        </Box>
      ))}
    </Box>
  );
}
