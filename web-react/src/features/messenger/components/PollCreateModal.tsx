import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LuX, LuPlus, LuTrash2 } from 'react-icons/lu';
import { useChatStore } from '../chatStore';

type PollCreateModalProps = {
  open: boolean;
  onClose: () => void;
  conversationId: string;
};

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;

export function PollCreateModal({ open, onClose, conversationId }: PollCreateModalProps) {
  const sendMessage = useChatStore((s) => s.sendMessage);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [allowsMultiple, setAllowsMultiple] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      setQuestion('');
      setOptions(['', '']);
      setAllowsMultiple(false);
      setSending(false);
    }
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const setOption = (i: number, v: string) => {
    setOptions((prev) => prev.map((x, j) => (j === i ? v : x)));
  };

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, '']);
  };

  const removeOption = (i: number) => {
    if (options.length <= MIN_OPTIONS) return;
    setOptions((prev) => prev.filter((_, j) => j !== i));
  };

  const trimmedOpts = options.map((o) => o.trim()).filter(Boolean);
  const canSend =
    question.trim().length > 0 &&
    trimmedOpts.length >= MIN_OPTIONS &&
    trimmedOpts.length <= MAX_OPTIONS &&
    !sending;

  const submit = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await sendMessage(conversationId, question.trim(), null, 'poll', {
        options: trimmedOpts,
        allows_multiple: allowsMultiple,
      });
      onClose();
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[120000] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="poll-create-title"
      onClick={(e) => e.target === e.currentTarget && !sending && onClose()}
    >
      <div
        className="flex max-h-[min(92vh,720px)] w-full max-w-md flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 id="poll-create-title" className="text-base font-bold text-gray-900">
            Новый опрос
          </h2>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full text-gray-500 transition-colors hover:bg-gray-100"
            onClick={() => !sending && onClose()}
            aria-label="Закрыть"
          >
            <LuX size={22} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Вопрос</label>
          <textarea
            className="mt-1.5 w-full resize-none rounded-2xl border border-gray-200 bg-gray-50/80 px-3 py-2.5 text-base text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            rows={3}
            maxLength={500}
            placeholder="Задайте вопрос…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={sending}
          />

          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Варианты ответа</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold text-primary hover:bg-primary/10 disabled:opacity-40"
              onClick={addOption}
              disabled={sending || options.length >= MAX_OPTIONS}
            >
              <LuPlus size={14} />
              Добавить
            </button>
          </div>

          <ul className="mt-2 space-y-2">
            {options.map((opt, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-base text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  maxLength={200}
                  placeholder={`Вариант ${i + 1}`}
                  value={opt}
                  onChange={(e) => setOption(i, e.target.value)}
                  disabled={sending}
                />
                <button
                  type="button"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-30"
                  onClick={() => removeOption(i)}
                  disabled={sending || options.length <= MIN_OPTIONS}
                  aria-label="Удалить вариант"
                >
                  <LuTrash2 size={18} />
                </button>
              </li>
            ))}
          </ul>

          <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50/80 px-3 py-3">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary/30"
              checked={allowsMultiple}
              onChange={(e) => setAllowsMultiple(e.target.checked)}
              disabled={sending}
            />
            <span className="text-sm font-medium text-gray-800">Можно выбрать несколько вариантов</span>
          </label>
        </div>

        <div className="border-t border-gray-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            className="w-full rounded-2xl bg-primary py-3 text-base font-bold text-white shadow-sm transition-opacity disabled:opacity-45"
            disabled={!canSend}
            onClick={() => void submit()}
          >
            {sending ? 'Отправка…' : 'Создать опрос'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
