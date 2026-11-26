import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ServerDiagnosticResult } from '../types';
import { readSystemMemoryInfo } from '../monitor/metrics';

const execFileAsync = promisify(execFile);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sumCpuTimes(snapshot: os.CpuInfo[]): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const cpu of snapshot) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
  }
  return { idle, total };
}

async function sampleCpuUsage(sampleMs = 350): Promise<number> {
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
    const parts = lines[1]!.split(/\s+/);
    if (parts.length < 6) return null;
    const usagePercent = Number(String(parts[4]).replace('%', ''));
    return {
      filesystem: parts[0]!,
      totalKb: Number(parts[1]) || 0,
      usedKb: Number(parts[2]) || 0,
      availableKb: Number(parts[3]) || 0,
      usagePercent: Number.isFinite(usagePercent) ? usagePercent : 0,
      mountPoint: parts[5]!,
    };
  } catch {
    return null;
  }
}

function buildDeterministicServerRecommendations(snapshot: ServerDiagnosticResult): string[] {
  const recs: string[] = [];
  const cores = Math.max(1, os.cpus().length);
  const load1 = snapshot.runtime.loadAverage[0] ?? 0;

  if (snapshot.cpu.usagePercent >= 85) {
    recs.push(
      `Высокая загрузка CPU (${snapshot.cpu.usagePercent.toFixed(1)}%): проверьте тяжёлые запросы, фоновые задачи бекапа/сканирования или увеличьте vCPU.`,
    );
  }
  if (load1 / cores >= 1.5) {
    recs.push(
      `Load Average 1m (${load1.toFixed(2)}) превышает количество ядер (${cores}): возможна очередь процессов или I/O-ожидание.`,
    );
  }
  if (snapshot.memory.usagePercent >= 88) {
    recs.push(
      `Оперативная память занята на ${snapshot.memory.usagePercent.toFixed(1)}%: проверьте утечки памяти, размер контейнеров и кеши PostgreSQL/Redis.`,
    );
  }
  if (snapshot.disk && snapshot.disk.usagePercent >= 85) {
    const availGb = (snapshot.disk.availableKb / 1024 / 1024).toFixed(2);
    recs.push(
      `Диск заполнен на ${snapshot.disk.usagePercent.toFixed(1)}% (осталось ${availGb} GB): очистите старые локальные бекапы, логи Docker и временные загрузки.`,
    );
  }
  if (snapshot.runtime.processUptimeSec < 120) {
    recs.push(
      `Процесс недавно перезапускался (uptime ${Math.round(snapshot.runtime.processUptimeSec)} с) — проверьте журнал на наличие крашей или свежего деплоя.`,
    );
  }
  if (recs.length === 0) {
    recs.push(
      'Ресурсы сервера (CPU, RAM, диск, Load Average) в норме. Критичных отклонений не обнаружено.',
    );
  }
  return recs;
}

export async function collectServerDiagnostics(): Promise<ServerDiagnosticResult> {
  const [cpuUsagePercent, disk] = await Promise.all([sampleCpuUsage(350), readDiskUsageK()]);
  const sysMem = readSystemMemoryInfo();
  const usedBytes = Math.max(0, sysMem.totalBytes - sysMem.availableBytes);

  const result: ServerDiagnosticResult = {
    timestamp: new Date().toISOString(),
    cpu: {
      usagePercent: cpuUsagePercent,
      sampledOverMs: 350,
    },
    memory: {
      totalBytes: sysMem.totalBytes,
      freeBytes: sysMem.availableBytes,
      usedBytes,
      usagePercent: sysMem.usagePercent,
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

  result.recommendations = buildDeterministicServerRecommendations(result);
  return result;
}
