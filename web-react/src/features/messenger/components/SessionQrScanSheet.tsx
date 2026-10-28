import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { LuX } from 'react-icons/lu';
import { BodyPortal } from '../../../components/BodyPortal';
import { emitAppToast } from '../../../lib/uiFeedback';
import * as api from '../api/messengerApi';
import { parseSessionIdFromScan } from '../sessionCrypto';
import type { SearchMember } from '../api/messengerApi';

type Props = {
  onClose: () => void;
  onResolved: (member: SearchMember) => void;
};

const SCANNER_REGION_ID = 'messenger-session-qr-reader';

export function SessionQrScanSheet({ onClose, onResolved }: Props) {
  const [manualId, setManualId] = useState('');
  const [busy, setBusy] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handledRef = useRef(false);

  const resolveAccount = useCallback(
    async (raw: string) => {
      if (handledRef.current || busy) return;
      const accountId = parseSessionIdFromScan(raw);
      if (!accountId) {
        emitAppToast('Не удалось распознать ID', 'error');
        return;
      }
      handledRef.current = true;
      setBusy(true);
      try {
        const member = await api.resolveMessengerAccountId(accountId);
        if (!member) {
          emitAppToast('Пользователь с таким ID не найден', 'error');
          handledRef.current = false;
          return;
        }
        onResolved(member);
        onClose();
      } catch {
        emitAppToast('Ошибка при поиске пользователя', 'error');
        handledRef.current = false;
      } finally {
        setBusy(false);
      }
    },
    [busy, onClose, onResolved],
  );

  useEffect(() => {
    let cancelled = false;
    const scanner = new Html5Qrcode(SCANNER_REGION_ID);
    scannerRef.current = scanner;
    void (async () => {
      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 8, qrbox: { width: 240, height: 240 } },
          (decoded) => {
            if (cancelled) return;
            void resolveAccount(decoded);
          },
          () => {
            /* ignore frame miss */
          },
        );
      } catch {
        if (!cancelled) {
          setCameraError('Камера недоступна. Введите ID вручную или разрешите доступ к камере.');
        }
      }
    })();
    return () => {
      cancelled = true;
      const s = scannerRef.current;
      scannerRef.current = null;
      if (!s) return;
      void (async () => {
        try {
          if (s.isScanning) await s.stop();
        } catch {
          /* ignore */
        }
        try {
          s.clear();
        } catch {
          /* ignore */
        }
      })();
    };
  }, [resolveAccount]);

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
          aria-label="Сканировать QR"
        >
          <div className="flex items-center justify-between border-b border-[var(--tg-border)] px-4 py-3">
            <h2 className="m-0 text-base font-bold text-[var(--tg-text)]">Сканировать QR</h2>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[var(--tg-primary)]"
              onClick={onClose}
              aria-label="Закрыть"
            >
              <LuX size={22} />
            </button>
          </div>
          <div className="space-y-3 px-4 py-4">
            <div
              id={SCANNER_REGION_ID}
              className="overflow-hidden rounded-xl bg-stone-900 [&_video]:max-h-[280px] [&_video]:w-full [&_video]:object-cover"
            />
            {cameraError ? <p className="m-0 text-sm text-amber-700">{cameraError}</p> : null}
            <p className="m-0 text-sm text-stone-500">Или вставьте Account ID вручную:</p>
            <input
              className="w-full rounded-xl border border-[var(--tg-border)] bg-[var(--tg-surface-elevated)] px-3 py-2.5 font-mono text-sm outline-none"
              placeholder="05…"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              disabled={busy}
            />
            <button
              type="button"
              disabled={busy || !manualId.trim()}
              onClick={() => void resolveAccount(manualId)}
              className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--tg-primary)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'Проверяем…' : 'Открыть чат'}
            </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
