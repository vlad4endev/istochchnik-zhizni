import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { analyzeCodeWithClaude } from '../analyzers/codeAnalyzer';
import { collectServerDiagnostics } from '../analyzers/serverAnalyzer';
import { resolveSafeScanDir, scanProject } from '../analyzers/projectScanner';
import { ProjectAuditResult } from '../types';

export const diagnosticsRouter = Router();

function extractJson(raw: string): unknown {
  const objectMatch = raw.match(/\{[\s\S]*\}/);
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  const candidate = objectMatch?.[0] ?? arrayMatch?.[0];
  if (!candidate) {
    throw new Error('Claude response does not contain JSON payload');
  }
  return JSON.parse(candidate);
}

async function resolveVersion(): Promise<string> {
  try {
    const packagePath = path.join(process.cwd(), 'package.json');
    const raw = await fs.readFile(packagePath, 'utf8');
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

async function runAuditWithClaude(description: string, payload: unknown): Promise<ProjectAuditResult> {
  const fallback: ProjectAuditResult = {
    timestamp: new Date().toISOString(),
    description,
    overallScore: 50,
    summary: 'AI-аудит недоступен, возвращен базовый результат.',
    issues: [],
    recommendations: ['Проверьте ANTHROPIC_API_KEY и повторите аудит.'],
    fallback: true,
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ...fallback,
      summary: 'AI-аудит недоступен: не задан ANTHROPIC_API_KEY.',
    };
  }

  const prompt = [
    'You are a senior Node.js/TypeScript architect.',
    'Perform a full architecture audit based on provided diagnostics snapshots.',
    'Return PURE JSON only (no markdown fences).',
    'Schema:',
    '{',
    '  "overallScore": number,',
    '  "summary": string,',
    '  "recommendations": string[],',
    '  "issues": [{',
    '    "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",',
    '    "title": string,',
    '    "description": string,',
    '    "suggestion": string,',
    '    "category": string',
    '  }]',
    '}',
    `Audit focus: ${description}`,
    JSON.stringify(payload, null, 2),
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
      const body = await response.text();
      return {
        ...fallback,
        summary: `AI-аудит недоступен: HTTP ${response.status}.`,
        recommendations: [`Ответ API: ${body.slice(0, 300)}`],
      };
    }

    const data = (await response.json()) as { content?: Array<{ text?: string }> };
    const text = data.content?.map((item) => item.text ?? '').join('\n') ?? '';
    const parsed = extractJson(text) as {
      overallScore?: unknown;
      summary?: unknown;
      recommendations?: unknown;
      issues?: unknown;
    };

    return {
      timestamp: new Date().toISOString(),
      description,
      overallScore: Math.min(100, Math.max(0, Number(parsed.overallScore ?? 50))),
      summary: String(parsed.summary ?? 'AI-аудит выполнен.'),
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.map((item) => String(item))
        : [],
      issues: Array.isArray(parsed.issues)
        ? parsed.issues.map((issue, index) => {
            const typed = issue as Record<string, unknown>;
            const severity = String(typed.severity ?? 'LOW');
            return {
              id: `audit-${index + 1}`,
              severity:
                severity === 'CRITICAL' || severity === 'HIGH' || severity === 'MEDIUM' || severity === 'LOW'
                  ? severity
                  : 'LOW',
              title: String(typed.title ?? 'Без названия'),
              description: String(typed.description ?? ''),
              suggestion: String(typed.suggestion ?? ''),
              category: String(typed.category ?? 'general'),
            };
          })
        : [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...fallback,
      summary: `AI-аудит недоступен: ${message}`,
    };
  }
}

diagnosticsRouter.get('/health', async (_req: Request, res: Response) => {
  const version = await resolveVersion();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version,
  });
});

diagnosticsRouter.post('/analyze', async (req: Request, res: Response) => {
  const code = String(req.body?.code ?? '').trim();
  const mode = String(req.body?.mode ?? 'general');
  const language = String(req.body?.language ?? 'typescript');

  if (!code) {
    res.status(400).json({ error: 'Поле code обязательно' });
    return;
  }

  const result = await analyzeCodeWithClaude({ code, mode, language });
  res.json(result);
});

diagnosticsRouter.get('/server', async (_req: Request, res: Response) => {
  const result = await collectServerDiagnostics();
  res.json(result);
});

diagnosticsRouter.get('/scan', async (req: Request, res: Response) => {
  try {
    const rootDir = process.cwd();
    const subdir = typeof req.query.subdir === 'string' ? req.query.subdir : undefined;
    const safeDir = resolveSafeScanDir(rootDir, subdir);
    const result = await scanProject(safeDir);
    res.json(result);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Не удалось выполнить сканирование',
    });
  }
});

diagnosticsRouter.post('/audit', async (req: Request, res: Response) => {
  const description = String(req.body?.description ?? 'General architecture and reliability audit');
  const scanSnapshot = await scanProject(process.cwd());
  const serverSnapshot = await collectServerDiagnostics();
  const payload = {
    description,
    scanSnapshot,
    serverSnapshot,
  };
  const audit = await runAuditWithClaude(description, payload);
  audit.scanSnapshot = scanSnapshot;
  audit.serverSnapshot = serverSnapshot;
  res.json(audit);
});
