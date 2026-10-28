import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { LuCopy, LuX } from 'react-icons/lu';
import { BodyPortal } from '../../../components/BodyPortal';
import { emitAppToast } from '../../../lib/uiFeedback';
import * as api from '../api/messengerApi';
import {
  ensureLocalSessionKeypair,
  formatMessengerAccountIdForDisplay,
} from '../sessionCrypto';

type Props = {
  memberId: number;
  onClose: () => void;
};

export function SessionQrShareSheet({ memberId, onClose }: Props) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const displayId = useMemo(
    () => (accountId ? formatMessengerAccountIdForDisplay(accountId) : ''),
    [accountId],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const kp = await ensureLocalSessionKeypair(memberId);
        const identity = await api.ensureMessengerIdentity(kp.publicKeySpkiB64);
        if (cancelled) return;
        setAccountId(identity.account_id);
        const absolute =
          typeof window !== 'undefined'
            ? `${window.location.origin}${identity.qr_path}`
            : identity.qr_path;
        const url = await QRCode.toDataURL(absolute, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 280,
          color: { dark: '#1c1917', light: '#ffffff' },
        });
        if (cancelled) return;
        setQrDataUrl(url);
      } catch {
        if (!cancelled) setError('Не удалось создать ID и QR-код');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  const copyId = async () => {
    if (!accountId) return;
    try {
      await navigator.clipboard.writeText(accountId);
      emitAppToast('ID скопирован', 'success');
    } catch {
      emitAppToast('Не удалось скопировать', 'error');
    }
  };

  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-[1100] flex items-end justify-center bg-black/45 p-3 sm:items-center"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="w-full max-w-md overflow-hidden rounded-2xl bg-[var(--tg-surface)] shadow-xl"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Мой ID и QR-код"
        >
          <div className="flex items-center justify-between border-b border-[var(--tg-border)] px-4 py-3">
            <h2 className="m-0 text-base font-bold text-[var(--tg-text)]">Мой ID</h2>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[var(--tg-primary)]"
              onClick={onClose}
              aria-label="Закрыть"
            >
              <LuX size={22} />
            </button>
          </div>
          <div className="space-y-4 px-4 py-5 text-center">
            <p className="m-0 text-sm text-stone-500">
              Покажите QR или отправьте ID — собеседник отсканирует и откроет чат с вами.
            </p>
            {loading ? (
              <div className="py-10 text-sm text-stone-500">Готовим QR…</div>
            ) : error ? (
              <div className="py-8 text-sm text-red-600">{error}</div>
            ) : (
              <>
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="QR-код вашего messenger ID"
                    className="mx-auto h-[280px] w-[280px] rounded-xl bg-white p-2"
                  />
                ) : null}
                <div className="rounded-xl bg-stone-100 px-3 py-3 text-left">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                    Account ID
                  </div>
                  <div className="break-all font-mono text-[13px] leading-relaxed text-stone-800">
                    {displayId}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void copyId()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--tg-primary)] px-4 py-3 text-sm font-semibold text-white"
                >
                  <LuCopy size={18} aria-hidden />
                  Скопировать ID
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
