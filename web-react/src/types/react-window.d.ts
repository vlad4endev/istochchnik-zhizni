declare module 'react-window' {
  import { Component, ComponentType, CSSProperties, ReactNode, RefObject } from 'react';

  export interface ListProps {
    width: number | string;
    height: number | string;
    itemCount: number;
    itemSize: number;
    className?: string;
    style?: CSSProperties;
    children: ComponentType<{
      index: number;
      style: CSSProperties;
      data?: any;
      isScrolling?: boolean;
    }>;
    onScroll?: (props: {
      scrollDirection: 'forward' | 'backward';
      scrollOffset: number;
      scrollUpdateWasRequested: boolean;
    }) => void;
    direction?: 'vertical' | 'horizontal';
    itemKey?: (index: number, data: any) => any;
    itemData?: any;
    overscanCount?: number;
    useIsScrolling?: boolean;
  }

  export class FixedSizeList extends Component<ListProps> {
    scrollTo(scrollOffset: number): void;
    scrollToItem(index: number, align?: 'auto' | 'start' | 'end' | 'center'): void;
  }
}
