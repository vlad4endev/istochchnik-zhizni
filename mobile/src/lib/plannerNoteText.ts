const EMPTY_LABEL_LINE =
  /^(Читает|Чтец|Исполнитель|Автор|Тема стиха|Тема|Писание|Заметка)\s*:\s*$/iu;

const INTERNAL_WEEK_KEY_LINE = /^(schedule_week_|birthday_week_)[a-z0-9_]*$/i;

const BOUNDARY_KEYS = [
  'schedule_week_start',
  'schedule_week_end',
  'birthday_week_start',
  'birthday_week_end',
] as const;

export function stripInternalPlannerMetadataLines(
  raw: string,
  contentJson?: Record<string, unknown>,
): string {
  const boundaryDates = new Set<string>();
  if (contentJson) {
    for (const k of BOUNDARY_KEYS) {
      const v = contentJson[k];
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
        boundaryDates.add(v.trim());
      }
    }
  }
  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t && INTERNAL_WEEK_KEY_LINE.test(t)) continue;
    if (t && boundaryDates.has(t)) continue;
    out.push(line);
  }
  return out.join('\n').trim();
}

export function meaningfulNoteLinesFromRaw(
  raw: string,
  contentJson?: Record<string, unknown>,
): string {
  const stripped = stripInternalPlannerMetadataLines(raw, contentJson);
  if (!stripped.trim()) return '';
  const lines = stripped.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (EMPTY_LABEL_LINE.test(t)) continue;
    out.push(t);
  }
  return out.join('\n').trim();
}
