/**
 * Определение браузера/ОС для подсказок по Web Push. Приложение — PWA, и «включить уведомления» в разных
 * браузерах ломается по-разному (Brave без Google-push, iOS только из ярлыка, встроенные браузеры мессенджеров
 * без Service Worker), поэтому сообщения об ошибках подбираем под конкретный браузер.
 */
export type PushBrowser =
  | 'brave'
  | 'chrome'
  | 'edge'
  | 'firefox'
  | 'samsung'
  | 'yandex'
  | 'opera'
  | 'safari'
  | 'inapp'
  | 'other';
export type PushOs = 'ios' | 'android' | 'desktop';

export interface PushPlatform {
  browser: PushBrowser;
  os: PushOs;
  installed: boolean;
}

interface DetectInput {
  userAgent: string;
  /** `navigator.brave` есть только в Brave (UA у него как у Chrome). */
  hasBraveApi?: boolean;
  maxTouchPoints?: number;
  platform?: string;
  installed?: boolean;
}

export function detectPushPlatform(input: DetectInput): PushPlatform {
  const ua = input.userAgent;
  const iPadAsMac = input.platform === 'MacIntel' && (input.maxTouchPoints ?? 0) > 1;
  const os: PushOs = /iPhone|iPad|iPod/i.test(ua) || iPadAsMac ? 'ios' : /Android/i.test(ua) ? 'android' : 'desktop';

  let browser: PushBrowser = 'other';
  if (/FBAN|FBAV|Instagram|Line\/|MicroMessenger|VKClient|VK\/|Telegram|; wv\)|\bwv\b/i.test(ua)) {
    browser = 'inapp';
  } else if (input.hasBraveApi) {
    browser = 'brave';
  } else if (/YaBrowser|YaSearchBrowser/i.test(ua)) {
    browser = 'yandex';
  } else if (/SamsungBrowser/i.test(ua)) {
    browser = 'samsung';
  } else if (/OPR\/|Opera|OPT\/|OPiOS/i.test(ua)) {
    browser = 'opera';
  } else if (/Edg(e|A|iOS)?\//i.test(ua)) {
    browser = 'edge';
  } else if (/Firefox|FxiOS/i.test(ua)) {
    browser = 'firefox';
  } else if (/Chrome|CriOS|Chromium/i.test(ua)) {
    browser = 'chrome';
  } else if (/Safari/i.test(ua)) {
    browser = 'safari';
  }
  return { browser, os, installed: input.installed === true };
}

export function currentPushPlatform(installed: boolean): PushPlatform {
  if (typeof navigator === 'undefined') return { browser: 'other', os: 'desktop', installed };
  return detectPushPlatform({
    userAgent: navigator.userAgent,
    hasBraveApi: 'brave' in navigator,
    maxTouchPoints: navigator.maxTouchPoints,
    platform: navigator.platform,
    installed,
  });
}

/** Chromium-браузеры доставляют Web Push через Google (FCM); Firefox — через Mozilla, Safari — через Apple. */
function usesGooglePush(p: PushPlatform): boolean {
  return p.os !== 'ios' && p.browser !== 'firefox' && p.browser !== 'safari';
}

/** Браузер не смог связаться с push-сервисом (AbortError): подсказка под конкретный браузер. */
export function adviceForPushServiceUnreachable(p: PushPlatform): string {
  if (p.browser === 'brave') {
    return 'Brave по умолчанию отключает push через Google. Откройте Настройки → Конфиденциальность и безопасность → «Использовать сервисы Google для push-сообщений», включите, перезапустите Brave и снова включите уведомления. Если не помогло — установите приложение из Chrome.';
  }
  if (p.os === 'ios') {
    return 'Не удалось связаться с push-сервисом Apple. Проверьте интернет и откройте приложение из ярлыка на экране «Домой» (iOS 16.4 или новее).';
  }
  if (p.browser === 'firefox') {
    return 'Firefox не смог связаться со своим push-сервисом. Проверьте интернет, отключите VPN и блокировщики и повторите.';
  }
  if (usesGooglePush(p)) {
    const where = p.os === 'android' ? 'На телефоне' : 'На компьютере';
    const yandex = p.browser === 'yandex' ? ' В Яндекс Браузере также проверьте, что включены уведомления сайтов.' : '';
    return `${where} браузер доставляет push через серверы Google, и связь с ними не установилась. Отключите VPN и блокировщики, переключитесь между Wi-Fi и мобильным интернетом и повторите. Нужны Google Play Services; без них откройте сайт в Firefox.${yandex}`;
  }
  return 'Браузер не смог связаться со своим push-сервисом. Проверьте интернет, отключите VPN и блокировщики и повторите.';
}

/** Разрешение отклонено или заблокировано: где его включить в этом браузере. */
export function adviceForPushPermissionDenied(p: PushPlatform): string {
  if (p.os === 'ios') {
    return 'Уведомления отключены: Настройки iPhone → Уведомления → «Источник жизни» (или название приложения) → «Допуск уведомлений».';
  }
  if (p.installed && p.os === 'android') {
    return 'Уведомления отключены: Настройки Android → Приложения → это приложение → Уведомления → включить.';
  }
  if (p.browser === 'firefox') {
    return 'Уведомления заблокированы: значок замка слева в адресной строке → «Разрешения» → «Получать уведомления» → разрешить, затем обновите страницу.';
  }
  return 'Уведомления заблокированы для этого сайта: нажмите на значок замка (или настроек) в адресной строке → «Уведомления» → «Разрешить», затем обновите страницу.';
}

/** Браузер вообще не умеет push (нет Service Worker / PushManager): что делать именно в нём. */
export function adviceForPushUnsupported(p: PushPlatform): string {
  if (p.browser === 'inapp') {
    return 'Это встроенный браузер другого приложения (мессенджер, соцсеть) — в нём push не работает. Откройте ссылку в системном браузере (Safari на iPhone, Chrome на Android) через меню «Открыть в браузере».';
  }
  if (p.os === 'ios' && !p.installed) {
    if (p.browser === 'safari') {
      return 'На iPhone и iPad push работают только в установленном приложении: нажмите «Поделиться» → «На экран „Домой“», откройте ярлык и включите уведомления здесь (нужен iOS 16.4 или новее).';
    }
    return 'На iPhone и iPad установка и push надёжно работают через Safari: откройте сайт в Safari, нажмите «Поделиться» → «На экран „Домой“» и включите уведомления из ярлыка (нужен iOS 16.4 или новее).';
  }
  if (p.os === 'ios') {
    return 'Для push нужен iOS 16.4 или новее. Обновите iPhone и откройте приложение из ярлыка заново.';
  }
  return 'Этот браузер не поддерживает push-уведомления. Откройте сайт в Chrome, Edge, Firefox или Safari, а на телефоне — установите приложение через меню браузера («Установить приложение»).';
}
