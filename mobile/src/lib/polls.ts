import type { MessageWithSender, PollVoter } from '../api/messenger';

export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 10;
export const POLL_MAX_QUESTION = 500;
export const POLL_MAX_OPTION = 200;

export type ParsedPoll = {
  question: string;
  options: string[];
  allowsMultiple: boolean;
  anonymous: boolean;
  tallies: number[];
  mine: Set<number>;
  total: number;
};

/** Опрос из сообщения: вопрос — это `content`, варианты и настройки — в `payload`. */
export function parsePoll(message: MessageWithSender): ParsedPoll | null {
  const p = message.payload && typeof message.payload === 'object' ? message.payload : {};
  const raw = (p as Record<string, unknown>).options;
  if (!Array.isArray(raw)) return null;
  const options = raw.map((x) => String(x ?? ''));
  if (options.length === 0) return null;
  const given = message.poll_tallies;
  const tallies =
    Array.isArray(given) && given.length === options.length
      ? given.map((n) => (Number.isFinite(Number(n)) ? Math.max(0, Number(n)) : 0))
      : options.map(() => 0);
  const mine = new Set((message.poll_my_options ?? []).filter((i) => Number.isInteger(i) && i >= 0 && i < options.length));
  return {
    question: String(message.content ?? '').trim(),
    options,
    allowsMultiple: Boolean((p as Record<string, unknown>).allows_multiple),
    anonymous: Boolean((p as Record<string, unknown>).anonymous),
    tallies,
    mine,
    total: tallies.reduce((a, b) => a + b, 0),
  };
}

export function votePercent(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

export function votesWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return `${n} голосов`;
  if (m10 === 1) return `${n} голос`;
  if (m10 >= 2 && m10 <= 4) return `${n} голоса`;
  return `${n} голосов`;
}

/** «Анна, Борис и ещё 3» — кто проголосовал за вариант. */
export function voterPreviewLine(voters: PollVoter[], maxNames = 2): string {
  if (voters.length === 0) return '';
  if (voters.length === 1) return voters[0]!.display_name;
  const shown = voters.slice(0, maxNames);
  const rest = voters.length - shown.length;
  const names = shown.map((v) => v.display_name).join(', ');
  return rest === 0 ? names : `${names} и ещё ${rest}`;
}

export type PollDraftCheck =
  | { ok: true; question: string; options: string[] }
  | { ok: false; error: string };

/** Проверка черновика до отправки: те же правила, что на сервере. Пустые варианты отбрасываются. */
export function checkPollDraft(questionRaw: string, optionsRaw: string[]): PollDraftCheck {
  const question = questionRaw.trim();
  if (!question) return { ok: false, error: 'Напишите вопрос.' };
  if (question.length > POLL_MAX_QUESTION) {
    return { ok: false, error: `Вопрос длиннее ${POLL_MAX_QUESTION} символов.` };
  }
  const options = optionsRaw.map((o) => o.trim()).filter(Boolean);
  if (options.length < POLL_MIN_OPTIONS) {
    return { ok: false, error: `Нужно минимум ${POLL_MIN_OPTIONS} варианта ответа.` };
  }
  if (options.length > POLL_MAX_OPTIONS) {
    return { ok: false, error: `Не больше ${POLL_MAX_OPTIONS} вариантов.` };
  }
  if (options.some((o) => o.length > POLL_MAX_OPTION)) {
    return { ok: false, error: `Вариант длиннее ${POLL_MAX_OPTION} символов.` };
  }
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
    return { ok: false, error: 'Варианты ответа не должны повторяться.' };
  }
  return { ok: true, question, options };
}
