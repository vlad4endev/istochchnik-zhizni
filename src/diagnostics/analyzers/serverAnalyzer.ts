import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ServerDiagnosticResult } from '../types';

const execFileAsync = promisify(execFile);

function extractJson(raw: string): unknown {
  const objectMatch = raw.match(/\{[\s\S]*\}/);
  const arrayMatch = raw.match(/\[[\s\S]*\]/);
  const candidate = objectMatch?.[0] ?? arrayMatch?.[0];
  if (!candidate) {
    throw new Error('Claude response does not contain JSON payload');
  }
  return JSON.parse(candidate);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sumCpuTimes(snapshot: os.CpuInfo[]): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const cpu of snapshot) {
    idle += cpu.times.idle;
    total +=
      cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  return { idle, total };
}

async function sampleCpuUsage(sampleMs = 500): Promise<number> {
  const start = sumCpuTimes(os.cpus());
  await wait(sampleMs);
  const end = sumCpuTimes(os.cpus());
  const idleDelta = end.idle - start.idle;
  const totalDelta = end.total - start.total;
  if (totalDelta <= 0) return 0;
  return Number((((totalDelta - idleDelta) / totalDelta) * 100).toFixed(2));
}

async function readDiskUsageK(): Promise<ServerDiagnosticResult['disk']> {
  try {
    const { stdout } = await execFileAsync('df', ['-k', '.']);
    const lines = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) return null;
    const parts = lines[1].split(/\s+/);
    if (parts.length < 6) return null;
    const usagePercent = Number(String(parts[4]).replace('%', ''));
    return {
      filesystem: parts[0],
      totalKb: Number(parts[1]) || 0,
      usedKb: Number(parts[2]) || 0,
      availableKb: Number(parts[3]) || 0,
      usagePercent: Number.isFinite(usagePercent) ? usagePercent : 0,
      mountPoint: parts[5],
    };
  } catch {
    return null;
  }
}

async function buildAiRecommendations(snapshot: ServerDiagnosticResult): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return ['ANTHROPIC_API_KEY не задан. AI-рекомендации недоступны.'];
  }

  const prompt = [
    'You are a senior SRE.',
    'Given server metrics, return PURE JSON only (no markdown fences).',
    'Schema: { "recommendations": string[] }',
    'Focus on actionable, concrete, prioritized recommendations.',
    JSON.stringify(snapshot, null, 2),
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
      const errorText = await response.text();
      return [`AI-рекомендации недоступны: HTTP ${response.status} ${errorText.slice(0, 120)}`];
    }
    const json = (await response.json()) as { content?: Array<{ text?: string }> };
    const rawText = json.content?.map((item) => item.text ?? '').join('\n') ?? '';
    const parsed = extractJson(rawText) as { recommendations?: unknown };
    if (!Array.isArray(parsed.recommendations)) {
      return ['Claude вернул ответ без рекомендаций.'];
    }
    return parsed.recommendations.map((item) => String(item));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [`AI-рекомендации недоступны: ${message}`];
  }
}

export async function collectServerDiagnostics(): Promise<ServerDiagnosticResult> {
  const [cpuUsagePercent, disk] = await Promise.all([sampleCpuUsage(500), readDiskUsageK()]);
  const totalBytes = os.totalmem();
  const freeBytes = os.freemem();
  const usedBytes = totalBytes - freeBytes;
  const memoryUsagePercent = totalBytes > 0 ? Number(((usedBytes / totalBytes) * 100).toFixed(2)) : 0;

  const result: ServerDiagnosticResult = {
    timestamp: new Date().toISOString(),
    cpu: {
      usagePercent: cpuUsagePercent,
      sampledOverMs: 500,
    },
    memory: {
      totalBytes,
      freeBytes,
      usedBytes,
      usagePercent: memoryUsagePercent,
    },
    disk,
    runtime: {
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      env: process.env.NODE_ENV ?? 'development',
      processUptimeSec: Number(process.uptime().toFixed(2)),
      systemUptimeSec: Number(os.uptime().toFixed(2)),
      loadAverage: os.loadavg().map((value) => Number(value.toFixed(2))),
    },
    recommendations: [],
  };

  result.recommendations = await buildAiRecommendations(result);
  return result;
}
