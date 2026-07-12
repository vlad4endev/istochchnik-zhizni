export function normalizeMinistryToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ');
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

export function isMediaManager(ministryRole: unknown): boolean {
  return memberHasMinistryRole(ministryRole, 'Медиа менеджер');
}

export function hasMediaMinistryDirection(ministryDirection: unknown): boolean {
  const v = normalizeMinistryToken(ministryDirection);
  if (!v) return false;
  const target = normalizeMinistryToken('Медиа служение');
  return v
    .split(/[;,]/)
    .map((s) => normalizeMinistryToken(s))
    .some((s) => s === target || s.includes('медиа'));
}
