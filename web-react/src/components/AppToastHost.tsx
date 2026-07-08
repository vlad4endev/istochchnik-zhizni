import { useCallback, useEffect, useRef, useState } from 'react';
import { LuCheck, LuCircleAlert, LuInfo } from 'react-icons/lu';

import { isAppAdministratorSession } from '../features/auth/authStore';
import type { AppToastAction, AppToastKind } from '../lib/uiFeedback';
import { AppAvatar } from './AppAvatar';

type UiToast = {
  id: number;
  message: string;
  kind: AppToastKind;
  title?: string;
  avatarUrl?: string | null;
  avatarText?: string;
  action?: AppToastAction;
  durationMs: number;
};

function normalizeToastKind(kind: unknown): AppToastKind {
  if (kind === 'success' || kind === 'info') return kind;
  return 'error';
}

function ToastAvatarModal({
  avatarUrl,
  avatarText,
}: {
  avatarUrl?: string | null;
  avatarText?: string;
}) {
  return (
    <AppAvatar
      src={avatarUrl ?? null}
      fallback={<span>{(avatarText || '?').slice(0, 1).toUpperCase()}</span>}
      className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-white/15 text-sm font-extrabold text-white"
      imgClassName="h-full w-full object-cover"
    />
  );
}

/** Глобальный хост для `emitAppToast` — должен быть смонтирован вне вложенных layout-роутов (в т.ч. студии). */
export function AppToastHost() {
  const [active, setActive] = useState<UiToast | null>(null);
  const queueRef = useRef<UiToast[]>([]);
  const timerRef = useRef<number | null>(null);
  const activeRef = useRef<UiToast | null>(null);

  const presentNextFromQueue = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const next = queueRef.current.shift() ?? null;
    activeRef.current = next;
    setActive(next);
    if (next) {
      timerRef.current = window.setTimeout(() => {
        presentNextFromQueue();
      }, next.durationMs);
    }
  }, []);

  useEffect(() => {
    const onToast = (e: Event) => {
      const ce = e as CustomEvent<{
        message?: string;
        kind?: AppToastKind;
        title?: string;
        avatarUrl?: string | null;
        avatarText?: string;
        action?: AppToastAction;
        durationMs?: number;
        adminOnly?: boolean;
      }>;
      if (ce.detail?.adminOnly === true && !isAppAdministratorSession()) {
        return;
      }
      const message = String(ce.detail?.message ?? '').trim();
      if (!message) return;
      const kind = normalizeToastKind(ce.detail?.kind);
      const id = Date.now() + Math.floor(Math.random() * 1000);
      const durationRaw = Number(ce.detail?.durationMs);
      const durationMs =
        Number.isFinite(durationRaw) && durationRaw >= 1500 && durationRaw <= 60_000 ? durationRaw : 4200;
      const toast: UiToast = {
        id,
        message,
        kind,
        title: ce.detail?.title,
        avatarUrl: ce.detail?.avatarUrl,
        avatarText: ce.detail?.avatarText,
        action: ce.detail?.action,
        durationMs,
      };
      queueRef.current.push(toast);
      if (!activeRef.current) {
        presentNextFromQueue();
      }
    };
    window.addEventListener('app:toast', onToast);
    return () => {
      window.removeEventListener('app:toast', onToast);
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [presentNextFromQueue]);

  useEffect(() => {
    if (!active) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        presentNextFromQueue();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [active, presentNextFromQueue]);

  if (!active) return null;

  const kindRing =
    active.kind === 'error'
      ? 'ring-rose-400/35'
      : active.kind === 'success'
        ? 'ring-emerald-400/35'
        : 'ring-sky-400/35';

  const KindIcon =
    active.kind === 'error' ? LuCircleAlert : active.kind === 'success' ? LuCheck : LuInfo;

  const onConfirm = () => {
    if (active.action?.event) {
      window.dispatchEvent(
        new CustomEvent(active.action.event, {
          detail: active.action.detail,
        }),
      );
    }
    presentNextFromQueue();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6" role="presentation">
      <button
        type="button"
        aria-label="Закрыть уведомление"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity"
        onClick={presentNextFromQueue}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-live="assertive"
        aria-labelledby={`app-toast-${active.id}-title`}
        aria-describedby={`app-toast-${active.id}-msg`}
        className={[
          'relative z-[71] w-full max-w-[min(100%,20rem)] rounded-2xl px-5 py-5 shadow-2xl ring-1 ring-inset backdrop-blur-xl',
          'bg-zinc-900/88 text-zinc-100 ring-white/12',
          kindRing,
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <KindIcon
            className={[
              'h-10 w-10 shrink-0 opacity-95',
              active.kind === 'error'
                ? 'text-rose-300'
                : active.kind === 'success'
                  ? 'text-emerald-300'
                  : 'text-sky-300',
            ].join(' ')}
            strokeWidth={1.75}
            aria-hidden
          />
          {(active.avatarUrl || active.avatarText) && (
            <ToastAvatarModal avatarUrl={active.avatarUrl} avatarText={active.avatarText} />
          )}
          {active.title ? (
            <p id={`app-toast-${active.id}-title`} className="text-[15px] font-semibold leading-snug text-white">
              {active.title}
            </p>
          ) : (
            <span id={`app-toast-${active.id}-title`} className="sr-only">
              Уведомление
            </span>
          )}
          <p
            id={`app-toast-${active.id}-msg`}
            className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-zinc-100/95"
          >
            {active.message}
          </p>
          <button
            type="button"
            onClick={onConfirm}
            className="mt-1 w-full rounded-xl bg-white/14 py-3 text-[15px] font-semibold text-white transition hover:bg-white/22 active:bg-white/18"
          >
            ОК
          </button>
        </div>
      </div>
    </div>
  );
}
