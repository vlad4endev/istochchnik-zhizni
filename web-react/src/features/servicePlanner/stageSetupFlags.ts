export const STAGE_SETUP_REMOVE_MIC_STANDS_KEY = 'remove_mic_stands';
export const STAGE_SETUP_REMOVE_PULPITS_KEY = 'remove_pulpits';

export function isStageSetupFlagEnabled(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

/** Строки для итоговой программы (публичная ссылка, печать, превью). */
export function stageSetupProgramLines(contentJson: Record<string, unknown> | null | undefined): string[] {
  const cj = contentJson ?? {};
  const lines: string[] = [];
  if (isStageSetupFlagEnabled(cj[STAGE_SETUP_REMOVE_MIC_STANDS_KEY])) {
    lines.push('Убираем микрофонные стойки');
  }
  if (isStageSetupFlagEnabled(cj[STAGE_SETUP_REMOVE_PULPITS_KEY])) {
    lines.push('Убираем пюпитры');
  }
  return lines;
}

export function readStageSetupFlags(contentJson: Record<string, unknown> | null | undefined): {
  removeMicStands: boolean;
  removePulpits: boolean;
} {
  const cj = contentJson ?? {};
  return {
    removeMicStands: isStageSetupFlagEnabled(cj[STAGE_SETUP_REMOVE_MIC_STANDS_KEY]),
    removePulpits: isStageSetupFlagEnabled(cj[STAGE_SETUP_REMOVE_PULPITS_KEY]),
  };
}

export function patchStageSetupFlags(
  contentJson: Record<string, unknown>,
  patch: Partial<{ removeMicStands: boolean; removePulpits: boolean }>,
): Record<string, unknown> {
  const next = { ...contentJson };
  if (patch.removeMicStands !== undefined) {
    if (patch.removeMicStands) next[STAGE_SETUP_REMOVE_MIC_STANDS_KEY] = true;
    else delete next[STAGE_SETUP_REMOVE_MIC_STANDS_KEY];
  }
  if (patch.removePulpits !== undefined) {
    if (patch.removePulpits) next[STAGE_SETUP_REMOVE_PULPITS_KEY] = true;
    else delete next[STAGE_SETUP_REMOVE_PULPITS_KEY];
  }
  return next;
}
