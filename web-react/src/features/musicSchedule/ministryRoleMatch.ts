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

export function isMusicManager(ministryRole: unknown): boolean {
  return parseMinistryRoles(ministryRole).some((part) => {
    const p = normalizeMinistryToken(part);
    return p.includes('музыкальный менеджер') || p.includes('лидер поклонения');
  });
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

export function musicRoleMemberMatchToken(role: {
  name: string;
  ministry_role_filter?: string | null;
}): string {
  const custom = role.ministry_role_filter?.trim();
  return custom || role.name.trim();
}
