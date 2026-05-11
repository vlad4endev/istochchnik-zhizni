import { AiAgentError, chatCompletion } from '../../ai/llmClient';
import type {
  AutomatedTestsReport,
  AutoTestFailureAnalysisItem,
  AutoTestFailureAnalysisReport,
} from '../types';

function extractJson(raw: string): unknown {
  const objectMatch = raw.match(/\{[\s\S]*\}/);
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  const candidate = objectMatch?.[0] ?? arrayMatch?.[0];
  if (!candidate) {
    throw new Error('Ответ модели не содержит JSON-объекта');
  }
  return JSON.parse(candidate);
}

function normalizeSeverity(raw: unknown): AutoTestFailureAnalysisItem['severity'] {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'blocking' || s === 'high' || s === 'medium' || s === 'low') return s;
  return 'medium';
}

function mapAgentError(error: AiAgentError): { summary: string; hint?: string } {
  if (error.code === 'ai_disabled') {
    return {
      summary: 'Модуль ИИ отключён в настройках.',
      hint: 'Включите ИИ: Админка → Интеграции → ИИ (секция внутри интеграций).',
    };
  }
  if (error.code === 'ai_not_configured') {
    return {
      summary: 'Не настроен доступ к API выбранного провайдера.',
      hint:
        'Укажите API-ключ в настройках ИИ или задайте переменные окружения AI_API_KEY / OPENAI_API_KEY на сервере.',
    };
  }
  if (error.code === 'ai_http_error') {
    return {
      summary: `Ошибка HTTP при обращении к провайдеру: ${error.message}`,
      hint: error.bodySnippet ? error.bodySnippet.slice(0, 500) : undefined,
    };
  }
  return {
    summary: `Ошибка ИИ: ${error.message}`,
    hint: error.bodySnippet ? error.bodySnippet.slice(0, 500) : undefined,
  };
}

/**
 * Разбор провалов автотестов через LLM из настроек интеграции ИИ (OpenAI-совместимый endpoint).
 */
export async function analyzeAutomatedTestFailures(
  report: AutomatedTestsReport,
): Promise<AutoTestFailureAnalysisReport> {
  const generatedAt = new Date().toISOString();
  const failures = report.results.filter((r) => r.status === 'failed');

  if (failures.length === 0) {
    return {
      generatedAt,
      executiveSummary: 'Проваленных тестов нет — анализ ИИ не требуется.',
      items: [],
      fallback: false,
    };
  }

  const compactFailures = failures.map((f) => ({
    id: f.id,
    name: f.name,
    category: f.category,
    tier: f.tier,
    message: f.message,
    detail: f.detail ?? null,
    httpStatus: f.httpStatus ?? null,
    responsePreview: f.responsePreview ?? null,
  }));

  const prompt = [
    'You are a senior SRE and Node.js/TypeScript backend engineer.',
    'Below are FAILED automated integration tests from a church management REST API.',
    'For each failure: infer the most likely root cause using message, HTTP status, and response body fragments.',
    'Be concrete (config, routing, auth, DB, proxy). Respond in Russian.',
    'Return PURE JSON only (no markdown fences).',
    'Schema:',
    '{',
    '  "executiveSummary": string,',
    '  "items": [{',
    '    "testId": string,',
    '    "likelyRootCause": string,',
    '    "evidence": string,',
    '    "recommendedSteps": string[],',
    '    "severity": "blocking" | "high" | "medium" | "low"',
    '  }]',
    '}',
    `baseUrl: ${report.baseUrl}`,
    `suiteGeneratedAt: ${report.generatedAt}`,
    `authenticatedContext: ${report.authenticatedContext}`,
    'failures:',
    JSON.stringify(compactFailures, null, 2),
  ].join('\n');

  try {
    const text = await chatCompletion([{ role: 'user', content: prompt }], {
      skipSystemPrompt: true,
      max_tokens: 4096,
      temperature: 0.2,
    });

    const parsed = extractJson(text) as {
      executiveSummary?: unknown;
      items?: unknown;
    };

    const executiveSummary = String(parsed.executiveSummary ?? 'Анализ выполнен.');
    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];

    const items: AutoTestFailureAnalysisItem[] = rawItems.map((raw, index) => {
      const row = raw as Record<string, unknown>;
      const testId = String(row.testId ?? failures[index]?.id ?? `unknown-${index}`);
      return {
        testId,
        likelyRootCause: String(row.likelyRootCause ?? row.likely_root_cause ?? 'Не указано'),
        evidence: String(row.evidence ?? ''),
        recommendedSteps: Array.isArray(row.recommendedSteps)
          ? row.recommendedSteps.map((s) => String(s))
          : Array.isArray(row.recommended_steps)
            ? row.recommended_steps.map((s) => String(s))
            : [],
        severity: normalizeSeverity(row.severity),
      };
    });

    return {
      generatedAt,
      executiveSummary,
      items,
      fallback: false,
    };
  } catch (error) {
    if (error instanceof AiAgentError) {
      const mapped = mapAgentError(error);
      return {
        generatedAt,
        executiveSummary: mapped.summary,
        items: [],
        fallback: true,
        errorHint: mapped.hint,
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      generatedAt,
      executiveSummary: `Ошибка при разборе ответа ИИ: ${message}`,
      items: [],
      fallback: true,
      errorHint: message,
    };
  }
}
