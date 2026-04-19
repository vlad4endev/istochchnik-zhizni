/**
 * Соответствие системному размеру шрифта (Display / Accessibility в ОС и браузере).
 * Измеряем «предпочтительный» размер через probe с font-size: medium / -apple-system-body,
 * нормализуем к 16px и задаём --system-font-scale для умножения с --a11y-font-scale в CSS (zoom).
 */

const MIN_RATIO = 0.75;
const MAX_RATIO = 2.75;
const REF_PX = 16;

export function measureSystemFontScaleRatio(): number {
  if (typeof document === 'undefined') return 1;

  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:absolute;visibility:hidden;width:0;height:0;overflow:hidden;pointer-events:none;font-size:medium;font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif';
  if (typeof CSS !== 'undefined' && CSS.supports?.('font', '-apple-system-body')) {
    probe.style.font = '-apple-system-body';
  }
  document.documentElement.appendChild(probe);
  const fs = parseFloat(getComputedStyle(probe).fontSize) || REF_PX;
  document.documentElement.removeChild(probe);

  const ratio = fs / REF_PX;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

export function applySystemFontScaleToDocument(): void {
  const ratio = measureSystemFontScaleRatio();
  document.documentElement.style.setProperty('--system-font-scale', String(ratio));
}
