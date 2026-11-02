import { AiAgentError, chatCompletion } from '../ai';
import { BIBLE_BOOK_DEFS } from '../bible/bibleBookCatalog';
import { createPlanWithDays, validateAiPlanPayload, type BiblePlanRow } from './biblePlansService';

function buildCanonHint(): string {
  return BIBLE_BOOK_DEFS.map((b) => `${b.slug}:${b.chapters}`).join(',');
}

export async function generateBibleReadingPlan(input: {
  memberId: number;
  goal: string;
  days: number;
  startDate?: string | null;
}): Promise<BiblePlanRow> {
  const days = Math.min(90, Math.max(3, Math.floor(input.days) || 7));
  const goal = input.goal.trim().slice(0, 2000);
  if (!goal) {
    throw new AiAgentError('Укажите цель плана чтения', 'ai_bad_response');
  }

  const systemExtra = [
    'Ты помощник по составлению плана чтения Библии.',
    'Верни ТОЛЬКО JSON вида: {"title":"...","days":[{"day":1,"label":"...","refs":[{"book_slug":"john","chapter":3,"verse_start":1,"verse_end":16}]}]}',
    'book_slug — английский slug из канона (genesis, john, 1-corinthians, …).',
    'Не выдумывай книги и не превышай число глав. Не включай текст стихов — только ссылки.',
    `Канон (slug:chapters): ${buildCanonHint()}`,
  ].join('\n');

  const userPrompt = [
    `Цель: ${goal}`,
    `Количество дней: ${days}`,
    input.startDate ? `Дата старта: ${input.startDate}` : null,
    'Распредели чтение равномерно и реалистично по объёму.',
  ]
    .filter(Boolean)
    .join('\n');

  const reply = await chatCompletion(
    [
      { role: 'system', content: systemExtra },
      { role: 'user', content: userPrompt },
    ],
    {
      section: 'bible',
      response_format: { type: 'json_object' },
      temperature: 0.4,
      max_tokens: 4096,
    },
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(reply);
  } catch {
    throw new AiAgentError('ИИ вернул невалидный JSON плана', 'ai_bad_response');
  }

  const validated = validateAiPlanPayload(parsed);
  if (!validated) {
    throw new AiAgentError('План не прошёл проверку по канону', 'ai_bad_response');
  }

  return createPlanWithDays(input.memberId, {
    title: validated.title,
    goal,
    startDate: input.startDate ?? null,
    aiPrompt: goal,
    days: validated.days.map((d) => ({
      day: d.day,
      label: d.label,
      refs: d.refs,
    })),
  });
}
