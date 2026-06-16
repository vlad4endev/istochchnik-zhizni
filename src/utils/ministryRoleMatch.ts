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

export function mediaRoleMemberMatchToken(role: {
  name: string;
  ministry_role_filter?: string | null;
}): string {
  const custom = role.ministry_role_filter?.trim();
  return custom || role.name.trim();
}
