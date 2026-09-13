/**
 * Чистый расчёт высоты оболочки. Нужен отдельно от DOM, чтобы покрыть
 * iOS Safari unit-тестами: хром браузера там часто выглядит как «клавиатура».
 */

export const VIEWPORT_HEIGHT_FLOOR_PX = 120;
/** Ниже этого inset — шум (скролл тулбара, safe-area), не клавиатура. */
export const KEYBOARD_INSET_MIN_PX = 48;

const NO_SOFTWARE_KEYBOARD_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

export function computeKeyboardInset(
  layoutHeight: number,
  visualHeight: number,
  offsetTop: number,
): number {
  let keyboardInset = Math.max(0, Math.round(layoutHeight - offsetTop - visualHeight));
  /**
   * iOS PWA: на кадр-два `visualViewport.height` ещё «полный», а `window.innerHeight`
   * уже сжат под клавиатуру. Тогда формула выше даёт inset≈0.
   */
  if (layoutHeight > 0 && visualHeight > layoutHeight + 2) {
    keyboardInset = Math.max(keyboardInset, Math.round(visualHeight - layoutHeight));
  }
  return keyboardInset;
}

export function isSoftwareKeyboardTarget(el: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined') return false;
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (el.getAttribute('type') || 'text').toLowerCase();
  return !NO_SOFTWARE_KEYBOARD_INPUT_TYPES.has(type);
}

export function isTextInputFocused(doc: Document | null | undefined = typeof document === 'undefined' ? null : document): boolean {
  return isSoftwareKeyboardTarget(doc?.activeElement ?? null);
}

export function computeKeyboardOpen(input: {
  keyboardInset: number;
  textInputFocused: boolean;
  /** iPhone/iPad в Safari/WebKit, не установленная PWA — снизу живёт хром браузера. */
  iosBrowserChrome: boolean;
}): boolean {
  if (input.keyboardInset < KEYBOARD_INSET_MIN_PX) return false;
  /**
   * В Safari (не PWA) разница innerHeight − visualViewport ≈ 50–140px — это
   * адресная строка и нижняя панель, не клавиатура. Старый порог 48px включал
   * `app-keyboard-open` у всех таких iPhone: оболочка сжималась, таббар
   * садился посреди экрана, главная оставалась белой.
   * Без фокуса в поле ввода на iOS-браузере клавиатуру не считаем.
   */
  if (input.iosBrowserChrome) return input.textInputFocused;
  return true;
}

export type ViewportHeightChoiceInput = {
  visualHeight: number;
  layoutHeight: number;
  dvhPx: number;
  clientDocH: number;
  keyboardOpen: boolean;
  iosBrowserChrome: boolean;
};

/**
 * Высота html/body/#root в CSS-пикселях, либо 0 если метрик нет
 * (тогда вызывающий может взять screen.height).
 */
export function chooseViewportHeightPx(input: ViewportHeightChoiceInput): number {
  const fromVisual = Math.round(input.visualHeight);
  const fromDvhProbe = Math.round(input.dvhPx);
  const fromLayout = Math.round(input.layoutHeight);
  const clientDocH = Math.round(input.clientDocH);

  let chosen: number;
  if (input.keyboardOpen) {
    /**
     * Не берём clientDocH в min(): это эхо уже записанного --viewport-height
     * и высота может только уменьшаться («храповик»).
     */
    const pool = [fromVisual, fromLayout].filter((x) => x > 0);
    chosen = pool.length > 0 ? Math.min(...pool) : 0;
    if (fromLayout > 0 && fromVisual > fromLayout + 4) {
      chosen = Math.min(chosen > 0 ? chosen : fromLayout, fromLayout);
    }
  } else if (input.iosBrowserChrome) {
    /**
     * Safari/Chrome на iOS в вкладке: visualViewport и 100dvh — видимая область
     * над хромом. innerHeight часто = большой вьюпорт (за панелями Safari) —
     * max(layout) уводил таббар под адресную строку.
     */
    const pool = [fromVisual, fromDvhProbe].filter((x) => x > 0);
    chosen = pool.length > 0 ? Math.max(...pool) : fromLayout;
  } else {
    const pool = [fromVisual, fromLayout, fromDvhProbe, clientDocH].filter((x) => x > 0);
    chosen = pool.length > 0 ? Math.max(...pool) : 0;
  }

  if (chosen <= 0) return 0;
  return Math.max(VIEWPORT_HEIGHT_FLOOR_PX, chosen);
}
