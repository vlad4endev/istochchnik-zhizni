import fs from 'node:fs/promises';
import path from 'node:path';
import { ProjectScanResult } from '../types';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeExt(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return ext || '[no-ext]';
}

async function readLineCount(filePath: string): Promise<number> {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    if (!data) return 0;
    return data.split('\n').length;
  } catch {
    return 0;
  }
}

export function resolveSafeScanDir(rootDir: string, unsafeSubdir?: string): string {
  const target = unsafeSubdir ? path.resolve(rootDir, unsafeSubdir) : rootDir;
  const rootWithSep = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`;
  if (target !== rootDir && !target.startsWith(rootWithSep)) {
    throw new Error('Invalid scan path: path traversal detected');
  }
  return target;
}

export async function scanProject(targetDir: string): Promise<ProjectScanResult> {
  const rootDir = process.cwd();
  const byExtension: Record<string, number> = {};
  const largestFiles: Array<{ path: string; sizeBytes: number; lines: number }> = [];
  let filesScanned = 0;
  let directoriesScanned = 0;
  let linesOfCode = 0;

  async function walk(currentDir: string): Promise<void> {
    directoriesScanned += 1;
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env' && entry.name !== '.env.example') {
        if (entry.isDirectory()) continue;
      }
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;

      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      filesScanned += 1;
      const ext = normalizeExt(entry.name);
      byExtension[ext] = (byExtension[ext] ?? 0) + 1;

      const stat = await fs.stat(fullPath);
      const lines = await readLineCount(fullPath);
      linesOfCode += lines;
      largestFiles.push({
        path: path.relative(rootDir, fullPath),
        sizeBytes: stat.size,
        lines,
      });
    }
  }

  await walk(targetDir);

  const packagePath = path.join(rootDir, 'package.json');
  let packageDependenciesCount = 0;
  let packageDevDependenciesCount = 0;
  try {
    const pkgRaw = await fs.readFile(packagePath, 'utf8');
    const pkg = JSON.parse(pkgRaw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    packageDependenciesCount = Object.keys(pkg.dependencies ?? {}).length;
    packageDevDependenciesCount = Object.keys(pkg.devDependencies ?? {}).length;
  } catch {
    // ignore package read errors
  }

  const topLargestFiles = largestFiles
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, 10);

  return {
    timestamp: new Date().toISOString(),
    rootDir,
    scannedDir: targetDir,
    filesScanned,
    directoriesScanned,
    linesOfCode,
    byExtension,
    hasTests:
      (await exists(path.join(rootDir, 'test'))) ||
      (await exists(path.join(rootDir, 'tests'))) ||
      (await exists(path.join(rootDir, '__tests__'))),
    hasDocker: (await exists(path.join(rootDir, 'Dockerfile'))) || (await exists(path.join(rootDir, 'docker-compose.yml'))),
    hasGitignore: await exists(path.join(rootDir, '.gitignore')),
    hasEnvExample: (await exists(path.join(rootDir, '.env.example'))) || (await exists(path.join(rootDir, '.env.local.example'))),
    packageDependenciesCount,
    packageDevDependenciesCount,
    topLargestFiles,
  };
}
