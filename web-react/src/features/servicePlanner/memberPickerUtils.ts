export type ServicePlannerMemberOption = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  name: string;
  ministry_role?: string | null;
  ministry_direction?: string | null;
  app_role?: string;
};

export function normalizeMemberSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, 'е');
}

export function parseMinistryRoles(raw: string | null | undefined): string[] {
  return String(raw ?? '')
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function formatServicePlannerMemberLabel(member: Pick<ServicePlannerMemberOption, 'id' | 'first_name' | 'last_name' | 'name'>): string {
  const full = `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim();
  return full || member.name || `Пользователь #${member.id}`;
}

export function formatServicePlannerMemberSubtitle(member: ServicePlannerMemberOption): string | null {
  const parts: string[] = [];
  const roles = parseMinistryRoles(member.ministry_role);
  if (roles.length > 0) parts.push(roles.join(', '));
  const direction = String(member.ministry_direction ?? '').trim();
  if (direction) parts.push(direction);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function getServicePlannerMemberInitials(member: ServicePlannerMemberOption): string {
  const label = formatServicePlannerMemberLabel(member);
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  return label.slice(0, 2).toUpperCase();
}

export function memberMatchesSearch(member: ServicePlannerMemberOption, query: string): boolean {
  const q = normalizeMemberSearchText(query);
  if (!q) return true;

  const label = normalizeMemberSearchText(formatServicePlannerMemberLabel(member));
  if (label.includes(q)) return true;

  const roles = parseMinistryRoles(member.ministry_role)
    .map(normalizeMemberSearchText)
    .join(' ');
  if (roles.includes(q)) return true;

  const direction = normalizeMemberSearchText(String(member.ministry_direction ?? ''));
  if (direction.includes(q)) return true;

  if (String(member.id).includes(q)) return true;

  return false;
}

export function sortServicePlannerMembers(a: ServicePlannerMemberOption, b: ServicePlannerMemberOption): number {
  return formatServicePlannerMemberLabel(a).localeCompare(formatServicePlannerMemberLabel(b), 'ru', {
    sensitivity: 'base',
  });
}

export function filterServicePlannerMembers(
  members: ServicePlannerMemberOption[],
  query: string,
): ServicePlannerMemberOption[] {
  return members.filter((member) => memberMatchesSearch(member, query)).sort(sortServicePlannerMembers);
}
