import { AiAgentError, chatCompletion } from '../ai';
import { BIBLE_BOOK_DEFS } from '../bible/bibleBookCatalog';
import {
  createPlanWithDays,
  rebalancePlanDays,
  validateAiPlanPayload,
  type BiblePlanRow,
} from './biblePlansService';

function buildCanonHint(): string {
  return BIBLE_BOOK_DEFS.map((b) => `${b.slug}:${b.chapters}`).join(',');
}

function normalizeDateInput(raw?: string | null): string | null {
  const s = String(raw ?? '').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function addDaysIso(isoDate: string, offsetDays: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + offsetDays));
  return dt.toISOString().slice(0, 10);
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
    'Правила расписания:',
    `- Верни РОВНО ${days} дней, пронумерованных подряд с 1, без пропусков и дубликатов.`,
    '- Распределяй главы РАВНОМЕРНО: размеры дней отличаются не более чем на 1 главу.',
    '- Остаток глав добавляй по одной в ПЕРВЫЕ дни. Никогда не сваливай остаток в последний день.',
    '- Ссылки внутри плана должны идти подряд по канону, без повторов и пропусков глав.',
    `Канон (slug:chapters): ${buildCanonHint()}`,
  ].join('\n');

  const userPrompt = [
    `Цель: ${goal}`,
    `Количество дней: ${days}`,
    input.startDate ? `Дата старта: ${input.startDate}` : null,
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

  // Детерминированно выравниваем расписание: модель любит сваливать остаток
  // глав в последний день — здесь остаток уезжает в первые дни (±1 глава).
  const planDays = rebalancePlanDays(validated.days, days);
  const startDate = normalizeDateInput(input.startDate);

  return createPlanWithDays(input.memberId, {
    title: validated.title,
    goal,
    startDate,
    endDate: startDate ? addDaysIso(startDate, planDays.length - 1) : null,
    aiPrompt: goal,
    days: planDays.map((d) => ({
      day: d.day,
      label: d.label,
      refs: d.refs,
      dayDate: startDate ? addDaysIso(startDate, d.day - 1) : null,
    })),
  });
}
