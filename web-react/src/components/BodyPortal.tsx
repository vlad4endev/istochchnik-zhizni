import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Рендерит оверлей (шторка, модалка) в document.body, вне #root.
 * На iOS Safari/PWA `#root { overflow: hidden }` + `position: fixed` внутри него привязывают оверлей к
 * контейнеру короче экрана, а нижний таб-бар (тоже в body, z-100) рисуется поверх — нижние пункты шторки
 * оказывались под таб-баром и были недоступны.
 */
export function BodyPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
