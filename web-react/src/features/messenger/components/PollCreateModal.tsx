import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Picker from '@emoji-mart/react';
import emojiData from '@emoji-mart/data';
import { LuPlus, LuSmile, LuTrash2 } from 'react-icons/lu';
import { useMobileBottomNavLock } from '../../../app/useMobileBottomNavLock';
import { useChatStore } from '../chatStore';

type PopoverPos = { bottomPx: number; leftPx?: number; rightPx?: number } | null;

const EMOJI_PICKER_MAX_WIDTH_PX = 360;

function computeEmojiPopoverPos(rect: DOMRect): PopoverPos {
  const pad = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(EMOJI_PICKER_MAX_WIDTH_PX, vw - 2 * pad);
  const bottomPx = Math.max(pad, Math.round(vh - rect.top + 8));
  const anchorRight = Math.min(rect.right, vw - pad);
  let leftPx = Math.round(anchorRight - w);
  leftPx = Math.max(pad, Math.min(leftPx, vw - pad - w));
  return { bottomPx, leftPx };
}

type PollCreateModalProps = {
  open: boolean;
  onClose: () => void;
  conversationId: string;
};

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 10;

/** iOS/Telegram-style track + thumb */
function TgSwitch({
  checked,
  onCheckedChange,
  disabled,
  id,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onCheckedChange(!checked)}
      className={[
        'relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-45',
        checked ? 'bg-primary' : 'bg-stone-300',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-[22px]' : 'translate-x-[2px]',
        ].join(' ')}
      />
    </button>
  );
}

export function PollCreateModal({ open, onClose, conversationId }: PollCreateModalProps) {
  const sendMessage = useChatStore((s) => s.sendMessage);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [allowsMultiple, setAllowsMultiple] = useState(false);
  /** Как в Telegram: без списка «кто за что голосовал» */
  const [anonymous, setAnonymous] = useState(false);
  const [sending, setSending] = useState(false);
  /** `question` или индекс варианта — открыт picker эмодзи для этого поля */
  const [emojiField, setEmojiField] = useState<'question' | number | null>(null);
  const [emojiPos, setEmojiPos] = useState<PopoverPos>(null);
  useMobileBottomNavLock(open);

  const questionRef = useRef<HTMLTextAreaElement>(null);
  const optionElRef = useRef<Map<number, HTMLInputElement>>(new Map());
  const emojiBtnRef = useRef<HTMLButtonElement | null>(null);
  const emojiPopoverRef = useRef<HTMLDivElement | null>(null);

  const repositionEmojiPopover = useCallback(() => {
    const btn = emojiBtnRef.current;
    if (!btn) return;
    setEmojiPos(computeEmojiPopoverPos(btn.getBoundingClientRect()));
  }, []);

  useEffect(() => {
    if (open) {
      setQuestion('');
      setOptions(['', '']);
      setAllowsMultiple(false);
      setAnonymous(false);
      setSending(false);
      setEmojiField(null);
      setEmojiPos(null);
    }
  }, [open]);

  useEffect(() => {
    if (emojiField == null) {
      setEmojiPos(null);
      return;
    }
    repositionEmojiPopover();
    const onResize = () => repositionEmojiPopover();
    window.addEventListener('resize', onResize);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', onResize);
    vv?.addEventListener('scroll', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      vv?.removeEventListener('resize', onResize);
      vv?.removeEventListener('scroll', onResize);
    };
  }, [emojiField, repositionEmojiPopover]);

  useEffect(() => {
    if (emojiField == null) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (emojiBtnRef.current?.contains(t)) return;
      if (emojiPopoverRef.current?.contains(t)) return;
      setEmojiField(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEmojiField(null);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [emojiField]);

  const insertEmoji = useCallback((native: string) => {
    if (!native) return;
    if (emojiField === 'question') {
      const el = questionRef.current;
      const cur = question;
      const max = 500;
      const start = el?.selectionStart ?? cur.length;
      const end = el?.selectionEnd ?? cur.length;
      const next = cur.slice(0, start) + native + cur.slice(end);
      if (next.length > max) return;
      setQuestion(next);
      requestAnimationFrame(() => {
        try {
          el?.focus();
          const caret = start + native.length;
          el?.setSelectionRange(caret, caret);
        } catch {
          /* ignore */
        }
      });
      return;
    }
    if (typeof emojiField === 'number') {
      const i = emojiField;
      const el = optionElRef.current.get(i);
      const cur = options[i] ?? '';
      const max = 200;
      const start = el?.selectionStart ?? cur.length;
      const end = el?.selectionEnd ?? cur.length;
      const next = cur.slice(0, start) + native + cur.slice(end);
      if (next.length > max) return;
      setOptions((prev) => prev.map((x, j) => (j === i ? next : x)));
      requestAnimationFrame(() => {
        try {
          el?.focus();
          const caret = start + native.length;
          el?.setSelectionRange(caret, caret);
        } catch {
          /* ignore */
        }
      });
    }
  }, [emojiField, question, options]);

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
      const ok = await sendMessage(conversationId, question.trim(), null, 'poll', {
        options: trimmedOpts,
        allows_multiple: allowsMultiple,
        anonymous,
      });
      if (ok) {
        onClose();
        return;
      }
      // sendMessage already toasts; keep modal open so the user can retry.
    } catch {
      // Defensive: store usually handles errors; avoid uncaught rejection closing silently.
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[120000] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="poll-create-title"
      onClick={(e) => e.target === e.currentTarget && !sending && onClose()}
    >
      <div
        className="flex max-h-[min(94dvh,760px)] w-full max-w-[420px] flex-col overflow-hidden rounded-[14px] bg-[#f2f2f7] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Telegram-like nav bar */}
        <header className="flex shrink-0 items-center border-b border-black/[0.06] bg-white px-2 pt-[max(10px,env(safe-area-inset-top))] pb-2">
          <button
            type="button"
            className="min-w-[4.5rem] py-2 text-left text-[17px] font-normal text-primary"
            onClick={() => !sending && onClose()}
          >
            Отмена
          </button>
          <h2 id="poll-create-title" className="flex-1 truncate text-center text-[17px] font-semibold text-black">
            Опрос
          </h2>
          <button
            type="button"
            className="min-w-[4.5rem] py-2 text-right text-[17px] font-semibold text-primary disabled:opacity-35"
            disabled={!canSend}
            onClick={() => void submit()}
          >
            {sending ? '…' : 'Готово'}
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-0 pb-[max(12px,env(safe-area-inset-bottom))]">
          {/* Question — grouped list style */}
          <div className="mt-3 px-4">
            <p className="mb-1.5 px-1 text-[13px] font-medium text-[#8e8e93]">Вопрос</p>
            <div className="relative overflow-hidden rounded-[10px] bg-white shadow-[0_0.5px_0_rgba(0,0,0,0.08)]">
              <textarea
                ref={questionRef}
                className="min-h-[88px] w-full resize-none border-0 bg-transparent px-3 py-3 pr-11 text-[17px] leading-[22px] text-black placeholder:text-[#c7c7cc] focus:outline-none focus:ring-0 [font-variant-emoji:emoji]"
                maxLength={500}
                placeholder="Задайте вопрос"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                disabled={sending}
                rows={3}
              />
              <button
                type="button"
                className={[
                  'absolute right-1.5 top-1.5 grid h-9 w-9 place-items-center rounded-full text-[#8e8e93] transition-colors',
                  'hover:bg-stone-100 hover:text-stone-600',
                  emojiField === 'question' ? 'bg-stone-200 text-stone-800' : '',
                ].join(' ')}
                disabled={sending}
                aria-label="Вставить эмодзи в вопрос"
                aria-expanded={emojiField === 'question'}
                title="Эмодзи"
                onClick={(e) => {
                  e.stopPropagation();
                  emojiBtnRef.current = e.currentTarget;
                  setEmojiField((f) => (f === 'question' ? null : 'question'));
                }}
              >
                <LuSmile size={20} strokeWidth={2} aria-hidden />
              </button>
            </div>
          </div>

          {/* Answer options */}
          <div className="mt-5 px-4">
            <p className="mb-1.5 px-1 text-[13px] font-medium text-[#8e8e93]">Варианты ответа</p>
            <ul className="overflow-hidden rounded-[10px] bg-white shadow-[0_0.5px_0_rgba(0,0,0,0.08)]">
              {options.map((opt, i) => (
                <li
                  key={i}
                  className={[
                    'flex items-center gap-0.5 border-b border-black/[0.07] last:border-b-0',
                    i === 0 ? '' : '',
                  ].join(' ')}
                >
                  <input
                    ref={(el) => {
                      if (el) optionElRef.current.set(i, el);
                      else optionElRef.current.delete(i);
                    }}
                    type="text"
                    className="min-w-0 flex-1 border-0 bg-transparent px-3 py-3 pr-1 text-[17px] text-black placeholder:text-[#c7c7cc] focus:outline-none focus:ring-0 [font-variant-emoji:emoji]"
                    maxLength={200}
                    placeholder={`Вариант ответа ${i + 1}`}
                    value={opt}
                    onChange={(e) => setOption(i, e.target.value)}
                    disabled={sending}
                  />
                  <button
                    type="button"
                    className={[
                      'grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#c7c7cc] transition-colors hover:bg-stone-100 hover:text-stone-500 disabled:opacity-30',
                      emojiField === i ? 'bg-stone-200 text-stone-700' : '',
                    ].join(' ')}
                    disabled={sending}
                    aria-label={`Эмодзи для варианта ${i + 1}`}
                    aria-expanded={emojiField === i}
                    title="Эмодзи"
                    onClick={(e) => {
                      e.stopPropagation();
                      emojiBtnRef.current = e.currentTarget;
                      setEmojiField((f) => (f === i ? null : i));
                    }}
                  >
                    <LuSmile size={19} strokeWidth={2} aria-hidden />
                  </button>
                  {options.length > MIN_OPTIONS ? (
                    <button
                      type="button"
                      className="mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#c7c7cc] transition-colors hover:bg-stone-100 hover:text-stone-500 disabled:opacity-30"
                      onClick={() => removeOption(i)}
                      disabled={sending}
                      aria-label="Удалить вариант"
                    >
                      <LuTrash2 size={18} strokeWidth={1.75} />
                    </button>
                  ) : (
                    <span className="w-2 shrink-0" aria-hidden />
                  )}
                </li>
              ))}
            </ul>

            {options.length < MAX_OPTIONS ? (
              <button
                type="button"
                className="mt-2 flex w-full items-center gap-2 rounded-[10px] bg-white px-3 py-3.5 text-left text-[17px] font-normal text-primary shadow-[0_0.5px_0_rgba(0,0,0,0.08)] active:opacity-80 disabled:opacity-45"
                onClick={addOption}
                disabled={sending}
              >
                <LuPlus size={22} strokeWidth={2} className="text-primary" />
                Добавить вариант ответа…
              </button>
            ) : null}
          </div>

          {/* Settings — как в Telegram: несколько опций в одной карточке */}
          <div className="mt-5 px-4">
            <p className="mb-1.5 px-1 text-[13px] font-medium text-[#8e8e93]">Настройки опроса</p>
            <div className="overflow-hidden rounded-[10px] bg-white shadow-[0_0.5px_0_rgba(0,0,0,0.08)]">
              <div className="divide-y divide-black/[0.07]">
                <div className="flex items-start gap-3 px-3 py-3.5 pr-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[17px] font-normal leading-snug text-black">Множественный выбор</div>
                    <p className="mt-1 text-[13px] leading-relaxed text-[#8e8e93]">
                      Участник может отметить несколько вариантов и отправить один голос со всеми выбранными
                      ответами.
                    </p>
                  </div>
                  <TgSwitch
                    id="poll-multi-switch"
                    checked={allowsMultiple}
                    onCheckedChange={setAllowsMultiple}
                    disabled={sending}
                  />
                </div>
                <div className="flex items-start gap-3 px-3 py-3.5 pr-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[17px] font-normal leading-snug text-black">Анонимный опрос</div>
                    <p className="mt-1 text-[13px] leading-relaxed text-[#8e8e93]">
                      Никто не увидит, кто за что голосовал — только итоги (проценты и число голосов).
                    </p>
                  </div>
                  <TgSwitch
                    id="poll-anon-switch"
                    checked={anonymous}
                    onCheckedChange={setAnonymous}
                    disabled={sending}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {emojiField != null && emojiPos
        ? createPortal(
            <div
              ref={emojiPopoverRef}
              role="dialog"
              aria-label="Выбор эмодзи"
              className="tg-popover tg-emoji-picker-popover overflow-hidden rounded-2xl border border-gray-100 bg-[var(--surface-elevated)] shadow-md"
              style={{
                position: 'fixed',
                bottom: `${emojiPos.bottomPx}px`,
                left: emojiPos.leftPx != null ? `${emojiPos.leftPx}px` : undefined,
                right: emojiPos.rightPx != null ? `${emojiPos.rightPx}px` : undefined,
                zIndex: 120_002,
              }}
            >
              <Picker
                data={emojiData as any}
                onEmojiSelect={(e: { native?: string }) => insertEmoji(String(e?.native ?? ''))}
                theme="light"
                searchPosition="sticky"
                previewPosition="none"
                navPosition="bottom"
                dynamicWidth={true}
                perLine={8}
                maxFrequentRows={2}
                locale="ru"
              />
            </div>,
            document.body,
          )
        : null}
    </div>,
    document.body,
  );
}
