import { useEffect, useMemo, useState } from 'react';
import { IoCheckmark } from 'react-icons/io5';
import { AppAvatar } from '../../../components/AppAvatar';
import {
  fetchPollVoters,
  type MessageWithSender,
  type PollVoter,
} from '../api/messengerApi';
import { useChatStore } from '../chatStore';
import { PollVotersSheet } from './PollVotersSheet';

function formatVoteCountRU(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${n} голосов`;
  if (mod10 === 1) return `${n} голос`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} голоса`;
  return `${n} голосов`;
}

function formatPollVoterPreviewLine(voters: PollVoter[], maxNames = 2): string {
  if (voters.length === 0) return '';
  if (voters.length === 1) return voters[0].display_name;
  const shown = voters.slice(0, maxNames);
  const rest = voters.length - shown.length;
  if (rest === 0) return shown.map((v) => v.display_name).join(', ');
  return `${shown.map((v) => v.display_name).join(', ')} и ещё ${rest}`;
}

type MessengerPollCardProps = {
  message: MessageWithSender;
  isMine: boolean;
  isOptimistic: boolean;
};

/**
 * Telegram-like poll inside a message bubble.
 * Hooks must run unconditionally — message id is stable via client_msg_id while
 * optimistic `temp-*` upgrades to a real id (same React tree key).
 */
export function MessengerPollCard({ message, isMine, isOptimistic }: MessengerPollCardProps) {
  const votePoll = useChatStore((s) => s.votePoll);
  const payload = (message.payload ?? {}) as Record<string, unknown>;
  const options = useMemo(
    () => (Array.isArray(payload.options) ? payload.options.map((x) => String(x ?? '')) : []),
    [payload.options],
  );
  const allowsMultiple = Boolean(payload.allows_multiple);
  const isAnonymous = Boolean(payload.anonymous);
  const tallies =
    message.poll_tallies?.length === options.length ? message.poll_tallies! : options.map(() => 0);
  const myVotes = message.poll_my_options ?? [];
  const mySet = useMemo(() => new Set(myVotes), [myVotes]);
  const total = tallies.reduce((a, b) => a + b, 0);
  const hasMyVote = mySet.size > 0;

  const [multiEdit, setMultiEdit] = useState(false);
  const [multiPick, setMultiPick] = useState<Set<number>>(() => new Set());
  const [pollVotersFor, setPollVotersFor] = useState<{ optionIndex: number; label: string } | null>(
    null,
  );
  const [votersPreviewByOption, setVotersPreviewByOption] = useState<Record<
    number,
    PollVoter[]
  > | null>(null);
  const [voting, setVoting] = useState(false);

  const showMultiPicker = !isOptimistic && allowsMultiple && (!hasMyVote || multiEdit);
  const showSinglePicker = !isOptimistic && !allowsMultiple && !hasMyVote;
  const showPollResults = !isOptimistic && !showSinglePicker && !showMultiPicker;

  useEffect(() => {
    if (isOptimistic || isAnonymous || !showPollResults || !/^\d+$/.test(String(message.id))) {
      setVotersPreviewByOption(null);
      return;
    }
    let cancelled = false;
    void fetchPollVoters(String(message.id))
      .then((res) => {
        if (cancelled) return;
        if (res.anonymous) {
          setVotersPreviewByOption({});
          return;
        }
        const rec: Record<number, PollVoter[]> = {};
        for (const o of res.options) {
          rec[o.index] = o.voters;
        }
        setVotersPreviewByOption(rec);
      })
      .catch(() => {
        if (!cancelled) setVotersPreviewByOption({});
      });
    return () => {
      cancelled = true;
    };
  }, [
    isAnonymous,
    isOptimistic,
    message.id,
    showPollResults,
    message.poll_tallies,
    message.poll_my_options,
  ]);

  const toggleMulti = (i: number) => {
    setMultiPick((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const startMultiEdit = () => {
    setMultiPick(new Set(myVotes));
    setMultiEdit(true);
  };

  const runVote = async (indexes: number[]) => {
    if (voting || isOptimistic) return;
    setVoting(true);
    try {
      await votePoll(message.id, indexes);
      setMultiEdit(false);
    } finally {
      setVoting(false);
    }
  };

  const qCls = isMine ? 'text-white' : 'text-[var(--text)]';
  const muted = isMine ? 'text-white/65' : 'text-[var(--text-secondary)]';
  const barFill = isMine ? 'bg-white/25' : 'bg-primary/18';
  const barFillPicked = isMine ? 'bg-white/40' : 'bg-primary/28';
  const pctCls = isMine
    ? 'text-white tabular-nums tracking-normal'
    : 'text-primary tabular-nums tracking-normal';

  if (!options.length) {
    return <span className={qCls}>Опрос недоступен</span>;
  }

  return (
    <div className="msg-poll w-full min-w-[12.5rem] max-w-[19.5rem] space-y-2.5">
      <p className={['text-[15px] font-semibold leading-snug tracking-[-0.01em]', qCls].join(' ')}>
        {message.content || '—'}
      </p>

      <ul className="space-y-1">
        {options.map((label, i) => {
          const count = tallies[i] ?? 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          const picked = mySet.has(i);
          const optionLabel = label || `Вариант ${i + 1}`;

          if (isOptimistic || showSinglePicker || showMultiPicker) {
            const checked = showMultiPicker ? multiPick.has(i) : false;
            const isCheckStyle = allowsMultiple;
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={isOptimistic || voting}
                  onClick={() => {
                    if (isOptimistic) return;
                    if (showMultiPicker) toggleMulti(i);
                    else void runVote([i]);
                  }}
                  className={[
                    'msg-poll__option flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors',
                    isMine ? 'hover:bg-white/[0.1] active:bg-white/[0.14]' : 'hover:bg-black/[0.04] active:bg-black/[0.06]',
                    isOptimistic ? 'cursor-default opacity-90' : '',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'grid h-[20px] w-[20px] shrink-0 place-items-center border-2',
                      isCheckStyle ? 'rounded-[5px]' : 'rounded-full',
                      checked
                        ? isMine
                          ? 'border-white bg-white text-primary'
                          : 'border-primary bg-primary text-white'
                        : isMine
                          ? 'border-white/55'
                          : 'border-stone-300',
                    ].join(' ')}
                    aria-hidden
                  >
                    {checked ? <IoCheckmark className="h-3.5 w-3.5" /> : null}
                  </span>
                  <span className={['min-w-0 flex-1 text-[15px] leading-snug', qCls].join(' ')}>
                    {optionLabel}
                  </span>
                </button>
              </li>
            );
          }

          const voters = votersPreviewByOption?.[i] ?? [];
          const showVoterStrip = !isAnonymous && voters.length > 0;

          return (
            <li key={i}>
              <div
                className={[
                  'msg-poll__result relative overflow-hidden rounded-[10px]',
                  isMine ? 'bg-white/[0.06]' : 'bg-black/[0.03]',
                ].join(' ')}
              >
                <div
                  className={[
                    'pointer-events-none absolute inset-y-0 left-0 transition-[width] duration-500 ease-out',
                    picked ? barFillPicked : barFill,
                  ].join(' ')}
                  style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
                  aria-hidden
                />
                <div className="relative z-10 flex items-stretch">
                  <button
                    type="button"
                    disabled={allowsMultiple || voting}
                    onClick={() => {
                      if (!allowsMultiple) void runVote([i]);
                    }}
                    className={[
                      'flex min-w-0 flex-1 items-start gap-2.5 px-2.5 py-2 text-left',
                      allowsMultiple ? 'cursor-default' : 'active:opacity-90',
                    ].join(' ')}
                  >
                    <span className="mt-0.5 flex h-[20px] w-[20px] shrink-0 items-center justify-center" aria-hidden>
                      {allowsMultiple ? (
                        picked ? (
                          <span
                            className={[
                              'grid h-[20px] w-[20px] place-items-center rounded-[5px] border-2',
                              isMine ? 'border-white bg-white/30 text-white' : 'border-primary bg-primary text-white',
                            ].join(' ')}
                          >
                            <IoCheckmark className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <span
                            className={[
                              'block h-[20px] w-[20px] rounded-[5px] border-2',
                              isMine ? 'border-white/40' : 'border-stone-300',
                            ].join(' ')}
                          />
                        )
                      ) : picked ? (
                        <span
                          className={[
                            'grid h-[20px] w-[20px] place-items-center rounded-full border-2',
                            isMine ? 'border-white bg-white/25' : 'border-primary bg-primary',
                          ].join(' ')}
                        >
                          <span className="h-2 w-2 rounded-full bg-white" />
                        </span>
                      ) : (
                        <span
                          className={[
                            'block h-[20px] w-[20px] rounded-full border-2',
                            isMine ? 'border-white/40' : 'border-stone-300',
                          ].join(' ')}
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={['block text-[15px] leading-snug', qCls].join(' ')}>
                        {optionLabel}
                      </span>
                      {showVoterStrip ? (
                        <button
                          type="button"
                          className={[
                            'mt-1 flex max-w-full items-center gap-1.5 text-left',
                            muted,
                          ].join(' ')}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setPollVotersFor({ optionIndex: i, label: optionLabel });
                          }}
                        >
                          <span className="flex shrink-0 -space-x-1.5" aria-hidden>
                            {voters.slice(0, 3).map((v) => (
                              <AppAvatar
                                key={v.member_id}
                                className={[
                                  'relative h-5 w-5 rounded-full ring-1',
                                  isMine ? 'ring-[color:var(--tg-bubble-out-solid,#6d2f38)]' : 'ring-white',
                                ].join(' ')}
                                src={v.avatar_url}
                                alt=""
                                initialsFallbackText={v.display_name}
                                initialsColorSeed={String(v.member_id)}
                                priority
                                fallback={<span className="block h-full w-full rounded-full bg-stone-200" />}
                              />
                            ))}
                          </span>
                          <span className="min-w-0 truncate text-[11px] font-medium leading-none">
                            {formatPollVoterPreviewLine(voters)}
                          </span>
                        </button>
                      ) : null}
                    </span>
                  </button>
                  {isAnonymous ? (
                    <span
                      className={['shrink-0 self-center px-2.5 py-2 text-[13px] font-semibold', pctCls].join(
                        ' ',
                      )}
                    >
                      {`${pct}%`}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={[
                        'shrink-0 self-center rounded-md px-2.5 py-2 text-[13px] font-semibold transition-colors',
                        pctCls,
                        isMine ? 'hover:bg-white/12' : 'hover:bg-black/[0.04]',
                      ].join(' ')}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setPollVotersFor({ optionIndex: i, label: optionLabel });
                      }}
                      aria-label={`${optionLabel}: ${pct}%. ${formatVoteCountRU(count)}. Кто проголосовал`}
                      title="Кто проголосовал"
                    >
                      {`${pct}%`}
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {showMultiPicker ? (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {hasMyVote && multiEdit ? (
            <button
              type="button"
              onClick={() => setMultiEdit(false)}
              className={[
                'rounded-full px-3 py-1.5 text-[13px] font-medium',
                isMine ? 'bg-white/14 text-white' : 'bg-[var(--surface)] text-[var(--text-secondary)]',
              ].join(' ')}
            >
              Отмена
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void runVote([...multiPick].sort((a, b) => a - b))}
            disabled={multiPick.size === 0 || voting}
            className={[
              'rounded-full px-4 py-2 text-[13px] font-semibold disabled:opacity-40',
              isMine ? 'bg-white text-primary' : 'bg-primary text-white',
            ].join(' ')}
          >
            {hasMyVote ? 'Сохранить' : 'Голосовать'}
          </button>
        </div>
      ) : null}

      <div className={['flex flex-wrap items-center gap-x-1.5 text-[12px] leading-none', muted].join(' ')}>
        <span>{formatVoteCountRU(total)}</span>
        {allowsMultiple ? (
          <>
            <span aria-hidden>·</span>
            <span>Несколько ответов</span>
          </>
        ) : null}
        {isAnonymous ? (
          <>
            <span aria-hidden>·</span>
            <span>Анонимно</span>
          </>
        ) : null}
      </div>

      {allowsMultiple && hasMyVote && !multiEdit && !isOptimistic ? (
        <button
          type="button"
          onClick={startMultiEdit}
          className={[
            'text-[13px] font-medium underline-offset-2 hover:underline',
            isMine ? 'text-white/90' : 'text-primary',
          ].join(' ')}
        >
          Изменить голос
        </button>
      ) : null}

      <PollVotersSheet
        key={pollVotersFor ? `${message.id}-${pollVotersFor.optionIndex}` : `${message.id}-poll-voters`}
        open={pollVotersFor != null}
        onClose={() => setPollVotersFor(null)}
        messageId={message.id}
        optionIndex={pollVotersFor?.optionIndex ?? 0}
        optionLabel={pollVotersFor?.label ?? ''}
      />
    </div>
  );
}
