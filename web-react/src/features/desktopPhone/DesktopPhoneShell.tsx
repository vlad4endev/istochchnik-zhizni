import { useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import {
  DESKTOP_PHONE_FALLBACK_KEY,
  DESKTOP_PHONE_PATH_MESSAGE,
  isDesktopPhonePreferred,
  isDesktopViewport,
  isInsideFrame,
  setDesktopPhonePreferred,
} from './desktopPhone';
import './desktopPhone.css';

function frameSrc(): string {
  const url = new URL(window.location.href);
  url.searchParams.delete('phone');
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Корень на компьютере: рамка телефона с приложением внутри. Само приложение здесь не монтируется. */
export function DesktopPhoneShell() {
  const src = useMemo(frameSrc, []);

  useEffect(() => {
    let answered = false;
    /* Нет ответа из рамки (сервер запретил встраивание, ошибка загрузки) — открываем обычную версию. */
    const timer = window.setTimeout(() => {
      if (answered) return;
      try {
        sessionStorage.setItem(DESKTOP_PHONE_FALLBACK_KEY, '1');
      } catch {
        /* ignore */
      }
      window.location.reload();
    }, 8000);
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; path?: unknown } | null;
      if (data?.type !== DESKTOP_PHONE_PATH_MESSAGE || typeof data.path !== 'string') return;
      answered = true;
      window.clearTimeout(timer);
      if (!data.path.startsWith('/') || data.path.startsWith('//')) return;
      window.history.replaceState(null, '', data.path);
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    };
  }, []);

  const openFull = () => {
    setDesktopPhonePreferred(false);
    window.location.reload();
  };

  return (
    <div className="desktop-phone">
      <div className="desktop-phone__side">
        <p className="desktop-phone__title">Вид телефона</p>
        <p className="desktop-phone__hint">Так приложение выглядит на смартфоне.</p>
        <button type="button" className="desktop-phone__btn" onClick={openFull}>
          Полная версия
        </button>
      </div>
      <div className="desktop-phone__device">
        <iframe
          title="Моя церковь"
          className="desktop-phone__frame"
          src={src}
          allow="camera; microphone; autoplay; clipboard-read; clipboard-write; fullscreen; display-capture; notifications"
        />
      </div>
    </div>
  );
}

/** Внутри рамки: сообщает внешней странице текущий путь, чтобы адрес и перезагрузка не терялись. */
export function DesktopPhonePathReporter() {
  const { pathname, search, hash } = useLocation();
  useEffect(() => {
    if (!isInsideFrame()) return;
    try {
      window.parent.postMessage(
        { type: DESKTOP_PHONE_PATH_MESSAGE, path: `${pathname}${search}${hash}` },
        window.location.origin,
      );
    } catch {
      /* ignore */
    }
  }, [pathname, search, hash]);
  return null;
}

/** В полной версии на компьютере: возвращает вид телефона. */
export function DesktopPhoneSwitch() {
  if (!isDesktopViewport() || isDesktopPhonePreferred()) return null;
  return (
    <button
      type="button"
      className="desktop-phone-switch"
      onClick={() => {
        setDesktopPhonePreferred(true);
        window.location.reload();
      }}
    >
      Вид телефона
    </button>
  );
}
