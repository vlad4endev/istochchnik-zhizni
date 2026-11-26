import { chatCompletion } from '../../ai/llmClient';
import { CodeAnalysisResult, type DiagnosticIssue, type SeverityLevel } from '../types';

interface AnalyzeCodeInput {
  code: string;
  mode?: string;
  language?: string;
}

interface LlmCodeAuditShape {
  summary?: string;
  score?: number;
  recommendations?: string[];
  issues?: Array<{
    severity?: SeverityLevel;
    title?: string;
    description?: string;
    suggestion?: string;
    category?: string;
  }>;
}

function extractJson(raw: string): unknown {
  const objectMatch = raw.match(/\{[\s\S]*\}/);
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  const candidate = objectMatch?.[0] ?? arrayMatch?.[0];
  if (!candidate) {
    throw new Error('Ответ модели не содержит JSON-объекта');
  }
  return JSON.parse(candidate);
}

function normalizeScore(value: unknown, fallback = 75): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function normalizeIssues(issues: LlmCodeAuditShape['issues']): DiagnosticIssue[] {
  if (!Array.isArray(issues)) return [];
  return issues.map((issue, index) => {
    const severity = issue?.severity;
    const normalizedSeverity: SeverityLevel =
      severity === 'CRITICAL' || severity === 'HIGH' || severity === 'MEDIUM' || severity === 'LOW'
        ? severity
        : 'LOW';
    return {
      id: `issue-${index + 1}`,
      severity: normalizedSeverity,
      title: String(issue?.title ?? 'Без названия'),
      description: String(issue?.description ?? 'Описание отсутствует'),
      suggestion: String(issue?.suggestion ?? 'Рекомендация отсутствует'),
      category: issue?.category ? String(issue.category) : undefined,
    };
  });
}

function runStaticHeuristicAudit(input: AnalyzeCodeInput, fallbackReason?: string): CodeAnalysisResult {
  const code = input.code;
  const issues: DiagnosticIssue[] = [];
  let score = 95;

  const pushIssue = (
    severity: SeverityLevel,
    penalty: number,
    title: string,
    description: string,
    suggestion: string,
    category: string,
  ) => {
    score -= penalty;
    issues.push({
      id: `static-${issues.length + 1}`,
      severity,
      title,
      description,
      suggestion,
      category,
    });
  };

  if (/\beval\s*\(|new\s+Function\s*\(/.test(code)) {
    pushIssue(
      'CRITICAL',
      30,
      'Динамическое исполнение кода (eval / Function)',
      'Обнаружен вызов eval() или new Function(), что создаёт риск RCE / XSS.',
      'Замените на безопасный парсинг или явную логику.',
      'security',
    );
  }
  if (/(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"]{10,}['"]/i.test(code)) {
    pushIssue(
      'CRITICAL',
      25,
      'Возможный хардкод секрета в коде',
      'Найдено присваивание строкового литерала ключу/паролю/токену.',
      'Вынесите секрет в переменные окружения (.env).',
      'security',
    );
  }
  if (/SELECT\s+\*/i.test(code)) {
    pushIssue(
      'MEDIUM',
      8,
      'Использование SELECT * в SQL-запросе',
      'SELECT * тянет лишние колонки и ломается при изменении схемы.',
      'Явно перечислите необходимые поля в запросе.',
      'performance',
    );
  }
  if (/query\s*\(\s*`[^`]*\$\{/.test(code)) {
    pushIssue(
      'HIGH',
      20,
      'Возможная SQL-инъекция через шаблонную строку',
      'Интерполяция `${...}` внутри SQL-запроса может привести к SQL-инъекции.',
      'Используйте параметризованные запросы ($1, $2, ...).',
      'security',
    );
  }
  const consoleMatches = code.match(/console\.log\s*\(/g);
  if (consoleMatches && consoleMatches.length >= 5) {
    pushIssue(
      'LOW',
      5,
      `Много отладочных console.log (${consoleMatches.length})`,
      'Избыточный вывод в stdout зашумляет логи продакшена.',
      'Используйте структурированное логирование writeAppLog или удалите отладку.',
      'maintainability',
    );
  }

  return {
    mode: input.mode ?? 'general',
    language: input.language ?? 'typescript',
    summary:
      issues.length > 0
        ? `Статический анализ выявил замечаний: ${issues.length}.${fallbackReason ? ` (ИИ-провайдер: ${fallbackReason})` : ''}`
        : `Статический анализ не нашёл очевидных проблем.${fallbackReason ? ` (ИИ-провайдер: ${fallbackReason})` : ''}`,
    score: Math.max(0, Math.min(100, score)),
    issues,
    recommendations:
      issues.length > 0
        ? issues.map((i) => i.suggestion)
        : ['Для более глубокого разбора включите ИИ в Админке → Интеграции → ИИ.'],
    fallback: true,
  };
}

export async function analyzeCodeWithClaude(input: AnalyzeCodeInput): Promise<CodeAnalysisResult> {
  const mode = input.mode ?? 'general';
  const language = input.language ?? 'typescript';
  const prompt = [
    'You are a senior static code auditor.',
    'Analyze the provided code for bugs, security issues and performance problems. Respond in Russian.',
    'Return PURE JSON only (no markdown, no code fences).',
    'JSON schema:',
    '{',
    '  "summary": string,',
    '  "score": number,',
    '  "recommendations": string[],',
    '  "issues": [',
    '    {',
    '      "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",',
    '      "title": string,',
    '      "description": string,',
    '      "suggestion": string,',
    '      "category": string',
    '    }',
    '  ]',
    '}',
    `Mode: ${mode}`,
    `Language: ${language}`,
    'Code:',
    input.code,
  ].join('\n');

  try {
    const modelText = await chatCompletion([{ role: 'user', content: prompt }], {
      skipSystemPrompt: true,
      max_tokens: 1800,
      temperature: 0.2,
    });
    const parsed = extractJson(modelText) as LlmCodeAuditShape;
    return {
      mode,
      language,
      summary: String(parsed.summary ?? 'Анализ завершен'),
      score: normalizeScore(parsed.score),
      issues: normalizeIssues(parsed.issues),
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.map((v) => String(v))
        : [],
      rawModelResponse: modelText,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return runStaticHeuristicAudit(input, reason);
  }
}
