export const STAGE_SETUP_REMOVE_MIC_STANDS_KEY = 'remove_mic_stands';
export const STAGE_SETUP_REMOVE_PULPITS_KEY = 'remove_pulpits';
export const STAGE_SETUP_PLACE_EQUIPMENT_KEY = 'place_mic_and_pulpits';

export const STAGE_SETUP_PROGRAM_MARK_REMOVE = '❌';
export const STAGE_SETUP_PROGRAM_MARK_PLACE = '🎤';

export type StageSetupDisplayLine = { mark: 'remove' | 'place'; text: string };

export function isStageSetupFlagEnabled(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true';
}

export function isRemoveEquipmentMode(contentJson: Record<string, unknown> | null | undefined): boolean {
  const cj = contentJson ?? {};
  return (
    isStageSetupFlagEnabled(cj[STAGE_SETUP_REMOVE_MIC_STANDS_KEY]) &&
    isStageSetupFlagEnabled(cj[STAGE_SETUP_REMOVE_PULPITS_KEY])
  );
}

export function isPlaceEquipmentMode(contentJson: Record<string, unknown> | null | undefined): boolean {
  return isStageSetupFlagEnabled(contentJson?.[STAGE_SETUP_PLACE_EQUIPMENT_KEY]);
}

export function stageSetupDisplayLines(
  contentJson: Record<string, unknown> | null | undefined,
): StageSetupDisplayLine[] {
  const cj = contentJson ?? {};
  if (isPlaceEquipmentMode(cj)) {
    return [{ mark: 'place', text: 'Выставляем микрофоны и пюпитры' }];
  }
  const lines: StageSetupDisplayLine[] = [];
  if (isStageSetupFlagEnabled(cj[STAGE_SETUP_REMOVE_MIC_STANDS_KEY])) {
    lines.push({ mark: 'remove', text: 'Убираем микрофонные стойки' });
  }
  if (isStageSetupFlagEnabled(cj[STAGE_SETUP_REMOVE_PULPITS_KEY])) {
    lines.push({ mark: 'remove', text: 'Убираем пюпитры' });
  }
  return lines;
}

export function stageSetupProgramLineText(line: StageSetupDisplayLine): string {
  const mark = line.mark === 'place' ? STAGE_SETUP_PROGRAM_MARK_PLACE : STAGE_SETUP_PROGRAM_MARK_REMOVE;
  return `${mark} ${line.text}`;
}

/** Строки для печати и текстовых списков. */
export function stageSetupProgramLines(contentJson: Record<string, unknown> | null | undefined): string[] {
  return stageSetupDisplayLines(contentJson).map(stageSetupProgramLineText);
}

export function readStageSetupFlags(contentJson: Record<string, unknown> | null | undefined): {
  removeEquipment: boolean;
  placeEquipment: boolean;
} {
  return {
    removeEquipment: isRemoveEquipmentMode(contentJson),
    placeEquipment: isPlaceEquipmentMode(contentJson),
  };
}

export function patchStageSetupRemoveEquipment(
  contentJson: Record<string, unknown>,
  enabled: boolean,
): Record<string, unknown> {
  const next = { ...contentJson };
  if (enabled) {
    next[STAGE_SETUP_REMOVE_MIC_STANDS_KEY] = true;
    next[STAGE_SETUP_REMOVE_PULPITS_KEY] = true;
    delete next[STAGE_SETUP_PLACE_EQUIPMENT_KEY];
  } else {
    delete next[STAGE_SETUP_REMOVE_MIC_STANDS_KEY];
    delete next[STAGE_SETUP_REMOVE_PULPITS_KEY];
  }
  return next;
}

export function patchStageSetupPlaceEquipment(
  contentJson: Record<string, unknown>,
  enabled: boolean,
): Record<string, unknown> {
  const next = { ...contentJson };
  if (enabled) {
    next[STAGE_SETUP_PLACE_EQUIPMENT_KEY] = true;
    delete next[STAGE_SETUP_REMOVE_MIC_STANDS_KEY];
    delete next[STAGE_SETUP_REMOVE_PULPITS_KEY];
  } else {
    delete next[STAGE_SETUP_PLACE_EQUIPMENT_KEY];
  }
  return next;
}
