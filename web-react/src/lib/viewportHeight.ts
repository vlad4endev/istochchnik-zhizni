/**
 * Чистый расчёт высоты оболочки. Нужен отдельно от DOM, чтобы покрыть
 * iOS Safari/PWA unit-тестами: хром браузера и safe-area там часто выглядят как «клавиатура».
 */

export const VIEWPORT_HEIGHT_FLOOR_PX = 120;
/** Ниже этого inset — шум (скролл тулбара, safe-area), не клавиатура. */
export const KEYBOARD_INSET_MIN_PX = 48;
/**
 * Safari chrome + home indicator обычно < 160px. Больший gap без фокуса в поле —
 * сломанный visualViewport (~половина экрана), а не клавиатура и не хром.
 */
export const IOS_BROWSER_CHROME_MAX_PX = 160;
/** На iOS 17.5+ без клавиатуры не записываем пиксельную клетку — visualViewport/100dvh бывают вдвое короче webview. */
export const IOS_IDLE_VIEWPORT_CSS = '100lvh';
/** С 17.5 Safari иначе считает visual viewport; на 17.4 и ниже пиксельный max(visual, dvh) ещё ок. */
export const IOS_LVH_SHELL_MIN_MAJOR = 17;
export const IOS_LVH_SHELL_MIN_MINOR = 5;

export type IosVersion = { major: number; minor: number };

/** `CPU iPhone OS 17_5` / `CPU OS 18_0` (iPad). Desktop-UA iPad (`Mac OS X 10_15`) → null. */
export function parseIosVersion(userAgent: string): IosVersion | null {
  const m = userAgent.match(/(?:iPhone )?OS (\d+)[._](\d+)/);
  if (!m) return null;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return null;
  return { major, minor };
}

/** iOS 17.5, 18, 26… Нужен 100lvh-shell. Неизвестная версия (iPad desktop UA) — тоже, баг как раз на новых. */
export function iosNeedsLvhIdleShell(userAgent: string): boolean {
  const v = parseIosVersion(userAgent);
  if (!v) return true;
  return (
    v.major > IOS_LVH_SHELL_MIN_MAJOR ||
    (v.major === IOS_LVH_SHELL_MIN_MAJOR && v.minor >= IOS_LVH_SHELL_MIN_MINOR)
  );
}

/**
 * На сколько поднять fixed-таббар от низа layout viewport.
 * На iOS 17.5+ без клавиатуры огромный inset игнорируем: иначе bottom: 50vh — таббар посреди экрана.
 * На более старых iOS оболочка уже по visual viewport — inset не поднимаем.
 */
export function layoutBottomInsetPx(input: {
  keyboardInset: number;
  keyboardOpen: boolean;
  iosWebKit: boolean;
  iosLvhShell: boolean;
}): number {
  const inset = Math.max(0, Math.round(input.keyboardInset));
  if (input.keyboardOpen) return inset;
  if (!input.iosWebKit || !input.iosLvhShell) return 0;
  if (inset > IOS_BROWSER_CHROME_MAX_PX) return 0;
  return inset;
}

export function shouldUseCssViewportOnIosIdle(input: {
  iosWebKit: boolean;
  keyboardOpen: boolean;
  iosLvhShell: boolean;
}): boolean {
  return input.iosWebKit && input.iosLvhShell && !input.keyboardOpen;
}

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
  /** iPhone/iPad WebKit: Safari-вкладка и установленная PWA. */
  iosWebKit: boolean;
}): boolean {
  if (input.keyboardInset < KEYBOARD_INSET_MIN_PX) return false;
  /**
   * На iOS inset ≥ 48px часто не клавиатура:
   * — Safari: адресная строка и нижняя панель (~50–140px);
   * — PWA: visualViewport короче innerHeight на safe-area-inset-top (~47–59px, Dynamic Island).
   * Старый порог включал `app-keyboard-open` → оболочка сжималась, таббар посреди экрана.
   * Без фокуса в поле ввода на iOS клавиатуру не считаем (ни в вкладке, ни в PWA).
   */
  if (input.iosWebKit) return input.textInputFocused;
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
