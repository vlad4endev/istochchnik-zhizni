/**
 * Вертикальный скролл приложения живёт в `#root` (см. index.css), не в `window`.
 */

export function getAppScrollRoot(): HTMLElement | null {
  return document.getElementById('root');
}

export function getAppScrollTop(): number {
  const root = getAppScrollRoot();
  if (root) return root.scrollTop;
  return window.scrollY || document.documentElement.scrollTop;
}

export function setAppScrollTop(top: number, behavior?: ScrollBehavior): void {
  const y = Math.max(0, top);
  const root = getAppScrollRoot();
  if (root) root.scrollTo({ top: y, behavior: behavior ?? 'auto' });
  else window.scrollTo({ top: y, behavior: behavior ?? 'auto' });
}

export function scrollAppBy(dx: number, dy: number): void {
  const root = getAppScrollRoot();
  if (root) root.scrollBy({ left: dx, top: dy });
  else window.scrollBy(dx, dy);
}

export function getAppScrollMetrics(): { scrollTop: number; maxScroll: number } {
  const root = getAppScrollRoot();
  if (root) {
    const maxScroll = Math.max(0, root.scrollHeight - root.clientHeight);
    const scrollTop = Math.max(0, Math.min(maxScroll, root.scrollTop));
    return { scrollTop, maxScroll: Math.max(1, maxScroll) };
  }
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const scrollTop = Math.max(
    0,
    Math.min(maxScroll, window.scrollY || document.documentElement.scrollTop),
  );
  return { scrollTop, maxScroll };
}
