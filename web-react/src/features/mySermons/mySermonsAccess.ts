/** Shared access check for «Мои проповеди» (mirrors backend gate). */
export function canAccessMySermons(
  appRole: string | null | undefined,
  ministryRole: string | null | undefined,
  appRoles?: Array<string | null | undefined>,
): boolean {
  const roles = Array.from(
    new Set(
      (Array.isArray(appRoles) && appRoles.length > 0 ? appRoles : [appRole]).map((r) =>
        String(r ?? '')
          .trim()
          .toLowerCase(),
      ),
    ),
  );
  if (roles.includes('pastor') || roles.includes('admin')) return true;

  const normalize = (v: string) =>
    v
      .trim()
      .toLowerCase()
      .replace(/ё/g, 'е');
  const target = normalize('Проповедник');
  if (!target) return false;
  return String(ministryRole ?? '')
    .split(/[;,]/)
    .map((s) => normalize(s))
    .filter((s) => s.length > 0)
    .some((s) => s === target || s.includes(target) || target.includes(s));
}
