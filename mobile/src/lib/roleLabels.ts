export function roleLabelRu(role: string): string {
  const r = role.trim().toLowerCase();
  const map: Record<string, string> = {
    admin: 'Администратор',
    pastor: 'Пастор',
    minister: 'Служитель',
    musician: 'Музыкант',
    editor: 'Редактор',
    parishioner: 'Прихожанин',
    member: 'Член церкви',
  };
  return map[r] ?? role;
}
