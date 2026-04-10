import { useEffect, useState } from 'react';
import { LuUpload, LuWand, LuX } from 'react-icons/lu';

import { convertToChordPro } from './chordProConversion';

type Props = {
  open: boolean;
  onClose: () => void;
  onApply: (payload: { raw: string; chordPro: string }) => void;
  initialRaw?: string;
  variant?: 'default' | 'studio';
};

export function SmartImportModal({ open, onClose, onApply, initialRaw = '', variant = 'default' }: Props) {
  const [raw, setRaw] = useState(initialRaw);
  const [dropActive, setDropActive] = useState(false);
  const isStudio = variant === 'studio';

  useEffect(() => {
    if (open) setRaw(initialRaw);
  }, [open, initialRaw]);

  if (!open) return null;

  const panel = isStudio
    ? 'border-zinc-600 bg-zinc-900 text-zinc-100'
    : 'border-stone-200 bg-white text-stone-900';
  const textarea = isStudio
    ? 'border-zinc-700 bg-zinc-950 text-zinc-100 placeholder:text-zinc-500'
    : 'border-stone-200 bg-white text-stone-900 placeholder:text-stone-400';
  const muted = isStudio ? 'text-zinc-400' : 'text-stone-500';
  const btnPrimary = isStudio
    ? 'bg-sky-600 text-white hover:bg-sky-500'
    : 'bg-stone-900 text-white hover:bg-stone-800';
  const btnGhost = isStudio
    ? 'border-zinc-600 text-zinc-200 hover:bg-zinc-800'
    : 'border-stone-200 text-stone-800 hover:bg-stone-50';

  const onDropFile = (e: React.DragEvent) => {
    e.preventDefault();
    setDropActive(false);
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (!/\.(txt|chordpro|chopro|cho)$/i.test(f.name)) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setRaw(text);
    };
    reader.readAsText(f);
  };

  const handleApply = () => {
    const chordPro = convertToChordPro(raw);
    onApply({ raw, chordPro });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal
      aria-labelledby="smart-import-title"
      onClick={onClose}
    >
      <div
        className={`max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-2xl border p-5 shadow-xl ${panel}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="smart-import-title" className="text-lg font-bold">
              Умный импорт
            </h2>
            <p className={`mt-1 text-sm ${muted}`}>
              Аккорды над строками → ChordPro через <code className={isStudio ? 'text-sky-300' : 'text-stone-700'}>convertToChordPro</code>
              , встроенные <code className={isStudio ? 'text-sky-300' : 'text-stone-700'}>[Am]</code>.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg p-2 ${isStudio ? 'text-zinc-400 hover:bg-zinc-800' : 'text-stone-500 hover:bg-stone-100'}`}
            aria-label="Закрыть"
          >
            <LuX className="h-5 w-5" />
          </button>
        </div>

        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDropActive(true);
          }}
          onDragLeave={() => setDropActive(false)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDropFile}
          className={`rounded-xl border-2 border-dashed p-3 transition-colors ${
            dropActive
              ? isStudio
                ? 'border-sky-500 bg-sky-950/40'
                : 'border-sky-500 bg-sky-50'
              : isStudio
                ? 'border-zinc-700'
                : 'border-stone-200'
          }`}
        >
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={12}
            placeholder={
              '   Am         C\n' + 'Строка текста под аккордами\n\n' + 'Или уже: [Am]ChordPro'
            }
            className={`w-full resize-y rounded-lg border p-3 font-mono text-sm leading-relaxed ${textarea}`}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleApply}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${btnPrimary}`}
            >
              <LuWand className="h-4 w-4" />
              Конвертировать и вставить
            </button>
            <button type="button" onClick={onClose} className={`rounded-xl border px-4 py-2 text-sm ${btnGhost}`}>
              Отмена
            </button>
            <span className={`inline-flex items-center gap-1 text-xs ${muted}`}>
              <LuUpload className="h-4 w-4" />
              Перетащите .txt / .chordpro
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
