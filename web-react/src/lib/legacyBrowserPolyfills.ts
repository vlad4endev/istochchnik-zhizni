/**
 * Минимальные полифиллы для порога iOS/Safari 15.4 и близких WebKit.
 *
 * Часть зависимостей (LiveKit FSM и др.) вызывает `Object.hasOwn` без проверки.
 * На Safari < 15.4 это даёт TypeError при первом переходе состояния и может
 * оставить PWA на сплэше / белом экране. Полифилл дёшев и безопасен на новых UA.
 *
 * Подключать первым импортом в `main.tsx`, до остальных модулей приложения.
 */

export function installLegacyBrowserPolyfills(): void {
  if (typeof Object.hasOwn !== 'function') {
    Object.defineProperty(Object, 'hasOwn', {
      value(obj: object, prop: PropertyKey): boolean {
        return Object.prototype.hasOwnProperty.call(obj, prop);
      },
      configurable: true,
      writable: true,
    });
  }

  if (typeof Array.prototype.at !== 'function') {
    Object.defineProperty(Array.prototype, 'at', {
      value(this: unknown[], index: number): unknown {
        const n = Math.trunc(index) || 0;
        const i = n >= 0 ? n : this.length + n;
        if (i < 0 || i >= this.length) return undefined;
        return this[i];
      },
      configurable: true,
      writable: true,
    });
  }

  if (typeof String.prototype.replaceAll !== 'function') {
    Object.defineProperty(String.prototype, 'replaceAll', {
      value(this: string, search: string | RegExp, replacement: string): string {
        if (search instanceof RegExp) {
          if (!search.global) {
            throw new TypeError('String.prototype.replaceAll called with a non-global RegExp');
          }
          return this.replace(search, replacement);
        }
        return this.split(String(search)).join(String(replacement));
      },
      configurable: true,
      writable: true,
    });
  }

  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID !== 'function') {
    Object.defineProperty(cryptoObj, 'randomUUID', {
      value(): string {
        const bytes = new Uint8Array(16);
        cryptoObj.getRandomValues(bytes);
        bytes[6] = (bytes[6]! & 0x0f) | 0x40;
        bytes[8] = (bytes[8]! & 0x3f) | 0x80;
        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      },
      configurable: true,
      writable: true,
    });
  }
}

installLegacyBrowserPolyfills();
