export function normalizeMinistryToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е');
}

export function parseMinistryRoles(value: unknown): string[] {
  return Array.from(
    new Set(
      String(value ?? '')
        .split(/[;,]/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0),
    ),
  );
}

/** Совпадение с галочкой роли в карточке участника (ministry_role). */
export function memberHasMinistryRole(ministryRole: unknown, matchRole: unknown): boolean {
  const target = normalizeMinistryToken(matchRole);
  if (!target) return false;
  return parseMinistryRoles(ministryRole).some((part) => {
    const p = normalizeMinistryToken(part);
    if (!p) return false;
    if (p === target) return true;
    return p.includes(target) || target.includes(p);
  });
}

export function isMediaManager(ministryRole: unknown): boolean {
  return parseMinistryRoles(ministryRole).some((part) => {
    const p = normalizeMinistryToken(part);
    return p.includes('медиа менеджер');
  });
}

export function isMusicLeader(ministryRole: unknown): boolean {
  return MUSIC_LEADER_ROLE_ALIASES.some((alias) => memberHasMinistryRole(ministryRole, alias));
}

const MUSIC_LEADER_ROLE_ALIASES = [
  'Музыкальный лидер',
  'Лидер Прославления',
  'Лидер поклонения',
] as const;

function isWorshipLeaderScheduleRole(role: {
  name: string;
  ministry_role_filter?: string | null;
}): boolean {
  const tokens = [role.name, role.ministry_role_filter]
    .map((v) => normalizeMinistryToken(v))
    .filter((v) => v.length > 0);
  return tokens.some(
    (t) => t.includes('лидер') && (t.includes('прослав') || t.includes('поклон') || t.includes('музык')),
  );
}

export function musicRoleMemberMatchToken(role: {
  name: string;
  ministry_role_filter?: string | null;
}): string {
  const custom = role.ministry_role_filter?.trim();
  return custom || role.name.trim();
}

/** Токены для фильтра участников при назначении на слот (с синонимами лидера прославления). */
export function musicRoleMemberMatchTokens(role: {
  name: string;
  ministry_role_filter?: string | null;
}): string[] {
  const primary = musicRoleMemberMatchToken(role);
  if (!isWorshipLeaderScheduleRole(role)) {
    return [primary];
  }
  return Array.from(new Set([primary, ...MUSIC_LEADER_ROLE_ALIASES]));
}

/** Направление служения «Медиа служение» (или другое с «медиа» в названии). */
export function hasMediaMinistryDirection(ministryDirection: unknown): boolean {
  const v = normalizeMinistryToken(ministryDirection);
  if (!v) return false;
  const target = normalizeMinistryToken('Медиа служение');
  return v
    .split(/[;,]/)
    .map((s) => normalizeMinistryToken(s))
    .some((s) => s === target || s.includes('медиа'));
}

export function hasMusicMinistryDirection(ministryDirection: unknown): boolean {
  const v = normalizeMinistryToken(ministryDirection);
  if (!v) return false;
  const target = normalizeMinistryToken('Музыкальное служение');
  return v
    .split(/[;,]/)
    .map((s) => normalizeMinistryToken(s))
    .some((s) => s === target || s.includes('музык') || target.includes(s));
}

export function mediaRoleMemberMatchToken(role: {
  name: string;
  ministry_role_filter?: string | null;
}): string {
  const custom = role.ministry_role_filter?.trim();
  return custom || role.name.trim();
}
