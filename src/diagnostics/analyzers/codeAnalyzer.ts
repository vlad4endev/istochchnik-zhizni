import { CodeAnalysisResult, type DiagnosticIssue, type SeverityLevel } from '../types';

interface AnalyzeCodeInput {
  code: string;
  mode?: string;
  language?: string;
}

interface ClaudeJsonShape {
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
    throw new Error('Claude response does not contain JSON payload');
  }
  return JSON.parse(candidate);
}

function normalizeScore(value: unknown, fallback = 50): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function normalizeIssues(issues: ClaudeJsonShape['issues']): DiagnosticIssue[] {
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

function buildFallbackResult(input: AnalyzeCodeInput, reason: string): CodeAnalysisResult {
  return {
    mode: input.mode ?? 'general',
    language: input.language ?? 'typescript',
    summary: `AI-анализ временно недоступен: ${reason}`,
    score: 50,
    issues: [],
    recommendations: [
      'Проверьте ANTHROPIC_API_KEY в окружении.',
      'Повторите запрос позже или уменьшите размер сниппета.',
    ],
    fallback: true,
  };
}

export async function analyzeCodeWithClaude(input: AnalyzeCodeInput): Promise<CodeAnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return buildFallbackResult(input, 'не задан ANTHROPIC_API_KEY');
  }

  const mode = input.mode ?? 'general';
  const language = input.language ?? 'typescript';
  const prompt = [
    'You are a senior static code auditor.',
    'Analyze the provided code for bugs, security issues and performance problems.',
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
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return buildFallbackResult(input, `HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    const raw = (await response.json()) as { content?: Array<{ text?: string }> };
    const modelText = raw.content?.map((item) => item.text ?? '').join('\n').trim() ?? '';
    const parsed = extractJson(modelText) as ClaudeJsonShape;

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
    return buildFallbackResult(input, reason);
  }
}
